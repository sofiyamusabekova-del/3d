import { expect, test, type Page } from '@playwright/test'

// Этап 29: главное меню. Остальные тесты идут с выключенным меню (ключ в storageState playwright.config.ts),
// здесь меню включено явно: хранилище пустое, а ключ ставится и снимается руками.
const KEY = 'interior-planner:skip-start'
const SAVE = 'interior-planner:project:v1'

async function skipOn(page: Page) { await page.addInitScript((k) => localStorage.setItem(k, '1'), KEY) }

/** Делает проект (схема 1Б, настройка), ждёт автосохранения; возвращает текст сохранения. */
async function makeSavedProject(page: Page): Promise<string> {
  await page.goto('/')
  await page.evaluate((k) => localStorage.setItem(k, '1'), KEY)
  await page.reload()
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('43')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await expect(page.getByTestId('project-status')).toContainText('Сохранено в браузере', { timeout: 10_000 })
  const text = await page.evaluate((k) => localStorage.getItem(k), SAVE)
  expect(text).toBeTruthy()
  await page.evaluate((k) => localStorage.removeItem(k), KEY)
  return text as string
}

test.describe('главное меню', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('29.1: первый запуск: меню с фразой и кнопками, без «Продолжить»; «Новый проект» открывает мастер', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start-menu')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Планировщик квартиры')
    await expect(page.locator('.start-brand')).toHaveCount(0) // подписи сверху и ползунка времени нет
    await expect(page.getByTestId('start-hour')).toHaveCount(0)
    await expect(page.getByTestId('start-open-file')).toHaveText('Открыть проект')
    await expect(page.getByTestId('start-scene')).toBeVisible()
    await expect(page.getByTestId('start-continue')).toHaveCount(0)
    await expect(page.getByTestId('start-open-file')).toBeVisible()
    await expect(page.getByTestId('area-input')).toHaveCount(0)
    await page.getByTestId('start-new').click()
    await expect(page.getByTestId('area-input')).toBeVisible()
    await expect(page.getByTestId('start-menu')).toHaveCount(0)
  })

  test('29.2: меню открывается днём, режим читается из атрибутов', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-mode', 'day')
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-hour', '15.0')
  })

  test('30.1: живая 3D-комната загружается, запасная картинка скрывается, шнур и подсказка на месте', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start-room3d')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
    await expect(page.getByTestId('start-cord')).toBeVisible()
    await expect(page.getByText('Потяните за шнур, чтобы изменить освещение')).toBeAttached()
    const box = await page.getByTestId('start-cord').boundingBox()
    const stage = await page.getByTestId('start-room3d').boundingBox()
    expect(box && stage && box.x > stage.x && box.x < stage.x + stage.width && box.y > stage.y && box.y < stage.y + stage.height).toBe(true)
    expect(await page.locator('canvas').count()).toBe(1)
  })

  test('30.2: клавиатура: Enter на шнуре переводит день в ночь и обратно, ползунок едет вместе со светом', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start-room3d')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
    const cord = page.getByTestId('start-cord')
    await cord.focus()
    await expect(cord).toHaveAttribute('aria-checked', 'false')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-hour', '23.0', { timeout: 15_000 })
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-mode', 'night')
    await expect(cord).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-hour', '13.0', { timeout: 15_000 })
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-mode', 'day')
  })

  test('30.3: шнур тянут мышью: долгое вытягивание включает ночь один раз, короткое движение ничего не меняет', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start-room3d')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
    await page.waitForTimeout(3600) // намёк шнура закончился
    const grab = async () => { const b = (await page.getByTestId('start-cord').boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
    // Короткое движение
    let p = await grab()
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move(p.x, p.y + 12, { steps: 4 })
    await page.mouse.move(p.x, p.y + 20, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(1800)
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-mode', 'day')
    // Длинное вытягивание
    p = await grab()
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move(p.x + 4, p.y + 60, { steps: 8 })
    await page.mouse.move(p.x + 4, p.y + 220, { steps: 16 })
    await page.waitForTimeout(500)
    await page.mouse.up()
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-hour', '23.0', { timeout: 15_000 })
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-mode', 'night')
  })

  test('30.4: час общий с редактором: ночь, выбранная шнуром в меню, видна в ползунке времени суток редактора; в хранилище ничего не пишется до выбора', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start-room3d')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
    await page.getByTestId('start-cord').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-hour', '23.0', { timeout: 15_000 })
    expect(await page.evaluate((k) => localStorage.getItem(k), SAVE)).toBeNull()
    await page.getByTestId('start-new').click()
    await page.getByTestId('room-count-1').check()
    await page.getByTestId('area-input').fill('43')
    await page.getByTestId('submit-params').click()
    await page.getByTestId('choose-1b').click()
    await page.getByTestId('to-interior').click()
    await expect(page.getByTestId('interior-scene')).toBeVisible()
    await expect(page.getByTestId('time-label')).toHaveText('23:00')
  })

  test('31.1: смена режима плавная: час проходит промежуточные значения, небо и светила следуют за ним', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start-room3d')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
    expect(await page.evaluate(() => typeof (window as any).__start?.setHour)).toBe('function')
    await page.getByTestId('start-cord').focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => { const h = Number(document.querySelector('[data-testid=start-menu]')?.getAttribute('data-hour')); return h > 17 && h < 22 }, null, { timeout: 15_000, polling: 'raf' })
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-hour', '23.0', { timeout: 15_000 })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => { const h = Number(document.querySelector('[data-testid=start-menu]')?.getAttribute('data-hour')); return h > 14 && h < 21 }, null, { timeout: 15_000, polling: 'raf' })
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-hour', '13.0', { timeout: 15_000 })
  })

  test('30.5: уменьшенное движение: переход света мгновенный, без пружины', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.getByTestId('start-room3d')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
    await page.getByTestId('start-cord').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('start-menu')).toHaveAttribute('data-hour', '23.0', { timeout: 5000 })
  })

  test('30.6: на узком экране сцена и текст идут столбцом, лампа и шнур доступны', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByTestId('start-room3d')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over).toBeLessThanOrEqual(0)
    const scene = (await page.getByTestId('start-scene').boundingBox())!
    const btn = (await page.getByTestId('start-new').boundingBox())!
    expect(btn.y).toBeGreaterThan(scene.y + scene.height - 1)
    await expect(page.getByTestId('start-cord')).toBeVisible()
  })

  test('29.3: с сохранённым проектом есть «Продолжить»: проект и шаг восстанавливаются, повторного предложения нет', async ({ page }) => {
    const text = await makeSavedProject(page)
    await page.reload()
    await expect(page.getByTestId('start-continue')).toContainText('Схема 1Б')
    await page.getByTestId('start-continue').click()
    await expect(page.getByTestId('area-input')).toHaveCount(0)
    await expect(page.getByTestId('restore-offer')).toHaveCount(0)
    await expect(page.getByTestId('step-setup')).toBeEnabled()
    expect(await page.evaluate((k) => localStorage.getItem(k) !== null, SAVE)).toBe(true)
    expect(text.length).toBeGreaterThan(100)
  })

  test('29.4: «Новый проект» при сохранении просит подтверждение; отмена ничего не удаляет, подтверждение очищает сохранение', async ({ page }) => {
    await makeSavedProject(page)
    await page.reload()
    await page.getByTestId('start-new').click()
    await expect(page.getByTestId('start-new-confirm')).toBeVisible()
    await page.getByTestId('start-new-no').click()
    await expect(page.getByTestId('start-new-confirm')).toHaveCount(0)
    expect(await page.evaluate((k) => localStorage.getItem(k) !== null, SAVE)).toBe(true)
    await page.getByTestId('start-new').click()
    await page.getByTestId('start-new-yes').click()
    await expect(page.getByTestId('area-input')).toBeVisible()
    await expect(page.getByTestId('restore-offer')).toHaveCount(0)
    expect(await page.evaluate((k) => localStorage.getItem(k), SAVE)).toBeNull()
  })

  test('29.5: «Открыть файл»: плохой файл даёт понятную ошибку и меню остаётся, хороший открывает проект', async ({ page }) => {
    const text = await makeSavedProject(page)
    await page.evaluate((k) => localStorage.removeItem(k), SAVE)
    await page.reload()
    await expect(page.getByTestId('start-continue')).toHaveCount(0)
    await page.getByTestId('start-file-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('это не проект') })
    await expect(page.getByTestId('start-error')).toBeVisible()
    await expect(page.getByTestId('start-menu')).toBeVisible()
    await page.getByTestId('start-file-input').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(text) })
    await expect(page.getByTestId('start-menu')).toHaveCount(0)
    await expect(page.getByTestId('restore-offer')).toHaveCount(0)
    await expect(page.getByTestId('step-setup')).toBeEnabled()
  })

  test('29.6: меню читается с клавиатуры и без горизонтальной прокрутки в 1280×720 и 800×600', async ({ page }) => {
    for (const [width, height] of [[1280, 720], [800, 600]]) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(over, `${width}×${height}`).toBeLessThanOrEqual(0)
      await expect(page.getByTestId('start-new')).toBeVisible()
    }
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    const tag = await page.evaluate(() => document.activeElement?.tagName)
    expect(['BUTTON', 'INPUT']).toContain(tag)
  })
})

test('29.7: с ключом пропуска меню не показывается (так идут остальные тесты)', async ({ page }) => {
  await skipOn(page)
  await page.goto('/')
  await expect(page.getByTestId('area-input')).toBeVisible()
  await expect(page.getByTestId('start-menu')).toHaveCount(0)
})
