import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Этап 24 (SPEC D-17): режим «Прогулка»: вид от первого лица по всей квартире. Кадры — docs/reports/stage24.
const OUT = 'docs/reports/stage24'
mkdirSync(OUT, { recursive: true })

async function openRoom(page: Page, room = 'Комната', items: string[] = []) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('43')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const ids = await page.evaluate(() => {
    const p = (window as any).__interior.project.getState().history.present
    return Object.fromEntries((Object.values(p.rooms) as any[]).map((r) => [r.name, r.id])) as Record<string, string>
  })
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), ids[room])
  await expect(page.getByTestId('active-room')).toHaveText(room)
  for (const id of items) { await page.getByTestId('catalog-scope-all').click(); await page.getByTestId(`add-${id}`).click() }
  if (items.length) await page.waitForFunction(() => { let l = 0; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-loading') l++ }); return l === 0 })
  await page.waitForTimeout(500)
  return ids
}

const pos = (page: Page) => page.evaluate(() => { const w = (window as any).__interior.walk; return { x: w.x as number, z: w.z as number, yaw: w.yaw as number } })
const cam = (page: Page) => page.evaluate(() => { const c = (window as any).__interior.probe.camera; return { x: c.position.x * 100, y: c.position.y * 100, z: c.position.z * 100, fov: c.fov as number } })
const walkRoom = (page: Page) => page.getByTestId('walk-room').textContent()

/** Идёт: удерживает клавишу заданное время. */
async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
  await page.waitForTimeout(80)
}

test('24.1: вход и выход; камера на высоте глаз 160 см; W A S D и стрелки двигают по времени кадра; мышь поворачивает взгляд', async ({ page }) => {
  await openRoom(page)
  const before = JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))
  await page.getByTestId('walk-toggle').click()
  await expect(page.getByTestId('walk-hint')).toBeVisible()
  await expect(page.getByTestId('walk-toggle')).toContainText('Выйти')
  await page.waitForTimeout(400)
  let c = await cam(page)
  expect(c.y).toBeCloseTo(160, 0)
  expect(c.fov).toBe(70)
  const p0 = await pos(page)
  // W: идём вперёд (yaw 0 — на север, z уменьшается); скорость около 140 см/с.
  await hold(page, 'KeyW', 500)
  const p1 = await pos(page)
  expect(p0.z - p1.z).toBeGreaterThan(30)
  expect(p0.z - p1.z).toBeLessThan(110)
  expect(Math.abs(p1.x - p0.x)).toBeLessThan(1)
  // S возвращает назад; стрелки работают так же.
  await hold(page, 'KeyS', 500)
  const p2 = await pos(page)
  expect(p2.z - p1.z).toBeGreaterThan(30)
  await hold(page, 'ArrowRight', 400)
  const p3 = await pos(page)
  expect(p3.x - p2.x).toBeGreaterThan(20)
  await hold(page, 'ArrowLeft', 400)
  expect((await pos(page)).x).toBeLessThan(p3.x - 20)
  // Shift быстрее: за то же время дальше.
  const s0 = await pos(page)
  await page.keyboard.down('Shift'); await hold(page, 'ArrowDown', 300); await page.keyboard.up('Shift')
  const s1 = await pos(page)
  await hold(page, 'ArrowUp', 600) // вернуться
  const t0 = await pos(page)
  await hold(page, 'ArrowDown', 300)
  const t1 = await pos(page)
  expect(Math.abs(s1.z - s0.z)).toBeGreaterThan(Math.abs(t1.z - t0.z) * 1.2)
  // Мышь с зажатой кнопкой поворачивает взгляд; положение не меняется.
  const box = (await page.getByTestId('interior-scene').boundingBox())!
  const yaw0 = (await pos(page)).yaw
  const q0 = await pos(page)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  const yaw1 = (await pos(page)).yaw
  expect(yaw0 - yaw1).toBeGreaterThan(0.3) // вправо — поворот по часовой
  expect(Math.abs((await pos(page)).x - q0.x)).toBeLessThan(1)
  await page.waitForTimeout(100)
  // Камера следует за игроком.
  c = await cam(page)
  const pp = await pos(page)
  expect(c.x).toBeCloseTo(pp.x, 0)
  expect(c.z).toBeCloseTo(pp.z, 0)
  // Выход кнопкой: проект не менялся.
  await page.getByTestId('walk-toggle').click()
  await expect(page.getByTestId('walk-hint')).toHaveCount(0)
  expect(JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))).toBe(before)
})

test('24.2: в прогулке построена вся квартира: пол, стены, потолки и мебель всех комнат; обычный вид строит одну комнату', async ({ page }) => {
  const ids = await openRoom(page, 'Комната', ['sofa_02'])
  const count = () => page.evaluate(() => {
    const out = { shells: 0, floors: 0, ceilings: 0, ceilingShadows: 0, furniture: 0 }
    ;(window as any).__interior.probe.scene.traverse((o: any) => {
      if (o.name?.startsWith('room-shell-')) out.shells++
      if (o.name?.startsWith('floor-')) out.floors++
      if (o.name === 'ceiling') out.ceilings++
      if (o.name === 'ceiling-shadow') out.ceilingShadows++
      if (o.name?.startsWith('furniture-')) out.furniture++
    })
    return out
  })
  const normal = await count()
  expect(normal).toMatchObject({ shells: 1, floors: 1, ceilings: 0, ceilingShadows: 1 })
  await page.getByTestId('walk-toggle').click()
  await page.waitForTimeout(800)
  const rooms = Object.keys(ids).length
  expect(await count()).toMatchObject({ shells: rooms, floors: rooms, ceilings: rooms, ceilingShadows: 0, furniture: 1 })
  await page.getByTestId('walk-toggle').click()
  await page.waitForTimeout(500)
  expect(await count()).toMatchObject({ shells: 1, floors: 1, ceilings: 0, ceilingShadows: 1 })
})

test('24.3: стены не пускают; из комнаты через дверь в прихожую и обратно; мебель не проходится', async ({ page }) => {
  test.setTimeout(120_000)
  await openRoom(page, 'Комната', ['sofa_02'])
  await page.getByTestId('walk-toggle').click()
  await page.waitForTimeout(500)
  await expect(page.getByTestId('walk-room')).toHaveText('Комната')
  const start = await pos(page)
  // Идём на север долго: упираемся в стену, остаёмся в комнате.
  await hold(page, 'KeyW', 3500)
  const north = await pos(page)
  expect(north.z).toBeLessThan(start.z)
  expect(await walkRoom(page)).toBe('Комната')
  const wall = await pos(page)
  await hold(page, 'KeyW', 600)
  expect(Math.abs((await pos(page)).z - wall.z)).toBeLessThan(1) // стена держит
  // На восток к двери: выходим в прихожую или упираемся, зависит от положения; доходим вдоль стены до двери.
  const apt = await page.evaluate(() => {
    const a = (window as any).__interior.project.getState().history.present
    const living: any = (Object.values(a.rooms) as any[]).find((r) => r.name === 'Комната')
    const hall: any = (Object.values(a.rooms) as any[]).find((r) => r.name === 'Прихожая')
    const door: any = (Object.values(a.openings) as any[]).find((o) => o.kind === 'door' && living.boundary.some((b: any) => b.wallId === o.wallId) && hall.boundary.some((b: any) => b.wallId === o.wallId))
    const w = a.walls[door.wallId]
    const v0 = a.vertices[w.startVertexId], v1 = a.vertices[w.endVertexId]
    const len = Math.hypot(v1.xCm - v0.xCm, v1.zCm - v0.zCm)
    const t = (door.offsetCm + door.widthCm / 2) / len
    return { x: v0.xCm + (v1.xCm - v0.xCm) * t, z: v0.zCm + (v1.zCm - v0.zCm) * t }
  })
  // Поставим игрока напротив двери (телепортом через состояние) и пройдём сквозь проём: проверяем именно проходимость двери.
  await page.evaluate((d) => { const w = (window as any).__interior.walk; w.x = d.x - 90; w.z = d.z; w.yaw = -Math.PI / 2 }, apt)
  await page.waitForTimeout(200)
  await hold(page, 'KeyW', 1800) // вперёд = на восток к двери (yaw −90°)
  await expect(page.getByTestId('walk-room')).toHaveText('Прихожая')
  const inHall = await pos(page)
  expect(inHall.x).toBeGreaterThan(apt.x + 20)
  await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/walk-hall-${test.info().project.name}.png` })
  // Назад в комнату.
  await hold(page, 'KeyS', 1800)
  await expect(page.getByTestId('walk-room')).toHaveText('Комната')
  // Диван не проходится: ставим игрока слева от дивана и идём на него.
  const sofa = await page.evaluate(() => { const f: any = Object.values((window as any).__interior.project.getState().history.present.furniture)[0]; return { x: f.xCm as number, z: f.zCm as number } })
  await page.evaluate((s) => { const w = (window as any).__interior.walk; w.x = s.x - 160; w.z = s.z; w.yaw = -Math.PI / 2 }, sofa)
  await page.waitForTimeout(200)
  await hold(page, 'KeyW', 2500)
  const blocked = await pos(page)
  expect(blocked.x).toBeLessThan(sofa.x - 20)
  expect(Math.abs(blocked.z - sofa.z)).toBeLessThan(60)
})

test('24.5: выход возвращает редактор в ту же комнату, камера снова вращается мышью; проект не менялся; хоткеи предметов в прогулке не работают', async ({ page }) => {
  const ids = await openRoom(page, 'Комната', ['sofa_02'])
  const before = JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))
  await page.getByTestId('walk-toggle').click()
  await page.waitForTimeout(300)
  // Стрелки в прогулке — ходьба, а не сдвиг выбранного предмета.
  await page.evaluate((id) => (window as any).__interior.editor.getState().select(id), Object.keys(JSON.parse(before).furniture)[0])
  await hold(page, 'ArrowUp', 500)
  await hold(page, 'KeyR', 200)
  expect(JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))).toBe(before)
  // Уходим в другую комнату пешком, но выход всё равно возвращает в исходную.
  await page.evaluate(() => { const w = (window as any).__interior.walk; w.x = 0; w.z = 0 })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('walk-hint')).toHaveCount(0)
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
  expect(await page.evaluate(() => (window as any).__interior.store.getState().activeRoomId)).toBe(ids['Комната'])
  expect(JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))).toBe(before)
  // Обычный вид вернулся: камера над комнатой (выше глаз), угол обзора 45°, вращение мышью работает.
  await page.waitForTimeout(500)
  const c = await cam(page)
  expect(c.y).toBeGreaterThan(200)
  expect(c.fov).toBe(45)
  const box = (await page.getByTestId('interior-scene').boundingBox())!
  const a0 = await cam(page)
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 8 })
  await page.mouse.up()
  const a1 = await cam(page)
  expect(Math.hypot(a1.x - a0.x, a1.z - a0.z)).toBeGreaterThan(20)
  // Отмена в обычном виде снова работает.
  await expect(page.getByTestId('undo')).toBeEnabled()
})

test('24.4: свет и мир в прогулке: вид из окон всех комнат, свет только комнаты игрока и не больше шести источников; скорость D-08', async ({ page }) => {
  test.setTimeout(150_000)
  await openRoom(page, 'Комната')
  for (let i = 0; i < 8; i++) { await page.getByTestId('catalog-scope-all').click(); await page.getByTestId('add-kenney_lampRoundFloor').click() }
  await page.waitForFunction(() => { let l = 0; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-loading') l++ }); return l === 0 })
  await page.getByTestId('time-Ночь').click()
  await page.getByTestId('walk-toggle').click()
  await page.waitForTimeout(800)
  const pool = () => page.evaluate(() => {
    const out: number[] = []
    ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.isPointLight && o.name.startsWith('room-light-')) out.push(o.intensity) })
    return out
  })
  const p = await pool(page)
  expect(p).toHaveLength(6)
  expect(p.filter((v) => v > 0)).toHaveLength(6) // в комнате девять источников, светят шесть
  // Мир за окнами каждой комнаты: у каждого окна свой «трафарет», мир один.
  const world = await page.evaluate(() => {
    let windows = 0, worlds = 0
    ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'window-stencil') windows++; if (o.name === 'world') worlds++ })
    return { windows, worlds }
  })
  expect(world.worlds).toBe(1)
  // Окон в сцене столько же, сколько в проекте (в схеме 1Б — комната и кухня): вид из окна каждой комнаты, мир один.
  const projectWindows = await page.evaluate(() => (Object.values((window as any).__interior.project.getState().history.present.openings) as any[]).filter((o) => o.kind === 'window').length)
  expect(projectWindows).toBeGreaterThanOrEqual(2)
  expect(world.windows).toBe(projectWindows)
  // Кадр из комнаты ночью.
  await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/walk-night-${test.info().project.name}.png` })
  // Скорость (пороги D-08: не меньше 60 к/с, p95 не больше 20 мс) при ходьбе по квартире.
  await page.keyboard.down('KeyD')
  const dts = await page.evaluate((ms) => new Promise<number[]>((resolve) => {
    const out: number[] = []
    let last = performance.now()
    const end = last + ms
    const tick = (now: number) => { out.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(out) }
    requestAnimationFrame(tick)
  }), 4000)
  await page.keyboard.up('KeyD')
  const s = dts.slice(5).sort((a, b) => a - b)
  const fps = 1000 / (s.reduce((a, b) => a + b, 0) / s.length)
  const p95 = s[Math.floor(s.length * 0.95)]
  console.log(`прогулка по всей квартире: ${fps.toFixed(1)} к/с, p95 ${p95.toFixed(1)} мс`)
  expect(fps).toBeGreaterThan(60)
  expect(p95).toBeLessThan(20)
})

test('24.2: кадры из нескольких комнат: комната днём, кухня, прихожая; потолок виден', async ({ page }) => {
  test.setTimeout(120_000)
  const ids = await openRoom(page, 'Комната', ['sofa_02', 'modern_coffee_table_01'])
  await page.getByTestId('walk-toggle').click()
  await page.waitForTimeout(600)
  const shot = async (name: string, x: number, z: number, yaw: number) => {
    await page.evaluate(({ x, z, yaw }) => { const w = (window as any).__interior.walk; w.x = x; w.z = z; w.yaw = yaw; w.pitch = 0 }, { x, z, yaw })
    await page.waitForTimeout(500)
    await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/walk-${name}-${test.info().project.name}.png` })
  }
  const centres = await page.evaluate((idList) => {
    const a = (window as any).__interior.project.getState().history.present
    const out: Record<string, { x: number; z: number }> = {}
    for (const [name, id] of Object.entries(idList as Record<string, string>)) {
      const r = a.rooms[id]
      const pts: Array<{ x: number; z: number }> = []
      for (const b of r.boundary) { const w = a.walls[b.wallId]; for (const v of [a.vertices[w.startVertexId], a.vertices[w.endVertexId]]) pts.push({ x: v.xCm, z: v.zCm }) }
      out[name] = { x: (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2, z: (Math.min(...pts.map((p) => p.z)) + Math.max(...pts.map((p) => p.z))) / 2 }
    }
    return out
  }, ids)
  await shot('living', centres['Комната'].x + 120, centres['Комната'].z + 60, Math.PI / 2) // взгляд на запад: окно и мебель
  await shot('kitchen', centres['Кухня'].x, centres['Кухня'].z + 40, Math.PI / 2)
  await shot('hall', centres['Прихожая'].x, centres['Прихожая'].z, Math.PI / 2)
  const ceilings = await page.evaluate(() => { let n = 0; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'ceiling') n++ }); return n })
  expect(ceilings).toBeGreaterThanOrEqual(3)
})
