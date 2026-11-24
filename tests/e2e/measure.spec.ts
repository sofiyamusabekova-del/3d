import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Замеры этапа 4 (Tasks 4.5). Запуск: MEASURE=1 npx playwright test measure
test.skip(!process.env.MEASURE, 'замеры запускаются отдельно: MEASURE=1')

test('замеры и снимки технической сцены', async ({ page, browserName }, info) => {
  const tag = info.project.name
  mkdirSync('docs/reports/stage4', { recursive: true })
  await page.goto('/?tech')
  await expect(page.getByTestId('plan')).toBeVisible()

  const t0 = Date.now()
  for (const id of ['sofa_02', 'modern_wooden_cabinet', 'modern_coffee_table_01', 'dining_chair_02']) await page.getByTestId(`add-${id}`).click()
  await expect
    .poll(() => page.evaluate(() => Object.keys((window as never as { __tech: { measured: () => object } }).__tech.measured()).length), { timeout: 30000 })
    .toBe(4)
  const loadMs = Date.now() - t0

  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')!
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'неизвестно'
  })

  // Кадры: 5 секунд простоя и 5 секунд с вращением камеры.
  const frames = async (rotate: boolean) => {
    if (rotate) {
      const c = (await page.locator('canvas').boundingBox())!
      await page.mouse.move(c.x + c.width * 0.8, c.y + c.height * 0.2)
      await page.mouse.down()
    }
    const res = await page.evaluate(
      (rot) =>
        new Promise<number[]>((resolve) => {
          const dts: number[] = []
          let last = performance.now()
          const end = last + 5000
          const tick = (now: number) => {
            dts.push(now - last)
            last = now
            if (now < end) requestAnimationFrame(tick)
            else resolve(dts)
          }
          requestAnimationFrame(tick)
          void rot
        }),
      rotate,
    )
    if (rotate) await page.mouse.up()
    return res
  }
  const stats = (dts: number[]) => {
    const s = [...dts.slice(5)].sort((a, b) => a - b)
    const p95 = s[Math.floor(s.length * 0.95)]
    return { frames: s.length, fpsAvg: Math.round((1000 / (s.reduce((a, b) => a + b, 0) / s.length)) * 10) / 10, frameP95Ms: Math.round(p95 * 10) / 10, frameMaxMs: Math.round(s[s.length - 1] * 10) / 10 }
  }
  const idle = stats(await frames(false))
  // Вращение: тянем мышью по canvas во время замера.
  const c = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(c.x + c.width * 0.9, c.y + c.height * 0.1)
  await page.mouse.down()
  const orbit = page.mouse.move(c.x + c.width * 0.1, c.y + c.height * 0.1, { steps: 120 })
  const orbitStats = stats(await frames(false))
  await orbit
  await page.mouse.up()

  await page.screenshot({ path: `docs/reports/stage4/${tag}-full.png` })
  await page.locator('canvas').screenshot({ path: `docs/reports/stage4/${tag}-3d.png` })

  const result = { browser: tag, userAgent: await page.evaluate(() => navigator.userAgent), gpu, viewport: page.viewportSize(), loadFourModelsMs: loadMs, idle, orbit: orbitStats, date: new Date().toISOString() }
  writeFileSync(`docs/reports/stage4/${tag}-measure.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  void browserName
})
