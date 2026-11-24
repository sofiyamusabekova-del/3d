// Снимки шага «Параметры» мастера на трёх размерах окна и с ошибкой ввода. Нужен запущенный dev-сервер.
// Запуск: node scripts/shot-params.mjs [папка]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'docs/reports/stage32'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
for (const [w, h] of [[1920, 1080], [1280, 720], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.addInitScript(() => localStorage.setItem('interior-planner:skip-start', '1'))
  await page.goto(process.env.BASE_URL ?? 'http://localhost:5173/')
  await page.getByTestId('area-input').waitFor()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}/params-${w}.png` })
  if (w === 1920) {
    await page.getByTestId('room-count-2').check()
    await page.getByTestId('area-input').fill('3')
    await page.getByTestId('submit-params').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/params-error-${w}.png` })
  }
  await page.close()
}
await browser.close()
console.log('ok')
