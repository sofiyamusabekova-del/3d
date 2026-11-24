import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Этап 21: потолочный свет и выключатель, светильники, бра, люстры, предел источников, «Качественный снимок» (SPEC D-11, D-14).
// Кадры — docs/reports/stage21.
const OUT = 'docs/reports/stage21'
mkdirSync(OUT, { recursive: true })

async function openRoom(page: Page, roomName = 'Комната') {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const id = await page.evaluate((n) => {
    const p = (window as any).__interior.project.getState().history.present
    return (Object.values(p.rooms) as any[]).find((r) => r.name === n).id as string
  }, roomName)
  await page.evaluate((rid) => (window as any).__interior.store.getState().enter(rid), id)
  await expect(page.getByTestId('active-room')).toHaveText(roomName)
  return id
}

const add = async (page: Page, id: string) => { await page.getByTestId('catalog-scope-all').click(); await page.getByTestId(`add-${id}`).click() }
const furniture = (page: Page) => page.evaluate(() => Object.values((window as any).__interior.project.getState().history.present.furniture) as any[])
const modelsReady = (page: Page) => page.waitForFunction(() => {
  let loading = 0
  ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-loading') loading++ })
  return loading === 0
}, undefined, { timeout: 30_000 })
const setHour = async (page: Page, h: number) => { await page.getByTestId('time-slider').fill(String(h)); await page.waitForTimeout(500) }

/** Силы света пула источников сцены: сколько светит и какая суммарная сила. */
const pool = (page: Page) => page.evaluate(() => {
  const out: Array<{ i: number; intensity: number; y: number; shadow: boolean }> = []
  ;(window as any).__interior.probe.scene.traverse((o: any) => {
    if (o.isPointLight && o.name.startsWith('room-light-')) out.push({ i: Number(o.name.slice(11)), intensity: o.intensity, y: o.position.y, shadow: o.castShadow })
  })
  return out.sort((a, b) => a.i - b.i)
})
const glows = (page: Page) => page.evaluate(() => { let n = 0; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'light-glow') n++ }); return n })

const brightness = (page: Page) => page.evaluate(() => {
  const c = document.querySelector('[data-testid=interior-scene] canvas') as HTMLCanvasElement
  const t = document.createElement('canvas')
  t.width = 160; t.height = 90
  const g = t.getContext('2d')!
  g.drawImage(c, 0, 0, t.width, t.height)
  const d = g.getImageData(0, 0, t.width, t.height).data
  let s = 0
  for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3
  return s / (d.length / 4)
})

/** Камера над полом комнаты под углом: видны светильники и пятна света. */
const aimOverview = (page: Page, lift = 5.2, back = 3.4) => page.evaluate(({ lift, back }) => {
  const probe = (window as any).__interior.probe
  const st = probe.scene.__r3f.root.getState()
  let floor: any = null
  probe.scene.traverse((o: any) => { if (o.name.startsWith('floor-') && !floor) floor = o })
  floor.geometry.computeBoundingBox()
  const b = floor.geometry.boundingBox
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2
  st.controls.target.set(cx, 0.6, cz)
  st.camera.position.set(cx + 0.01, lift, cz + back)
  st.controls.update()
}, { lift, back })

test('21.1: в комнате есть светильник с выключателем; состояние выключателя у каждой комнаты своё и сохраняется при переходах', async ({ page }) => {
  const living = await openRoom(page)
  await expect(page.getByTestId('lights-toggle')).toContainText('вкл')
  let p = await pool(page)
  expect(p).toHaveLength(6)
  expect(p[0].intensity).toBeGreaterThan(5) // потолочный светильник светит (10 кд)
  expect(p.slice(1).every((x) => x.intensity === 0)).toBe(true)
  expect(await glows(page)).toBe(1)
  // Выключили: ни света, ни свечения; проект и история не менялись.
  const hist = () => page.evaluate(() => { const h = (window as any).__interior.project.getState().history; return `${h.past.length}|${h.future.length}|${JSON.stringify(h.present)}` })
  const before = await hist()
  await page.getByTestId('lights-toggle').click()
  await expect(page.getByTestId('lights-toggle')).toContainText('выкл')
  p = await pool(page)
  expect(p.every((x) => x.intensity === 0)).toBe(true)
  expect(await glows(page)).toBe(0)
  expect(await hist()).toBe(before)
  // Другая комната включена, при возврате первая выключена.
  const other = await page.evaluate((rid) => (Object.values((window as any).__interior.project.getState().history.present.rooms) as any[]).find((r) => r.id !== rid).id as string, living)
  await page.evaluate((rid) => (window as any).__interior.store.getState().enter(rid), other)
  await expect(page.getByTestId('lights-toggle')).toContainText('вкл')
  expect((await pool(page))[0].intensity).toBeGreaterThan(5)
  await page.evaluate((rid) => (window as any).__interior.store.getState().enter(rid), living)
  await expect(page.getByTestId('lights-toggle')).toContainText('выкл')
  expect((await pool(page)).every((x) => x.intensity === 0)).toBe(true)
})

test('21.2 / 21.4: торшер, настольная лампа, бра и люстра светят ночью, выключатель гасит всё; кадры', async ({ page }) => {
  test.setTimeout(150_000)
  await openRoom(page)
  await add(page, 'modern_coffee_table_01')
  await add(page, 'sofa_02')
  await add(page, 'kenney_lampRoundFloor')
  await add(page, 'kenney_lampRoundTable')
  await add(page, 'kenney_lampWall')
  await modelsReady(page)
  const items = await furniture(page)
  const wall = items.find((f) => f.catalogItemId === 'kenney_lampWall')
  const table = items.find((f) => f.catalogItemId === 'kenney_lampRoundTable')
  expect(wall.elevationCm).toBe(160)
  expect(table.elevationCm).toBeGreaterThan(20) // стоит на столике
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await setHour(page, 23)
  await aimOverview(page)
  await page.waitForTimeout(500)
  const p = await pool(page)
  expect(p.filter((x) => x.intensity > 0)).toHaveLength(4) // потолочный, торшер, настольная, бра
  expect(p.filter((x) => x.shadow).map((x) => x.i)).toEqual([0]) // тени только у главного источника
  const on = await brightness(page)
  await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/night-lights-on-${test.info().project.name}.png` })
  // Крупно бра: камера напротив лампы на расстоянии 1,6 м, лицом к ней (лампа смотрит в комнату по +Z предмета).
  await page.evaluate((w) => {
    const probe = (window as any).__interior.probe
    const st = probe.scene.__r3f.root.getState()
    const a = (w.angleDeg * Math.PI) / 180
    const fx = Math.sin(a), fz = Math.cos(a)
    st.controls.target.set(w.xCm / 100, 1.55, w.zCm / 100)
    st.camera.position.set(w.xCm / 100 + fx * 1.6, 1.7, w.zCm / 100 + fz * 1.6)
    st.controls.update()
  }, wall)
  await page.waitForTimeout(500)
  await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/wall-lamp-closeup-${test.info().project.name}.png` })
  await aimOverview(page)
  await page.waitForTimeout(300)
  await page.getByTestId('lights-toggle').click()
  await page.waitForTimeout(500)
  const off = await brightness(page)
  await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/night-lights-off-${test.info().project.name}.png` })
  console.log(`яркость ночью: свет включён ${on.toFixed(1)}, выключен ${off.toFixed(1)}`)
  expect(on).toBeGreaterThan(off * 1.5)
  expect((await pool(page)).every((x) => x.intensity === 0)).toBe(true)
})

test('21.6: люстра заменяет стандартный светильник и берёт его выключатель; кадр', async ({ page }) => {
  test.setTimeout(120_000)
  await openRoom(page)
  expect(await glows(page)).toBe(1)
  await add(page, 'own_chandelier_classic')
  await modelsReady(page)
  const f = (await furniture(page)).find((x) => x.catalogItemId === 'own_chandelier_classic')
  expect(f).toBeDefined()
  expect(await glows(page)).toBe(6 === 0 ? 0 : 1) // один источник: люстра вместо потолочного светильника
  const names = await page.evaluate(() => { const out: string[] = []; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name?.startsWith('furniture-')) out.push(o.name) }); return out })
  expect(names).toContain(`furniture-${f.id}`)
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await setHour(page, 23)
  await aimOverview(page, 4.2, 3.6)
  await page.waitForTimeout(500)
  await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/chandelier-on-${test.info().project.name}.png` })
  await page.getByTestId('lights-toggle').click()
  await page.waitForTimeout(400)
  expect((await pool(page)).every((x) => x.intensity === 0)).toBe(true)
  expect(await glows(page)).toBe(0)
  // Высота люстры в проекте и в сцене: потолок минус её высота.
  const ok = await page.evaluate((id) => {
    const probe = (window as any).__interior.probe
    const g = probe.scene.getObjectByName(`furniture-${id}`)
    const p = (window as any).__interior.project.getState().history.present
    return { y: g.position.y * 100, ceiling: p.ceilingHeightCm }
  }, f.id)
  expect(ok.y).toBeGreaterThan(ok.ceiling - 100)
  expect(ok.y).toBeLessThan(ok.ceiling - 40)
})

test('21.3: источников больше предела — светят не больше шести, скорость в порогах D-08', async ({ page }) => {
  test.setTimeout(150_000)
  await openRoom(page)
  for (let i = 0; i < 8; i++) await add(page, 'kenney_lampRoundFloor')
  await modelsReady(page)
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await setHour(page, 23)
  const p = await pool(page)
  expect(p.filter((x) => x.intensity > 0).length).toBe(6)
  await expect(page.getByTestId('lights-toggle')).toContainText(/из \d+/)
  // Скорость: 5 секунд кадров; пороги D-08 (60 к/с, p95 не больше 20 мс).
  const dts = await page.evaluate((ms) => new Promise<number[]>((resolve) => {
    const out: number[] = []
    let last = performance.now()
    const end = last + ms
    const tick = (now: number) => { out.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(out) }
    requestAnimationFrame(tick)
  }), 5000)
  const s = dts.slice(5).sort((a, b) => a - b)
  const fps = 1000 / (s.reduce((a, b) => a + b, 0) / s.length)
  const p95 = s[Math.floor(s.length * 0.95)]
  console.log(`6 источников со светом: ${fps.toFixed(1)} к/с, p95 ${p95.toFixed(1)} мс`)
  expect(fps).toBeGreaterThan(60)
  expect(p95).toBeLessThan(20)
})

test('21.5: «Качественный снимок» ночью учитывает искусственный свет: с лампами ярче, чем без них', async ({ page }) => {
  test.setTimeout(420_000)
  await openRoom(page)
  await add(page, 'sofa_02')
  await add(page, 'kenney_lampRoundFloor')
  await modelsReady(page)
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await setHour(page, 23)
  await aimOverview(page)
  const shot = async (file: string) => {
    await page.getByTestId('quality-open').click()
    await page.getByTestId('quality-samples').selectOption('16')
    await page.getByTestId('quality-start').click()
    await expect(page.getByTestId('quality-done')).toBeVisible({ timeout: 250_000 })
    await page.getByTestId('quality-image').screenshot({ path: `${OUT}/path-traced-${file}-${test.info().project.name}.png` })
    const m = await page.evaluate(() => {
      const c = document.querySelector('[data-testid=quality-image] canvas') as HTMLCanvasElement
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let sum = 0, n = 0
      for (let i = 0; i < d.length; i += 16) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++ }
      return sum / n
    })
    await page.getByTestId('quality-close').click()
    return m
  }
  const projectBefore = JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))
  const lit = await shot('night-lights-on')
  await page.getByTestId('lights-toggle').click()
  await page.waitForTimeout(500)
  const dark = await shot('night-lights-off')
  console.log(`quality-shot ночью: с лампами ${lit.toFixed(1)}, без ламп ${dark.toFixed(1)}`)
  expect(lit).toBeGreaterThan(dark * 1.8)
  expect(JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))).toBe(projectBefore)
})
