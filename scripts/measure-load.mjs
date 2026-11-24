import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'

/**
 * Замер загрузки на собранной версии (этап 28): сколько байт и запросов тянет каждый шаг сценария.
 * Запуск: node scripts/build... не нужен; сначала `vite build`, затем `vite preview --port 4173`, затем
 *   node scripts/measure-load.mjs [выходной.json]
 * Размеры: сырые (как лежат на диске) и сжатые gzip (как отдаёт обычный хостинг).
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const out = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

const seen = new Map() // url -> { raw, gz, type }
let step = 'start'
const perStep = {}
page.on('response', async (r) => {
  const url = r.url()
  if (!url.startsWith(BASE) || seen.has(url)) return
  try {
    const body = await r.body()
    const ct = r.headers()['content-type'] ?? ''
    const kind = /javascript/.test(ct) ? 'js' : /css/.test(ct) ? 'css' : /png|jpeg|webp|image/.test(ct) ? 'img' : /gltf|octet|glb/.test(ct) || url.endsWith('.glb') ? 'model' : /html/.test(ct) ? 'html' : 'other'
    const gz = kind === 'img' || kind === 'model' ? body.length : gzipSync(body).length // изображения и модели уже сжаты форматом
    seen.set(url, { raw: body.length, gz, kind, step, name: url.replace(BASE, '').slice(0, 70) })
  } catch { /* ответ без тела (перенаправление) */ }
})

const mark = async (name) => {
  await page.waitForTimeout(1500)
  const items = [...seen.values()].filter((v) => v.step === step)
  const sum = (k) => items.filter((i) => !k || i.kind === k)
  perStep[name] = {
    requests: items.length,
    rawKB: Math.round(items.reduce((a, b) => a + b.raw, 0) / 1024),
    gzipKB: Math.round(items.reduce((a, b) => a + b.gz, 0) / 1024),
    byKind: Object.fromEntries(['js', 'css', 'img', 'model', 'other'].map((k) => [k, { n: sum(k).length, rawKB: Math.round(sum(k).reduce((a, b) => a + b.raw, 0) / 1024) }])),
    biggest: items.sort((a, b) => b.raw - a.raw).slice(0, 4).map((i) => `${i.name} ${Math.round(i.raw / 1024)} КБ`),
  }
}

step = '1 открытие страницы'
const t0 = Date.now()
await page.goto(BASE)
await page.getByTestId('area-input').waitFor()
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd) } })
const paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)])))
await mark(step)

step = '2 схемы и настройка'
await page.getByTestId('room-count-1').check()
await page.getByTestId('area-input').fill('43')
await page.getByTestId('submit-params').click()
await page.getByTestId('choose-1b').click()
await page.getByTestId('setup-plan').waitFor()
await mark(step)

step = '3 интерьер (пустая комната)'
const t1 = Date.now()
await page.getByTestId('to-interior').click()
await page.getByTestId('interior-scene').waitFor()
await page.waitForFunction(() => (window).__interior?.probe?.scene)
const interiorMs = Date.now() - t1
await mark(step)

step = '4 три предмета каталога'
const t2 = Date.now()
for (const id of ['sofa_02', 'modern_coffee_table_01', 'kenney_lampRoundFloor']) { await page.getByTestId('catalog-scope-all').click(); await page.getByTestId(`add-${id}`).click() }
await page.waitForFunction(() => { let l = 0; (window).__interior.probe.scene.traverse((o) => { if (o.name === 'model-loading') l++ }); return l === 0 })
const modelsMs = Date.now() - t2
await mark(step)

step = '5 обои и пол'
await page.getByTestId('side-0').click()
await page.locator('[data-testid^="wallpaper-"]').first().click()
await page.getByTestId('floor-laminate-oak_light').click()
await mark(step)

const total = [...seen.values()]
const result = {
  date: new Date().toISOString(), base: BASE, browser: 'chrome (headless)', nav, paint, interiorMs, modelsMs, steps: perStep,
  totalRawKB: Math.round(total.reduce((a, b) => a + b.raw, 0) / 1024), totalGzipKB: Math.round(total.reduce((a, b) => a + b.gz, 0) / 1024), totalMs: Date.now() - t0,
}
console.log(JSON.stringify(result, null, 2))
if (out) writeFileSync(out, JSON.stringify(result, null, 2))
await browser.close()
