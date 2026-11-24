// Снимки живой 3D-комнаты главного меню для экрана загрузки и браузеров без WebGL: public/start/room-day.jpg и room-night.jpg.
// Нужен запущенный dev-сервер (npm run dev). Запуск: node scripts/shot-fallback.mjs
// Перезапускать после правок сцены меню, чтобы картинка при загрузке совпадала с живой комнатой.
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const out = 'public/start'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 })
await page.goto(process.env.BASE_URL ?? 'http://localhost:5173/')
const stage = page.getByTestId('start-room3d')
await page.waitForFunction(() => document.querySelector('[data-testid=start-room3d]')?.getAttribute('data-ready') === '1', null, { timeout: 60000 })
// Шнур, бусина и подсказка — живые элементы поверх холста, на снимке их быть не должно. Ждём, пока намёк шнуром отыграет.
await page.addStyleTag({ content: '.start-rope,.start-bead,.start-hint,.start-grab{display:none!important}' })
await page.waitForTimeout(6500)
await page.evaluate(() => window.__start.setHour(15))
await page.waitForTimeout(800)
await stage.screenshot({ path: `${out}/room-day.jpg`, type: 'jpeg', quality: 84 })
await page.evaluate(() => window.__start.setHour(23))
await page.waitForTimeout(1200)
await stage.screenshot({ path: `${out}/room-night.jpg`, type: 'jpeg', quality: 84 })
await page.evaluate(() => window.__start.setHour(15))
await browser.close()
console.log('ok')
