import { mkdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// D-31: проверка проходов. Кадры — docs/reports/clearance.
const OUT = 'docs/reports/clearance'
mkdirSync(OUT, { recursive: true })
const BED_W: number = JSON.parse(readFileSync('src/catalog/catalog.generated.json', 'utf8')).items.kenney_bedDouble.widthCm

async function openRoom(page: Page) {
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
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
}

test('проходы: без мебели раздела нет, узкий зазор между двумя кроватями подсвечивается и пропадает при расширении', async ({ page }) => {
  await openRoom(page)
  await expect(page.getByTestId('clearance')).toHaveCount(0)

  await page.getByTestId('catalog-scope-all').click()
  await page.getByTestId('add-kenney_bedDouble').click()
  await page.getByTestId('add-kenney_bedDouble').click()
  const ids: string[] = await page.evaluate(() => Object.keys((window as any).__interior.project.getState().history.present.furniture))
  expect(ids).toHaveLength(2)

  // Ставим вторую кровать рядом с первой на расстоянии gap см (через общую команду проекта; она проверяет допустимость).
  const place = (gap: number) => page.evaluate(([a, b, w, g]) => {
    const st = (window as any).__interior.project.getState()
    const f = st.history.present.furniture
    const r = st.apply('тест', (apt: any) => ({
      ...apt,
      furniture: { ...apt.furniture, [b as string]: { ...apt.furniture[b as string], xCm: f[a as string].xCm + (w as number) + (g as number), zCm: f[a as string].zCm, angleDeg: f[a as string].angleDeg } },
    }))
    return r.ok ? null : r.issues[0]?.message
  }, [ids[0], ids[1], BED_W, gap] as const)

  const err = await place(40)
  if (err) test.skip(true, `в этой комнате второй кровати не хватает места: ${err}`)
  // Замечаний может быть несколько (в небольшой комнате кровать ещё и близко к стене): ищем именно зазор между кроватями.
  const between = page.getByTestId('clearance-narrow').filter({ hasText: /40 см между «Кровать двуспальная» и «Кровать двуспальная»/ })
  await expect(between).toHaveCount(1)
  expect(await page.locator('[data-testid^=plan-marker-]').count()).toBeGreaterThanOrEqual(1)
  await between.click() // выбранное замечание подсвечивается
  await expect(between).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: `${OUT}/clearance-narrow-chrome.png` })

  const err2 = await place(80)
  if (!err2) await expect(page.getByTestId('clearance-narrow').filter({ hasText: /между «Кровать двуспальная» и «Кровать двуспальная»/ })).toHaveCount(0)
})
