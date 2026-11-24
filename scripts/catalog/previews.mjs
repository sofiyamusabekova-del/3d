import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

/**
 * Снимает превью карточек (256 × 256) со служебной страницы /?preview=<id>.
 * Нужен запущенный dev-сервер (по умолчанию http://localhost:5173).
 * Запуск: node scripts/catalog/previews.mjs [id ...]
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const manifest = JSON.parse(await readFile('src/catalog/catalog.generated.json', 'utf8'))
const ids = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(manifest.items)

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 400, height: 400 } })
for (const id of ids) {
  await mkdir(`public/catalog/${id}`, { recursive: true })
  await page.goto(`${BASE}/?preview=${id}`)
  await page.waitForSelector('[data-testid=model-preview][data-ready=true]', { timeout: 30000 })
  await page.waitForTimeout(400)
  const png = await page.getByTestId('model-preview').screenshot()
  await sharp(png).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toFile(`public/catalog/${id}/preview.webp`)
  console.log(`${id}: превью готово`)
}
await browser.close()
