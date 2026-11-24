import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Снимок шага настройки для отчёта этапа 8 (запуск: SHOT=1 npx playwright test shot).
test.skip(!process.env.SHOT, 'снимки запускаются отдельно: SHOT=1')

test('снимок каталога и мебели (этап 13)', async ({ page }, info) => {
  mkdirSync('docs/reports/stage13', { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.getByTestId('room-count-2').check()
  await page.getByTestId('area-input').fill('55')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-2b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await page.locator('[data-testid^="pick-room-"]').first().click()
  for (const id of ['sofa_02', 'modern_coffee_table_01', 'ArmChair_01', 'Shelf_01', 'side_table_01']) await page.getByTestId(`add-${id}`).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `docs/reports/stage13/${info.project.name}-living.png` })
})

test('снимок спальни и санузла (этап 13)', async ({ page }, info) => {
  mkdirSync('docs/reports/stage13', { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.getByTestId('room-count-2').check()
  await page.getByTestId('area-input').fill('55')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-2b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const goRoom = async (name: string) => {
    await page.getByTestId('plan-mode').click()
    await page.locator('[data-testid^="plan-room-"]', { hasText: name }).first().waitFor()
  }
  void goRoom
  // Спальня: вторая комната в списке плана.
  await page.evaluate(() => {
    const st = (window as any).__interior
    const apt = st.project.getState().history.present
    const room = Object.values(apt.rooms).find((r: any) => r.name === 'Спальня') as any
    st.store.getState().enter(room.id)
  })
  for (const id of ['kenney_bedDouble', 'kenney_cabinetBed', 'kenney_bookcaseClosedDoors']) await page.getByTestId(`add-${id}`).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `docs/reports/stage13/${info.project.name}-bedroom.png` })
  await page.evaluate(() => {
    const st = (window as any).__interior
    const apt = st.project.getState().history.present
    const room = Object.values(apt.rooms).find((r: any) => r.name === 'Санузел') as any
    st.store.getState().enter(room.id)
  })
  for (const id of ['kenney_toilet', 'kenney_bathroomSink', 'kenney_shower']) await page.getByTestId(`add-${id}`).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `docs/reports/stage13/${info.project.name}-bathroom.png` })
})

test('снимок отделки (этап 12)', async ({ page }, info) => {
  mkdirSync('docs/reports/stage12', { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.getByTestId('room-count-2').check()
  await page.getByTestId('area-input').fill('55')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-2b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await page.locator('[data-testid^="pick-room-"]').first().click()
  const sides = page.locator('[data-testid^="side-"]')
  const n = await sides.count()
  const ids = ['wallpaper-rough_linen', 'paint-paint_terracotta', 'wallpaper-gingham_check', 'wallpaper-quatrefoil_jacquard_fabric']
  for (let i = 0; i < Math.min(n, ids.length); i++) {
    await sides.nth(i).click()
    await page.getByTestId(ids[i]).click()
  }
  await sides.nth(0).click()
  await page.getByTestId('add-sofa_02').click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `docs/reports/stage12/${info.project.name}-finishes.png` })
})

test('снимок плана и 3D (этап 11)', async ({ page }, info) => {
  mkdirSync('docs/reports/stage11', { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.getByTestId('room-count-2').check()
  await page.getByTestId('area-input').fill('55')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-2b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await page.locator('[data-testid^="pick-room-"]').first().click()
  await page.getByTestId('add-sofa_02').click()
  await page.getByTestId('add-dining_chair_02').click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `docs/reports/stage11/${info.project.name}-room.png` })
  await page.getByTestId('plan-mode').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `docs/reports/stage11/${info.project.name}-all.png` })
})

test('снимок интерьера (этап 10)', async ({ page }, info) => {
  mkdirSync('docs/reports/stage10', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByTestId('room-count-2').check()
  await page.getByTestId('area-input').fill('55')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-2b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `docs/reports/stage10/${info.project.name}-interior-start.png` })
  await page.locator('[data-testid^="go-"]').nth(1).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `docs/reports/stage10/${info.project.name}-interior-next.png` })
})

test('снимок проёма (этап 9)', async ({ page }, info) => {
  mkdirSync('docs/reports/stage9', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  await page.locator('[data-testid^="pick-opening-"]').nth(2).click()
  const from = page.getByTestId('opening-from')
  await from.fill(String(Number(await from.inputValue()) + 20))
  await expect(page.getByTestId('opening-preview')).toBeVisible()
  await page.screenshot({ path: `docs/reports/stage9/${info.project.name}-opening.png` })
})

test('снимок настройки', async ({ page }, info) => {
  mkdirSync('docs/reports/stage8', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByTestId('room-count-2').check()
  await page.getByTestId('area-input').fill('55')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-2b').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  await page.locator('[data-testid^="pick-wall-"]').nth(5).click()
  const input = page.locator('[data-testid^="size-"]').first()
  await input.fill(String(Number(await input.inputValue()) + 30))
  await expect(page.getByTestId('move-preview')).toBeVisible()
  await page.screenshot({ path: `docs/reports/stage8/${info.project.name}-setup.png` })
})
