import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Этап 27: сохранение проекта: автосохранение в браузере и восстановление, файл проекта, новый проект.
const project = (page: Page) => page.evaluate(() => JSON.stringify((window as any).__interior.project.getState().history.present))

/** Рабочий проект: схема 1Б, интерьер, мебель, покрытие пола, отделка стены, ночь и выключенный свет. */
async function buildWork(page: Page) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('43')
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
  for (const item of ['sofa_02', 'kenney_lampRoundFloor']) { await page.getByTestId('catalog-scope-all').click(); await page.getByTestId(`add-${item}`).click() }
  await page.getByTestId('floor-laminate-oak_natural').click()
  await page.getByTestId('side-0').click()
  await page.locator('[data-testid^="paint-"]').nth(3).click()
  await page.getByTestId('time-Ночь').click()
  await page.getByTestId('lights-toggle').click()
  return id
}

const waitSaved = (page: Page) => expect(page.getByTestId('project-status')).toContainText('Сохранено в браузере', { timeout: 10_000 })

test('27.2: автосохранение; после перезагрузки предлагается продолжить, проект, сценарий и время суток восстанавливаются', async ({ page }) => {
  const roomId = await buildWork(page)
  await waitSaved(page)
  const before = await project(page)
  await page.reload()
  // Само ничего не применилось: ждём решения пользователя.
  await expect(page.getByTestId('restore-offer')).toBeVisible()
  await expect(page.getByTestId('restore-offer')).toContainText('Схема 1Б')
  await expect(page.getByTestId('restore-offer')).toContainText('предметов: 2')
  await expect(page.getByTestId('area-input')).toBeVisible() // начальный экран, проект не открыт
  await page.getByTestId('restore-continue').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
  expect(await project(page)).toBe(before)
  await expect(page.getByTestId('time-label')).toHaveText('23:00')
  await expect(page.getByTestId('lights-toggle')).toContainText('выкл')
  await expect(page.getByTestId('floor-current')).toContainText('Ламинат, Дуб натуральный')
  expect(await page.evaluate(() => (window as any).__interior.store.getState().activeRoomId)).toBe(roomId)
  // История отмены не сохраняется: отменять нечего.
  await expect(page.getByTestId('undo')).toBeDisabled()
  await expect(page.getByTestId('restore-offer')).toHaveCount(0)
})

test('27.2: отказ от сохранения удаляет его: после перезагрузки предложения нет', async ({ page }) => {
  await buildWork(page)
  await waitSaved(page)
  await page.reload()
  await page.getByTestId('restore-discard').click()
  await expect(page.getByTestId('restore-offer')).toHaveCount(0)
  await expect(page.getByTestId('area-input')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('area-input')).toBeVisible()
  await expect(page.getByTestId('restore-offer')).toHaveCount(0)
})

test('27.3: сохранение в файл: имя с датой, внутри формат, версия, квартира, мебель', async ({ page }) => {
  await buildWork(page)
  const before = await project(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('project-save-file').click()])
  expect(download.suggestedFilename()).toMatch(/^kvartira-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  const path = await download.path()
  const doc = JSON.parse(readFileSync(path!, 'utf8'))
  expect(doc.format).toBe('interior-planner-project')
  expect(doc.version).toBe(1)
  expect(JSON.stringify(doc.apartment)).toBe(before)
  expect(doc.flow).toMatchObject({ roomCount: 1, templateId: '1b', step: 'interior', areaM2: 43 })
  expect(doc.ui.hour).toBe(23)
  expect(Object.keys(doc.apartment.furniture)).toHaveLength(2)
  await expect(page.getByTestId('project-notice')).toContainText('сохранён в файл')
})

test('27.3: новый проект спрашивает подтверждение; файл возвращает работу; плохой файл ничего не ломает', async ({ page }) => {
  await buildWork(page)
  const before = await project(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('project-save-file').click()])
  const file = readFileSync((await download.path())!)

  // Новый проект: отмена оставляет всё как есть, подтверждение очищает.
  await page.getByTestId('project-new').click()
  await expect(page.getByTestId('project-dialog')).toBeVisible()
  await page.getByTestId('project-dialog-cancel').click()
  await expect(page.getByTestId('project-dialog')).toHaveCount(0)
  expect(await project(page)).toBe(before)
  await page.getByTestId('project-new').click()
  await page.getByTestId('project-dialog-confirm').click()
  await expect(page.getByTestId('area-input')).toBeVisible()
  await expect(page.getByTestId('project-new')).toBeDisabled()

  // Плохие файлы: причина понятна, проекта нет и не появляется.
  const input = page.getByTestId('project-file-input')
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('это не проект') })
  await expect(page.getByTestId('project-error')).toContainText('JSON')
  await input.setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'interior-planner-project', version: 7 })) })
  await expect(page.getByTestId('project-error')).toContainText('более новой версией')
  await expect(page.getByTestId('area-input')).toBeVisible()

  // Хороший файл: проект открыт сразу (работы нет), всё вернулось.
  await input.setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: file })
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
  expect(await project(page)).toBe(before)
  await expect(page.getByTestId('time-label')).toHaveText('23:00')
  await expect(page.getByTestId('lights-toggle')).toContainText('выкл')
  await expect(page.getByTestId('project-error')).toHaveCount(0)

  // Файл при открытой работе просит подтверждения; плохой файл проект не трогает.
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"interior-planner-project","version":1,"apartment":{}}') })
  await expect(page.getByTestId('project-error')).toContainText('Текущий проект не изменён')
  expect(await project(page)).toBe(before)
  await input.setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: file })
  await expect(page.getByTestId('project-dialog')).toBeVisible()
  await page.getByTestId('project-dialog-cancel').click()
  expect(await project(page)).toBe(before)
})

test('27.2: хранилище браузера недоступно: понятное сообщение, работа и сохранение в файл продолжаются', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
  })
  await buildWork(page)
  await expect(page.getByTestId('project-status')).toContainText('Автосохранение недоступно', { timeout: 10_000 })
  await expect(page.getByTestId('storage-error')).toContainText('Сохраняйте проект в файл')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('project-save-file').click()])
  expect(download.suggestedFilename()).toMatch(/\.json$/)
  // Редактор жив: предмет добавляется.
  const count = () => page.evaluate(() => Object.keys((window as any).__interior.project.getState().history.present.furniture).length)
  const n = await count()
  await page.getByTestId('catalog-scope-all').click()
  await page.getByTestId('add-kenney_lampSquareFloor').click()
  expect(await count()).toBe(n + 1)
})

test('27.4: меню проекта доступно с клавиатуры, кнопки без проекта отключены', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('project-save-file')).toBeDisabled()
  await expect(page.getByTestId('project-new')).toBeDisabled()
  await expect(page.getByTestId('project-open-file')).toBeEnabled()
  await page.getByTestId('project-open-file').focus()
  const focused = await page.evaluate(() => { const e = document.activeElement as HTMLElement; const s = getComputedStyle(e); return { id: e.getAttribute('data-testid'), outline: s.outlineStyle, w: parseFloat(s.outlineWidth) } })
  expect(focused.id).toBe('project-open-file')
  expect(focused.outline !== 'none' && focused.w >= 2).toBe(true)
})
