import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Набор «Лофт» (стиль набора, лофтовые краски). Кадр — docs/reports/extras/loft-chrome.png.
const OUT = 'docs/reports/extras'
mkdirSync(OUT, { recursive: true })

test('стиль «Лофт»: набор ставит тёмную мебель, краски лофта доступны', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const id = await page.evaluate(() => {
    const p = (window as any).__interior.project.getState().history.present
    return (Object.values(p.rooms) as any[]).find((r) => r.name === 'Комната').id as string
  })
  await page.evaluate((rid) => (window as any).__interior.store.getState().enter(rid), id)
  await page.getByTestId('furnish-style').selectOption('loft')
  await page.getByTestId('furnish-room').click()
  const ids = await page.evaluate(() => (Object.values((window as any).__interior.project.getState().history.present.furniture) as any[]).map((f) => f.catalogItemId as string))
  expect(ids).toContain('fm_tv_stand_walnut')
  expect(ids.length).toBeGreaterThanOrEqual(5)
  await page.getByTestId('side-0').click()
  for (const p of ['paint_concrete', 'paint_brick', 'paint_black']) await expect(page.getByTestId(`paint-${p}`)).toBeVisible()
  await page.getByTestId('paint-paint_brick').click()
  await page.screenshot({ path: `${OUT}/loft-chrome.png` })
})
