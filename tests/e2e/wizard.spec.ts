import { expect, test } from '@playwright/test'

// Этап 7: стартовый сценарий до пустой согласованной квартиры (AC-01 в части старта).
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('area-input')).toBeVisible()
})

const planDims = async (page: import('@playwright/test').Page) =>
  page.locator('[data-testid^="plan-room-"]').count()

for (const [rooms, area, scheme] of [[1, '36', '1b'], [2, '52,5', '2b'], [3, '70', '3a']] as const) {
  test(`7.4: ${rooms} жил. комн. → площадь → схема → настройка без мебели`, async ({ page }) => {
    await page.getByTestId(`room-count-${rooms}`).check()
    await page.getByTestId('area-input').fill(area)
    await page.getByTestId('submit-params').click()
    await expect(page.getByTestId('approx-note')).toContainText('примерные')
    await expect(page.locator('[data-testid^="scheme-"]')).toHaveCount(3)
    await expect(page.locator('[data-testid^="closest-"]')).toHaveCount(1)
    await expect(page.getByTestId(`preview-${scheme}`)).toBeVisible()
    await page.getByTestId(`choose-${scheme}`).click()
    await expect(page.getByTestId('setup-plan')).toBeVisible()
    await expect(page.getByTestId('setup-furniture')).toContainText('Мебель: 0')
    await expect(page.getByTestId('setup-area')).toContainText('м²')
    expect(await planDims(page)).toBeGreaterThanOrEqual(4)
  })
}

test('7.1: ошибки ввода площади понятны и не пускают дальше', async ({ page }) => {
  await page.getByTestId('submit-params').click()
  await expect(page.getByTestId('area-error')).toHaveText('Введите примерную площадь в м²')
  await page.getByTestId('area-input').fill('сорок')
  await page.getByTestId('submit-params').click()
  await expect(page.getByTestId('area-error')).toContainText('Введите число')
  await page.getByTestId('area-input').fill('9')
  await page.getByTestId('submit-params').click()
  await expect(page.getByTestId('area-error')).toContainText('минимум 15')
  await expect(page.getByTestId('step-schemes')).toBeDisabled()
  await page.getByTestId('area-input').fill('45,55')
  await page.getByTestId('submit-params').click()
  await expect(page.locator('[data-testid^="scheme-"]')).toHaveCount(3)
  await page.getByTestId('back-to-params').click()
  await expect(page.getByTestId('area-input')).toHaveValue('45,6') // поле показывает округлённый результат
})

test('7.5 / AC-01: возврат между шагами не теряет данные; повторный выбор продолжает с той же схемой', async ({ page }) => {
  await page.getByTestId('room-count-2').check()
  await page.getByTestId('area-input').fill('50')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-2a').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  await page.getByTestId('step-params').click()
  await expect(page.getByTestId('room-count-2')).toBeChecked()
  await expect(page.getByTestId('area-input')).toHaveValue('50')
  await page.getByTestId('step-schemes').click()
  await expect(page.getByTestId('scheme-2a')).toContainText('выбрана')
  await page.getByTestId('choose-2a').click() // повторный выбор той же схемы
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  // Другая схема без правок заменяет квартиру сразу.
  await page.getByTestId('back-to-schemes').click()
  await page.getByTestId('choose-2b').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  await expect(page.getByTestId('replace-dialog')).toHaveCount(0)
})
