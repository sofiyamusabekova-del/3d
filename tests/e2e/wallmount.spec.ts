import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// D-30: настенные предметы (телевизор, картина, зеркало, полка, часы) и высота подвеса. Кадры — docs/reports/wallmount.
const OUT = 'docs/reports/wallmount'
mkdirSync(OUT, { recursive: true })

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

const add = async (page: Page, id: string) => { await page.getByTestId('catalog-scope-all').click(); await page.getByTestId(`add-${id}`).click() }
const furniture = (page: Page) => page.evaluate(() => Object.values((window as any).__interior.project.getState().history.present.furniture) as any[])

test('настенные предметы ставятся на стену, высота меняется в панели и ограничена потолком', async ({ page }) => {
  await openRoom(page)
  for (const id of ['own_tv_wall', 'own_picture', 'own_mirror', 'own_shelf_wall', 'own_clock_wall']) await add(page, id)
  let items = await furniture(page)
  expect(items.map((f) => f.catalogItemId).sort()).toEqual(['own_clock_wall', 'own_mirror', 'own_picture', 'own_shelf_wall', 'own_tv_wall'])

  // Выбрана последняя добавленная вещь (часы): поле высоты есть, стрелки меняют на 5 см.
  const field = page.getByTestId('elevation')
  await expect(field).toHaveValue('180')
  await page.getByTestId('elevation-down').click()
  await expect(field).toHaveValue('175')
  await field.fill('170')
  await field.press('Enter')
  await expect(field).toHaveValue('170')
  await expect(page.getByTestId('message')).toHaveCount(0)
  items = await furniture(page)
  expect(items.find((f) => f.catalogItemId === 'own_clock_wall').elevationCm).toBe(170)

  // Сквозь соседа на той же стене не повесить (телевизор занимает 100–164 см): отказ с причиной.
  await field.fill('150')
  await field.press('Enter')
  await expect(page.getByTestId('message')).toContainText('пересекается')

  // Выше потолка — отказ с причиной, значение не меняется.
  await field.fill('400')
  await field.press('Enter')
  await expect(page.getByTestId('message')).toContainText('потолок')
  items = await furniture(page)
  expect(items.find((f) => f.catalogItemId === 'own_clock_wall').elevationCm).toBe(170)

  // Для напольного предмета поля высоты нет.
  await add(page, 'kenney_bedDouble')
  await expect(page.getByTestId('elevation')).toHaveCount(0)
  await page.screenshot({ path: `${OUT}/wallmount-chrome.png` })
})
