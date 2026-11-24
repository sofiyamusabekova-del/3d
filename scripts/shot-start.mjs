// Снимки главного меню (этап 30): день и ночь. Нужен запущенный dev-сервер (npm run dev).
// Запуск: node scripts/shot-start.mjs [папка] [ширина] [высота]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'docs/reports/stage30'
const width = Number(process.argv[3] ?? 1600), height = Number(process.argv[4] ?? 900)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width, height } })
await page.goto(process.env.BASE_URL ?? 'http://localhost:5173/')
await page.getByTestId('start-room3d').waitFor({ timeout: 30000 })
await page.waitForFunction(() => document.querySelector('[data-testid=start-room3d]')?.getAttribute('data-ready') === '1', null, { timeout: 30000 })
await page.waitForTimeout(3800)
await page.screenshot({ path: `${out}/menu-day-${width}.png` })
// Промежуточные часы: час ставится прямо в общее состояние (тот же модуль, что у приложения).
const setHour = (h) => page.evaluate((hour) => window.__start.setHour(hour), h)
for (const h of [9, 17.5, 19.5, 6.5]) {
  await setHour(h)
  await page.waitForTimeout(1200)
  console.log(h, await page.getByTestId('start-menu').getAttribute('data-hour'))
  await page.screenshot({ path: `${out}/menu-h${String(h).replace('.', '_')}-${width}.png` })
}
await setHour(15)
await page.waitForTimeout(800)
await page.getByTestId('start-cord').focus()
await page.keyboard.press('Enter')
// Кадры перехода день → ночь: солнце уходит за холмы, луна всходит.
for (let i = 1; i <= 5; i++) {
  await page.waitForTimeout(650)
  await page.screenshot({ path: `${out}/menu-transition-${i}-${width}.png`, clip: { x: 690, y: 160, width: 310, height: 520 } })
}
await page.waitForTimeout(3500)
await page.screenshot({ path: `${out}/menu-night-${width}.png` })
await browser.close()
console.log('ok')
