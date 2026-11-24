import { expect, test, type Page } from '@playwright/test'
import { roomsOfWall } from '../../src/domain/doors'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 10: 3D активной комнаты и навигация (SPEC §10.2, AC-05).
const apt = () => buildApartment(templateById('1b')!)
const doors = () => Object.values(apt().openings).filter((o) => o.kind === 'door')
const inner = () => doors().filter((d) => roomsOfWall(apt(), d.wallId).length === 2)
const entrance = () => doors().find((d) => roomsOfWall(apt(), d.wallId).length === 1)!

async function openInterior(page: Page) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await expect(page.getByTestId('active-room')).toBeVisible()
  await page.waitForFunction(() => (window as any).__interior?.probe.visibleHoles.length > 0)
}

/** Имена комнат и проёмов в 3D-сцене по именам объектов. */
const sceneNames = (page: Page) => page.evaluate(() => {
  const names: string[] = []
  ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.name) names.push(o.name) })
  return names
})

/** Экранные координаты центра области нажатия проёма. */
const holeScreen = (page: Page, openingId: string) => page.evaluate((id) => {
  const probe = (window as any).__interior.probe
  let mesh: any = null
  probe.scene.traverse((o: any) => { if (o.name === `hole-${id}`) mesh = o })
  if (!mesh) return null
  mesh.geometry.computeBoundingBox()
  const v = mesh.geometry.boundingBox.getCenter(new mesh.position.constructor()).project(probe.camera)
  const r = probe.gl.domElement.getBoundingClientRect()
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
}, openingId)

const roomName = async (page: Page) => (await page.getByTestId('active-room').textContent()) ?? ''

test('10.1: в 3D ровно одна комната: пол и стены только активной', async ({ page }) => {
  await openInterior(page)
  const names = await sceneNames(page)
  expect(names.filter((n) => n.startsWith('floor-'))).toHaveLength(1)
  const a = apt()
  const active = await page.evaluate(() => (window as any).__interior.store.getState().activeRoomId as string)
  expect(names).toContain(`floor-${active}`)
  const allowed = new Set(a.rooms[active].boundary.map((b) => `wall-${b.wallId}`))
  for (const n of names.filter((x) => x.startsWith('wall-'))) expect(allowed.has(n), n).toBe(true)
})

test('10.3: вращение и приближение работают, ближние стены скрыты', async ({ page }) => {
  await openInterior(page)
  const cam = () => page.evaluate(() => (window as any).__interior.probe.camera.position.toArray() as number[])
  const before = await cam()
  const canvas = page.getByTestId('interior-scene')
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.8
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 120, cy, { steps: 8 })
  await page.mouse.up()
  const rotated = await cam()
  expect(rotated).not.toEqual(before)
  const dist = (p: number[]) => Math.hypot(p[0], p[1], p[2])
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(200)
  expect(dist(await cam())).not.toBeCloseTo(dist(rotated), 1)
  const hidden = await page.evaluate(() => (window as any).__interior.probe.hiddenWalls as string[])
  expect(hidden.length).toBeGreaterThanOrEqual(1)
})

test('10.4: переход через дверь в 3D туда и обратно; входная дверь ведёт наружу', async ({ page }) => {
  await openInterior(page)
  const d = inner()[0]
  const [r1, r2] = roomsOfWall(apt(), d.wallId)
  const a = apt()
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), r1)
  await expect(page.getByTestId('active-room')).toHaveText(a.rooms[r1].name)
  await page.waitForFunction((id) => (window as any).__interior.probe.visibleHoles.includes(id), d.id)
  const p1 = (await holeScreen(page, d.id))!
  await page.mouse.click(p1.x, p1.y)
  await expect(page.getByTestId('active-room')).toHaveText(a.rooms[r2].name)
  await page.waitForFunction((id) => (window as any).__interior.probe.visibleHoles.includes(id), d.id)
  const p2 = (await holeScreen(page, d.id))!
  await page.mouse.click(p2.x, p2.y)
  await expect(page.getByTestId('active-room')).toHaveText(a.rooms[r1].name)

  const e = entrance()
  const er = roomsOfWall(a, e.wallId)[0]
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), er)
  await page.getByTestId(`go-${e.id}`).click()
  await expect(page.getByTestId('active-room')).toHaveText(a.rooms[er].name)
  await expect(page.getByTestId('notice')).toContainText('наружу')
})

test('10.4: кнопки дверей в панели проходят по всем внутренним дверям туда и обратно', async ({ page }) => {
  await openInterior(page)
  const a = apt()
  for (const d of inner()) {
    const [r1, r2] = roomsOfWall(a, d.wallId)
    await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), r1)
    await page.getByTestId(`go-${d.id}`).click()
    await expect(page.getByTestId('active-room')).toHaveText(a.rooms[r2].name)
    await page.getByTestId(`go-${d.id}`).click()
    await expect(page.getByTestId('active-room')).toHaveText(a.rooms[r1].name)
  }
})

test('10.5: выбор сбрасывается при смене комнаты, скрытые стены не принимают нажатий', async ({ page }) => {
  await openInterior(page)
  const a = apt()
  const win = Object.values(a.openings).find((o) => o.kind === 'window')!
  const wr = roomsOfWall(a, win.wallId)[0]
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), wr)
  await expect(page.getByTestId('active-room')).toHaveText(a.rooms[wr].name)
  await page.waitForTimeout(500) // сцена перестроена под новую комнату
  const visible = (await sceneNames(page)).includes(`hole-${win.id}`)
  if (visible) {
    const p = (await holeScreen(page, win.id))!
    await page.mouse.click(p.x, p.y)
    await expect(page.getByTestId('selected-opening')).toContainText('окно')
  } else {
    await page.evaluate((id) => (window as any).__interior.store.getState().select(id), win.id)
    await expect(page.getByTestId('selected-opening')).toBeVisible()
  }
  const d = inner().find((x) => roomsOfWall(a, x.wallId).includes(wr))!
  await page.getByTestId(`go-${d.id}`).click()
  await expect(page.getByTestId('selected-opening')).toHaveCount(0)
  // Области нажатия есть только у проёмов видимых стен.
  const holes = await page.evaluate(() => {
    const names: string[] = []
    ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.name?.startsWith('hole-')) names.push(o.name.slice(5)) })
    return { names, visible: (window as any).__interior.probe.visibleHoles as string[] }
  })
  expect([...holes.names].sort()).toEqual([...holes.visible].sort())
})

test('10.6 (AC-05): мебель не теряется при переходах, память видеокарты не растёт', async ({ page }) => {
  await openInterior(page)
  const a = apt()
  const [r1, r2] = roomsOfWall(a, inner()[0].wallId)
  // Предметы добавляются обычным путём (с проверкой размещения) по одному в каждую из двух комнат.
  const addTo = async (roomId: string) => {
    await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), roomId)
    await page.getByTestId('catalog-scope-all').click() // стул не для прихожей: показываем весь каталог
    await page.getByTestId('add-dining_chair_02').click()
    return page.evaluate((id) => Object.values((window as any).__interior.project.getState().history.present.furniture as Record<string, any>).find((f: any) => f.roomId === id).id as string, roomId)
  }
  const f1 = await addTo(r1)
  const f2 = await addTo(r2)
  const snapshot = () => page.evaluate(() => JSON.stringify((window as any).__interior.project.getState().history.present))
  const saved = await snapshot()
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), r1)
  await expect(page.getByTestId('room-furniture')).toHaveText('1')
  expect(await sceneNames(page)).toContain(`furniture-${f1}`)
  expect(await sceneNames(page)).not.toContain(`furniture-${f2}`)
  await page.waitForTimeout(300)
  const base = await page.evaluate(() => (window as any).__interior.geometries() as number)
  const d = inner()[0]
  for (let i = 0; i < 8; i++) {
    await page.getByTestId(`go-${d.id}`).click()
    await page.getByTestId(`go-${d.id}`).click()
  }
  await page.waitForTimeout(300)
  await expect(page.getByTestId('active-room')).toHaveText(a.rooms[r1].name)
  expect(await snapshot()).toBe(saved)
  const after = await page.evaluate(() => (window as any).__interior.geometries() as number)
  expect(after).toBeLessThanOrEqual(base + 2) // старые геометрии освобождены
  await page.getByTestId(`go-${d.id}`).click()
  expect(await sceneNames(page)).toContain(`furniture-${f2}`)
  expect(await sceneNames(page)).not.toContain(`furniture-${f1}`)
})

test('возврат к настройке и обратно сохраняет активную комнату', async ({ page }) => {
  await openInterior(page)
  const d = inner()[0]
  await page.getByTestId(`go-${d.id}`).click().catch(async () => {
    const [r1] = roomsOfWall(apt(), d.wallId)
    await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), r1)
    await page.getByTestId(`go-${d.id}`).click()
  })
  const name = await roomName(page)
  await page.getByTestId('back-to-setup').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('active-room')).toHaveText(name)
})
