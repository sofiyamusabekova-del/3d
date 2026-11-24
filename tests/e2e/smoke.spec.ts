import { expect, test } from '@playwright/test'

// Проверка работоспособности окружения e2e (Tasks 2.4).
test('главная страница открывается, план и canvas видны', async ({ page }) => {
  await page.goto('/?tech')
  await expect(page.getByTestId('plan')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
})
