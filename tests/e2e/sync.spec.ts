import { expect, test, type Page } from '@playwright/test'
import { roomBox } from '../../src/domain/geometryEdit'
import type { Apartment } from '../../src/domain/types'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 11: план и 3D активной комнаты читают одни данные (SPEC §10, AC-06/07).
const apt = (): Apartment => buildApartment(templateById('1b')!)
const room = (name: string) => Object.values(apt().rooms).find((r) => r.name === name)!

async function openInterior(page: Page, roomName = 'Комната') {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await enter(page, roomName)
}

async function enter(page: Page, roomName: string) {
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), room(roomName).id)
  await expect(page.getByTestId('active-room')).toHaveText(roomName)
  await page.waitForTimeout(400)
}

const furniture = (page: Page) => page.evaluate(() => (window as any).__interior.project.getState().history.present.furniture as Record<string, any>)
const scenePos = (page: Page, id: string) => page.evaluate((i) => (window as any).__interior.scenePosition(i) as { xCm: number; zCm: number; angleDeg: number } | null, id)
const planTransform = async (page: Page, id: string) => {
  const t = (await page.getByTestId(`plan-item-${id}`).locator('g').first().getAttribute('transform')) ?? ''
  const m = /translate\(([-\d.e]+) ([-\d.e]+)\) rotate\(([-\d.e]+)\)/.exec(t)!
  return { xCm: Number(m[1]), zCm: Number(m[2]), angleDeg: -Number(m[3]) }
}
const norm = (d: number) => ((Math.round(d) % 360) + 360) % 360

async function addChair(page: Page) {
  await page.getByTestId('add-dining_chair_02').click()
  const f = await furniture(page)
  const id = Object.keys(f)[0]
  await expect(page.getByTestId(`plan-item-${id}`)).toBeVisible()
  await page.waitForFunction((i) => (window as any).__interior.scenePosition(i) !== null, id)
  await waitModel(page, id)
  return id
}

/** Одинаковы ли координаты и угол предмета в проекте, на плане и в 3D. */
async function expectSame(page: Page, id: string) {
  const p = (await furniture(page))[id]
  const plan = await planTransform(page, id)
  const sc = (await scenePos(page, id))!
  expect(plan.xCm).toBeCloseTo(p.xCm, 3)
  expect(plan.zCm).toBeCloseTo(p.zCm, 3)
  expect(sc.xCm).toBeCloseTo(p.xCm, 1)
  expect(sc.zCm).toBeCloseTo(p.zCm, 1)
  expect(norm(plan.angleDeg)).toBe(norm(p.angleDeg))
  expect(norm(sc.angleDeg)).toBe(norm(p.angleDeg))
}

/** Экранные координаты предмета в 3D. */
const itemScreen3d = (page: Page, id: string) => page.evaluate((i) => {
  const probe = (window as any).__interior.probe
  let group: any = null
  probe.scene.traverse((o: any) => { if (o.name === `furniture-${i}`) group = o })
  // Центр габарита модели в мировых координатах: нажатие приходится на сам предмет, а не на пол между ножками.
  let mesh: any = null
  group.traverse((o: any) => { if (!mesh && o.isMesh && o.name !== 'model-loading') mesh = o })
  mesh.geometry.computeBoundingBox()
  const c = mesh.geometry.boundingBox.getCenter(new group.position.constructor())
  const v = mesh.localToWorld(c).project(probe.camera)
  const r = probe.gl.domElement.getBoundingClientRect()
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
}, id)

/** Подсветка выбранного предмета: у загруженной модели свои материалы с emissiveIntensity. */
const emissive3d = (page: Page, id: string) => page.evaluate((i) => {
  let v = -1
  ;(window as any).__interior.probe.scene.traverse((o: any) => {
    if (o.name === `furniture-${i}`) o.traverse((m: any) => { if (m.isMesh && m.material?.emissiveIntensity !== undefined) v = Math.max(v, m.material.emissiveIntensity) })
  })
  return v
}, id)

/** Ждёт, пока вместо бледного объёма загрузки появится настоящая модель. */
const waitModel = (page: Page, id: string) => page.waitForFunction((i) => {
  let loaded = false
  ;(window as any).__interior.probe.scene.traverse((o: any) => {
    if (o.name === `furniture-${i}`) o.traverse((m: any) => { if (m.isMesh && m.name !== 'model-loading' && m.name !== 'model-error') loaded = true })
  })
  return loaded
}, id)

test('11.1: план показывает активную комнату крупно, кнопка даёт всю квартиру, нажатие на комнату переводит и план, и 3D', async ({ page }) => {
  await openInterior(page)
  const scale = async () => parseFloat(((await page.getByTestId('interior-plan-scale').textContent()) ?? '0'))
  const roomScale = await scale()
  await page.getByTestId('plan-mode').click()
  await expect.poll(scale).toBeLessThan(roomScale)
  await page.getByTestId('plan-mode').click()
  await expect.poll(scale).toBeCloseTo(roomScale, 2)
  // Остальные комнаты приглушены и выбираются нажатием.
  const kitchen = room('Кухня')
  await expect(page.getByTestId(`pick-room-${kitchen.id}`)).toBeVisible()
  await expect(page.getByTestId(`pick-room-${room('Комната').id}`)).toHaveCount(0)
  await page.getByTestId('plan-mode').click() // вся квартира: кухня видна целиком
  await page.getByTestId(`pick-room-${kitchen.id}`).click()
  await expect(page.getByTestId('active-room')).toHaveText('Кухня')
  const names = await page.evaluate(() => { const n: string[] = []; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name?.startsWith('floor-')) n.push(o.name) }); return n })
  expect(names).toEqual([`floor-${kitchen.id}`])
})

test('11.2: добавление, выбор, перенос и поворот совпадают на плане и в 3D', async ({ page }) => {
  await openInterior(page)
  const id = await addChair(page)
  await expectSame(page, id)
  expect(await emissive3d(page, id)).toBeGreaterThan(0) // добавленный предмет выбран и подсвечен в 3D
  await expect(page.getByTestId('selection')).toContainText('Стул')

  // Снять выбор в 3D (клик в пустое место) → план перестаёт показывать выбор.
  await page.getByTestId('interior-scene').click({ position: { x: 5, y: 5 } })
  await expect(page.getByTestId('selection')).toHaveText('Предмет не выбран')
  expect(await emissive3d(page, id)).toBe(0)

  // Выбрать на плане → подсветка в 3D.
  await page.getByTestId(`plan-item-${id}`).click()
  await expect(page.getByTestId('selection')).toContainText('Стул')
  expect(await emissive3d(page, id)).toBeGreaterThan(0)

  // Перенос на плане.
  const box = (await page.getByTestId(`plan-item-${id}`).boundingBox())!
  const x0 = box.x + box.width / 2, y0 = box.y + box.height / 2
  const before = (await furniture(page))[id]
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + 40, y0 + 30, { steps: 6 })
  await page.mouse.up()
  const moved = (await furniture(page))[id]
  expect(moved.xCm !== before.xCm || moved.zCm !== before.zCm).toBe(true)
  await expectSame(page, id)

  // Поворот клавишей: один угол в проекте, на плане и в 3D.
  await page.keyboard.press('r')
  expect((await furniture(page))[id].angleDeg).toBe(90)
  await expectSame(page, id)
  // Точный шаг: Alt+R — 15°.
  await page.keyboard.press('Alt+r')
  expect((await furniture(page))[id].angleDeg).toBe(105)
  await expectSame(page, id)

  // Перенос в 3D.
  const s = await itemScreen3d(page, id)
  const p0 = (await furniture(page))[id]
  await page.mouse.move(s.x, s.y)
  await page.mouse.down()
  await page.mouse.move(s.x + 40, s.y + 10, { steps: 6 })
  await page.mouse.up()
  const p1 = (await furniture(page))[id]
  expect(p1.xCm !== p0.xCm || p1.zCm !== p0.zCm).toBe(true)
  await expectSame(page, id)

  // Отмена возвращает прежнее положение в обоих видах.
  await page.getByTestId('undo').click()
  expect((await furniture(page))[id].xCm).toBe(p0.xCm)
  await expectSame(page, id)
})

test('11.2: недопустимый перенос не меняет проект ни в одном из видов', async ({ page }) => {
  await openInterior(page)
  const id = await addChair(page)
  const before = JSON.stringify(await furniture(page))
  const box = (await page.getByTestId(`plan-item-${id}`).boundingBox())!
  const x0 = box.x + box.width / 2, y0 = box.y + box.height / 2
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 - 600, y0 - 400, { steps: 6 })
  await expect(page.getByTestId('reason')).toBeVisible()
  await page.mouse.up()
  expect(JSON.stringify(await furniture(page))).toBe(before)
  await expect(page.getByTestId('message')).toBeVisible()
  await expectSame(page, id)
})

test('11.3: после изменения геометрии план и 3D перестроены, лишних предметов и старых контуров нет', async ({ page }) => {
  await openInterior(page)
  const id = await addChair(page)
  const living = room('Комната')
  const a = apt()
  const w = Math.round(roomBox(a, living).widthCm)
  await page.getByTestId('back-to-setup').click()
  // Общая стена между комнатой и кухней: сдвиг на +30 см.
  const wall = a.rooms[room('Кухня').id].boundary
    .map((b) => a.walls[b.wallId])
    .filter((x) => a.vertices[x.startVertexId].xCm === a.vertices[x.endVertexId].xCm)
    .sort((p, q) => a.vertices[p.startVertexId].xCm - a.vertices[q.startVertexId].xCm)[0]
  await page.getByTestId(`pick-wall-${wall.id}`).click()
  await page.getByTestId(`size-${living.id}`).fill(String(w + 30))
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('notice')).toContainText('Стена сдвинута')
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await enter(page, 'Комната')
  // Размер на плане новый; предмет один и на плане, и в 3D, и в проекте.
  await expect(page.getByTestId(`plan-dim-w-${living.id}`)).toContainText(String(w + 30))
  await expect(page.locator('[data-testid^="plan-item-"]')).toHaveCount(1)
  expect(Object.keys(await furniture(page))).toEqual([id])
  const count3d = () => page.evaluate(() => { let n = 0; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name?.startsWith('furniture-')) n++ }); return n })
  expect(await count3d()).toBe(1)
  await expectSame(page, id)
  // Переходы туда и обратно не оставляют лишнего: в чужой комнате предмета в 3D нет, на плане он приглушён.
  await enter(page, 'Кухня')
  expect(await count3d()).toBe(0)
  await expect(page.locator('[data-testid^="plan-item-"]')).toHaveCount(1)
  await expect(page.getByTestId(`plan-item-${id}`)).toHaveAttribute('data-room', living.id)
  await enter(page, 'Комната')
  expect(await count3d()).toBe(1)
  await expectSame(page, id)
  // Замена схемы очищает проект: старой мебели и старых контуров нет.
  await page.getByTestId('back-to-setup').click()
  await page.getByTestId('back-to-schemes').click()
  await page.getByTestId('choose-1v').click()
  await page.getByTestId('replace-confirm').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await expect(page.locator('[data-testid^="plan-item-"]')).toHaveCount(0)
  expect(await count3d()).toBe(0)
})
