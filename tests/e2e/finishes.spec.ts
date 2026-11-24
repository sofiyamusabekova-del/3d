import { expect, test, type Page } from '@playwright/test'
import { WALLPAPERS, MATERIALS } from '../../src/catalog/materials'
import { neighbourRooms, roomSides } from '../../src/domain/finishes'
import { roomBox } from '../../src/domain/geometryEdit'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 12: отделка стен (SPEC §13, AC-11).
const apt = () => buildApartment(templateById('1b')!)
const room = (name: string) => Object.values(apt().rooms).find((r) => r.name === name)!
/** Сторона комнаты у общей стены: именно её красим, чтобы проверить независимость сторон. */
const sharedSide = (name: string) => {
  const a = apt()
  const r = room(name)
  return { a, r, side: roomSides(a, r.id).find((s) => neighbourRooms(a, s).length > 0)! }
}

async function openInterior(page: Page, name = 'Комната') {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await enter(page, name)
}

async function enter(page: Page, name: string) {
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), room(name).id)
  await expect(page.getByTestId('active-room')).toHaveText(name)
  await page.waitForTimeout(400)
}

const surfaces = (page: Page) => page.evaluate(() => (window as any).__interior.project.getState().history.present.surfaceMaterials as Record<string, string>)

/** Свойства материала поверхности стены в 3D. */
const material3d = (page: Page, wallId: string) => page.evaluate((id) => {
  let out: any = null
  ;(window as any).__interior.probe.scene.traverse((o: any) => {
    if (o.name === `surface-${id}`) {
      const m = o.material
      out = { color: m.color.getHexString(), emissive: m.emissiveIntensity, hasMap: !!m.map, repeat: m.map ? [m.map.repeat.x, m.map.repeat.y] : null, loaded: m.map ? !!m.map.image : null, normal: !!m.normalMap }
    }
  })
  return out as { color: string; emissive: number; hasMap: boolean; repeat: number[] | null; loaded: boolean | null; normal: boolean } | null
}, wallId)

test('12.1: сторона выбирается в списке, на плане и в 3D; подсвечена в обоих видах', async ({ page }) => {
  const { side } = sharedSide('Комната')
  const wall = side.wallIds[0]
  await openInterior(page)
  await expect(page.getByTestId('finish-title')).toHaveCount(0)

  // Список.
  await page.getByTestId(`side-${side.index}`).click()
  await expect(page.getByTestId('finish-title')).toContainText('стена')
  await expect(page.getByTestId('finish-shared')).toContainText('другая сторона не меняется')
  await expect(page.getByTestId(`plan-surface-${room('Комната').id}-${wall}`)).toHaveAttribute('data-selected', 'true')
  expect((await material3d(page, wall))!.emissive).toBeGreaterThan(0)

  // Снять выбор нажатием в пустое место на плане.
  await page.getByTestId('interior-plan').click({ position: { x: 4, y: 40 } })
  await expect(page.getByTestId('finish-title')).toHaveCount(0)
  expect((await material3d(page, wall))!.emissive).toBe(0)

  // План: нажатие на полосу стороны.
  await page.getByTestId(`plan-surface-${room('Комната').id}-${wall}`).click({ force: true })
  await expect(page.getByTestId('finish-title')).toBeVisible()
  await page.getByTestId('interior-scene').click({ position: { x: 4, y: 4 } })
  await expect(page.getByTestId('finish-title')).toHaveCount(0)

  // 3D: нажатие на стену выше проёмов.
  const names = await page.evaluate(() => { const n: string[] = []; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name?.startsWith('surface-')) n.push(o.name.slice(8)) }); return n })
  expect(names.length).toBeGreaterThan(0)
  const target = names[0]
  const pt = await page.evaluate((id) => {
    const probe = (window as any).__interior.probe
    let mesh: any = null
    probe.scene.traverse((o: any) => { if (o.name === `surface-${id}`) mesh = o })
    mesh.geometry.computeBoundingBox()
    const b = mesh.geometry.boundingBox
    const v = new mesh.position.constructor((b.min.x + b.max.x) / 2, b.min.y + 0.93 * (b.max.y - b.min.y), (b.min.z + b.max.z) / 2).project(probe.camera)
    const r = probe.gl.domElement.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }, target)
  await page.mouse.click(pt.x, pt.y)
  await expect(page.getByTestId('finish-title')).toBeVisible()
  expect((await material3d(page, target))!.emissive).toBeGreaterThan(0)
})

test('12.3 (AC-11) и 12.6: краска меняет только выбранную сторону и сразу видна на плане и в 3D', async ({ page }) => {
  const { a, r, side } = sharedSide('Комната')
  const other = neighbourRooms(a, side)[0]
  const wall = side.wallIds[0]
  await openInterior(page)
  await page.getByTestId(`side-${side.index}`).click()
  await page.getByTestId('paint-paint_terracotta').click()
  await expect(page.getByTestId('finish-notice')).toContainText('Терракота')
  await expect(page.getByTestId('finish-current')).toHaveText('Терракота')
  const s = await surfaces(page)
  expect(Object.keys(s)).toEqual(side.wallIds.map((w) => `${w}|${r.id}`))
  expect(new Set(Object.values(s))).toEqual(new Set(['paint_terracotta']))
  // План и 3D показывают ту же краску.
  await expect(page.getByTestId(`plan-surface-${room('Комната').id}-${wall}`)).toHaveAttribute('data-color', MATERIALS.paint_terracotta.swatchHex!)
  expect((await material3d(page, wall))!.color).toBe(MATERIALS.paint_terracotta.colorHex!.slice(1))
  // Соседняя комната: сторона той же стены без отделки.
  await enter(page, apt().rooms[other].name)
  const otherSides = roomSides(a, other)
  const sharedWithLiving = otherSides.find((x) => x.wallIds.some((w) => side.wallIds.includes(w)))!
  await page.getByTestId(`side-${sharedWithLiving.index}`).click()
  await expect(page.getByTestId('finish-current')).toHaveText('без отделки')
  await expect(page.getByTestId(`plan-surface-${r.id}-${wall}`).first()).toBeVisible()
  expect(Object.keys(await surfaces(page))).toEqual(side.wallIds.map((w) => `${w}|${r.id}`))
  // Красим соседнюю сторону другим цветом: первая не меняется.
  await page.getByTestId('paint-paint_navy').click()
  await enter(page, 'Комната')
  await page.getByTestId(`side-${side.index}`).click()
  await expect(page.getByTestId('finish-current')).toHaveText('Терракота')
})

test('12.4: обои с физическим масштабом; после удлинения стены масштаб рисунка тот же, повторов больше', async ({ page }) => {
  const w = WALLPAPERS[0]
  const { a, r, side } = sharedSide('Комната')
  const wall = side.wallIds[0]
  const horiz = roomSides(a, r.id).find((s) => Math.abs(s.dir.x) > 0.9)!
  await openInterior(page)
  await page.getByTestId(`side-${horiz.index}`).click()
  await page.getByTestId(`wallpaper-${w.id}`).click()
  await expect(page.getByTestId('repeat-info')).toContainText('27,1')
  const hw = horiz.wallIds[0]
  await expect.poll(async () => (await material3d(page, hw))?.hasMap).toBe(true)
  await expect.poll(async () => (await material3d(page, hw))?.loaded).toBe(true)
  const m1 = (await material3d(page, hw))!
  expect(m1.repeat![0]).toBeCloseTo(1 / w.tileSizeCm!.widthCm, 6)
  expect(m1.repeat![1]).toBeCloseTo(1 / w.tileSizeCm!.heightCm, 6)
  expect(m1.normal).toBe(true)
  const info1 = (await page.getByTestId('repeat-info').textContent()) ?? ''

  // Удлиняем комнату: общая стена +30 см.
  const width = Math.round(roomBox(a, r).widthCm)
  await page.getByTestId('back-to-setup').click()
  await page.getByTestId(`pick-wall-${wall}`).click()
  await page.getByTestId(`size-${r.id}`).fill(String(width + 30))
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('notice')).toContainText('Стена сдвинута')
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await enter(page, 'Комната')
  await page.getByTestId(`side-${horiz.index}`).click()
  // Отделка сохранилась, масштаб в см прежний, число повторов выросло.
  await expect(page.getByTestId('finish-current')).toHaveText(w.name)
  await expect.poll(async () => (await material3d(page, hw))?.loaded).toBe(true)
  const m2 = (await material3d(page, hw))!
  expect(m2.repeat).toEqual(m1.repeat)
  const info2 = (await page.getByTestId('repeat-info').textContent()) ?? ''
  expect(info2).not.toBe(info1)
  const across = (t: string) => parseFloat(/повторяется ([\d,]+) ×/.exec(t)![1].replace(',', '.'))
  expect(across(info2)).toBeGreaterThan(across(info1))
})

test('12.5: отделка сохраняется при переходах, снимается и отменяется', async ({ page }) => {
  const { side } = sharedSide('Комната')
  const wall = side.wallIds[0]
  await openInterior(page)
  await page.getByTestId(`side-${side.index}`).click()
  await page.getByTestId('paint-paint_sage').click()
  const saved = JSON.stringify(await surfaces(page))
  for (let i = 0; i < 3; i++) {
    await enter(page, 'Кухня')
    await enter(page, 'Комната')
  }
  expect(JSON.stringify(await surfaces(page))).toBe(saved)
  expect((await material3d(page, wall))!.color).toBe(MATERIALS.paint_sage.colorHex!.slice(1))
  await page.getByTestId(`side-${side.index}`).click()
  await page.getByTestId('finish-clear').click()
  expect(Object.keys(await surfaces(page))).toHaveLength(0)
  await expect(page.getByTestId(`plan-surface-${room('Комната').id}-${wall}`)).toHaveAttribute('data-color', '')
  await page.getByTestId('undo').click()
  expect(JSON.stringify(await surfaces(page))).toBe(saved)
  expect((await material3d(page, wall))!.color).toBe(MATERIALS.paint_sage.colorHex!.slice(1))
})

test('12.1: выбор стороны сбрасывается при смене комнаты и при выборе предмета', async ({ page }) => {
  const { side } = sharedSide('Комната')
  await openInterior(page)
  await page.getByTestId(`side-${side.index}`).click()
  await expect(page.getByTestId('finish-title')).toBeVisible()
  await page.getByTestId('add-dining_chair_02').click()
  await expect(page.getByTestId('finish-title')).toHaveCount(0)
  await page.getByTestId(`side-${side.index}`).click()
  await expect(page.getByTestId('finish-title')).toBeVisible()
  await enter(page, 'Кухня')
  await expect(page.getByTestId('finish-title')).toHaveCount(0)
})
