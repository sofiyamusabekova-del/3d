import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Замеры этапа 18.3 на согласованной сцене: «Комната» схемы 1Б с полной расстановкой и обоями (D-08).
// Запуск: MEASURE=1 npx playwright test perf --workers=1

const OUT = 'docs/reports/stage18'
const a = buildApartment(templateById('1b')!)
const room = (name: string) => Object.values(a.rooms).find((r) => r.name === name)!
const FURNISH = ['sofa_02', 'modern_coffee_table_01', 'ArmChair_01', 'Shelf_01', 'side_table_01', 'potted_plant_04', 'Ottoman_01', 'painted_wooden_cabinet']

const modelsReady = (page: Page, n: number) => page.waitForFunction((count) => {
  let loading = 0, items = 0
  ;(window as any).__interior.probe.scene?.traverse((o: any) => { if (o.name === 'model-loading') loading++; if (o.name?.startsWith('furniture-')) items++ })
  return items === count && loading === 0
}, n, { timeout: 30_000 })

const frames = (page: Page, ms: number) => page.evaluate((dur) => new Promise<number[]>((resolve) => {
  const dts: number[] = []
  let last = performance.now()
  const end = last + dur
  const tick = (now: number) => { dts.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(dts) }
  requestAnimationFrame(tick)
}), ms)

const frameStats = (dts: number[]) => {
  const s = dts.slice(5).sort((x, y) => x - y)
  const r = (v: number) => Math.round(v * 10) / 10
  return { frames: s.length, fpsAvg: r(1000 / (s.reduce((x, y) => x + y, 0) / s.length)), frameP95Ms: r(s[Math.floor(s.length * 0.95)]), frameMaxMs: r(s[s.length - 1]) }
}

const memory = (page: Page) => page.evaluate(() => {
  const gl = (window as any).__interior.probe.gl
  const pm = (performance as any).memory
  return { geometries: gl?.info.memory.geometries ?? -1, textures: gl?.info.memory.textures ?? -1, programs: gl?.info.programs?.length ?? -1, jsHeapMB: pm ? Math.round(pm.usedJSHeapSize / 1048576 * 10) / 10 : null }
})

test('18.3: замеры на согласованной сцене', async ({ page }, info) => {
  test.skip(!process.env.MEASURE, 'замеры запускаются отдельно: MEASURE=1')
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  const living = room('Комната')
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()

  // Готовим проект (расстановка и отделка) без 3D: проект общий, поэтому расставляем через интерьер и уходим в настройку.
  await page.getByTestId('to-interior').click()
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), living.id)
  await page.getByTestId('catalog-scope-all').click()
  for (const id of FURNISH) await page.getByTestId(`add-${id}`).click()
  const placed = await page.evaluate((rid) => Object.values((window as any).__interior.project.getState().history.present.furniture).filter((f: any) => f.roomId === rid).length as number, living.id)
  for (let i = 0; i < 4; i++) { await page.getByTestId(`side-${i}`).click(); await page.locator('[data-testid^="wallpaper-"]').nth(i % 3).click() }
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await modelsReady(page, placed)
  const firstVisitMs = await page.evaluate(() => Math.round(performance.now()))

  // Готовность сцены: вход в интерьер с полной расстановкой (модели уже в кеше браузера, как при обычной работе).
  await page.getByTestId('back-to-setup').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  const t0 = Date.now()
  await page.getByTestId('to-interior').click()
  await modelsReady(page, placed)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const sceneReadyMs = Date.now() - t0

  // Появление новой модели (файл ещё не загружался) — от нажатия до готовой модели.
  await page.getByTestId('catalog-scope-all').click() // табурет не для гостиной
  const t1 = Date.now()
  await page.getByTestId('add-wooden_stool_01').click()
  const stoolAdded = await page.evaluate((rid) => Object.values((window as any).__interior.project.getState().history.present.furniture).filter((f: any) => f.roomId === rid).length as number, living.id)
  await modelsReady(page, stoolAdded)
  const newModelMs = Date.now() - t1
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await page.waitForTimeout(500)

  const idle = frameStats(await frames(page, 5000))
  const c = (await page.getByTestId('interior-scene').boundingBox())!
  await page.mouse.move(c.x + c.width * 0.8, c.y + c.height * 0.5)
  await page.mouse.down()
  const orbitMove = page.mouse.move(c.x + c.width * 0.2, c.y + c.height * 0.4, { steps: 150 })
  const orbit = frameStats(await frames(page, 5000))
  await orbitMove
  await page.mouse.up()

  // Отзывчивость: от нажатия клавиши до кадра с новым положением (20 сдвигов стрелкой).
  const anyId = await page.evaluate((rid) => (Object.values((window as any).__interior.project.getState().history.present.furniture) as any[]).find((f) => f.roomId === rid).id as string, living.id)
  await page.getByTestId(`plan-item-${anyId}`).click()
  const keyLatency: number[] = []
  for (let i = 0; i < 20; i++) {
    const key = i % 2 ? 'ArrowLeft' : 'ArrowRight'
    keyLatency.push(await page.evaluate((k) => new Promise<number>((resolve) => {
      const t = performance.now()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t)))
    }), key))
  }
  keyLatency.sort((x, y) => x - y)

  // Память: 10 переходов между комнатами туда и обратно и 3 возврата к настройке.
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await page.waitForTimeout(500)
  const memBefore = await memory(page)
  const other = room('Кухня').id
  for (let i = 0; i < 10; i++) {
    await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), other)
    await page.waitForTimeout(150)
    await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), living.id)
    await modelsReady(page, stoolAdded)
  }
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('back-to-setup').click()
    await expect(page.getByTestId('setup-plan')).toBeVisible()
    await page.getByTestId('to-interior').click()
    await modelsReady(page, stoolAdded)
  }
  await page.waitForTimeout(800)
  const memAfter = await memory(page)

  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')!
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'неизвестно'
  })
  await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/perf-scene-${info.project.name}.png` })
  const result = {
    browser: info.project.name, userAgent: await page.evaluate(() => navigator.userAgent), gpu, viewport: page.viewportSize(),
    scene: { room: 'Комната (1Б)', items: stoolAdded, wallpaperSides: 4 },
    firstVisitTotalMs: firstVisitMs, sceneReadyMs, newModelMs, idle, orbit,
    keyToFrameMs: { median: Math.round(keyLatency[10] * 10) / 10, max: Math.round(keyLatency[19] * 10) / 10 },
    memoryBefore: memBefore, memoryAfter: memAfter, transitions: '10 комнат туда-обратно + 3 возврата к настройке',
    thresholdsD08: { fpsMin: 60, frameP95MaxMs: 20, sceneReadyMaxMs: 3000, modelMaxMs: 2000 },
    date: new Date().toISOString(),
  }
  writeFileSync(`${OUT}/${info.project.name}-measure.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  expect(placed).toBeGreaterThanOrEqual(6)
})
