import { expect, test, type Page } from '@playwright/test'
import { roomBox } from '../../src/domain/geometryEdit'
import type { Apartment } from '../../src/domain/types'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 8: настройка общей квартиры (SPEC §9, AC-03).
const apt = (): Apartment => buildApartment(templateById('1b')!)
const room = (a: Apartment, name: string) => Object.values(a.rooms).find((r) => r.name === name)!

/** Участок стены комнаты на краю по оси x: min — левый, max — правый. */
function wallAtX(a: Apartment, name: string, side: 'min' | 'max'): string {
  const walls = room(a, name).boundary
    .map((b) => a.walls[b.wallId])
    .filter((w) => a.vertices[w.startVertexId].xCm === a.vertices[w.endVertexId].xCm)
    .sort((p, q) => (side === 'min' ? 1 : -1) * (a.vertices[p.startVertexId].xCm - a.vertices[q.startVertexId].xCm))
  return walls[0].id
}

async function openSetup(page: Page) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
}

const areaText = async (page: Page) => (await page.getByTestId('setup-area').textContent()) ?? ''

test('8.1: выбранная стена подсвечена целиком, виден её размер в см', async ({ page }) => {
  const a = apt()
  await openSetup(page)
  await expect(page.getByTestId('wall-hint')).toBeVisible()
  await page.getByTestId(`pick-wall-${wallAtX(a, 'Кухня', 'min')}`).click()
  await expect(page.getByTestId('wall-title')).toContainText('Общая стена')
  await expect(page.getByTestId('wall-title')).toContainText('«Комната»')
  await expect(page.getByTestId('wall-title')).toContainText('«Кухня»')
  await expect(page.locator('[data-testid^="plan-wall-"][data-selected="main"]')).toHaveCount(1)
  expect(await page.locator('[data-testid^="plan-wall-"][data-selected="line"]').count()).toBeGreaterThanOrEqual(2)
  await expect(page.getByTestId('plan-wall-length')).toContainText('см')
  // Клик по пустому месту снимает выбор.
  await page.getByTestId('setup-plan').click({ position: { x: 3, y: 3 } })
  await expect(page.getByTestId('wall-hint')).toBeVisible()
  await expect(page.locator('[data-testid^="plan-wall-"][data-selected]')).toHaveCount(0)
})

test('8.2 + 8.4: размер числом даёт предпросмотр, Enter применяет, отмена возвращает', async ({ page }) => {
  const a = apt()
  const living = room(a, 'Комната')
  const w = Math.round(roomBox(a, living).widthCm)
  await openSetup(page)
  const before = await areaText(page)
  await page.getByTestId(`pick-wall-${wallAtX(a, 'Кухня', 'min')}`).click()
  const input = page.getByTestId(`size-${living.id}`)
  await expect(input).toHaveValue(String(w))
  await input.fill(String(w + 30))
  await expect(page.getByTestId('move-preview')).toBeVisible()
  await expect(page.getByTestId(`affected-${living.id}`)).toContainText(`${w + 30} см`)
  await expect(page.getByTestId(`affected-${room(a, 'Кухня').id}`)).toContainText('→')
  await expect(page.getByTestId('area-change')).toContainText('→')
  expect(await areaText(page)).toBe(before) // до применения квартира не изменилась
  await input.press('Enter')
  await expect(page.getByTestId('notice')).toContainText('Стена сдвинута')
  expect(await areaText(page)).not.toBe(before)
  await expect(page.getByTestId(`size-${living.id}`)).toHaveValue(String(w + 30))
  await page.getByTestId('undo').click()
  expect(await areaText(page)).toBe(before)
  await expect(page.getByTestId('undo')).toBeDisabled()
  await page.getByTestId('redo').click()
  await expect(page.getByTestId(`size-${living.id}`)).toHaveValue(String(w + 30))
})

test('8.5: недопустимый сдвиг назван конкретной причиной, квартира не меняется', async ({ page }) => {
  const a = apt()
  const living = room(a, 'Комната')
  const w = Math.round(roomBox(a, living).widthCm)
  await openSetup(page)
  const before = await areaText(page)
  await page.getByTestId(`pick-wall-${wallAtX(a, 'Кухня', 'min')}`).click()
  await page.getByTestId(`size-${living.id}`).fill(String(w + 250))
  await expect(page.getByTestId('move-issues')).toBeVisible()
  await expect(page.getByTestId('move-issues')).toContainText(/Дверь|Окно/)
  await expect(page.getByTestId('move-issues')).not.toContainText('Неверный размер')
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('refusal')).toContainText('квартира осталась прежней')
  expect(await areaText(page)).toBe(before)
  await expect(page.getByTestId('undo')).toBeDisabled()
  // Ошибка ввода: сначала понятное сообщение, не предпросмотр.
  await page.getByTestId(`size-${living.id}`).fill('5')
  await expect(page.getByTestId('size-error')).toContainText('минимум 80')
  await page.getByTestId('move-cancel').click()
  await expect(page.getByTestId('move-preview')).toHaveCount(0)
})

test('8.3: внешняя стена меняет площадь, это показано до и после', async ({ page }) => {
  const a = apt()
  const living = room(a, 'Комната')
  const w = Math.round(roomBox(a, living).widthCm)
  await openSetup(page)
  const net = await areaText(page)
  const outer = (await page.getByTestId('setup-outer').textContent()) ?? ''
  // В середине этой стены окно: проём выбирается поверх стены, поэтому кликаем у её края (этап 9).
  const box = (await page.getByTestId(`pick-wall-${wallAtX(a, 'Комната', 'min')}`).boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85)
  await expect(page.getByTestId('wall-title')).toContainText('Внешняя стена')
  await page.getByTestId(`size-${living.id}`).fill(String(w + 50))
  await expect(page.getByTestId('move-preview')).toContainText('внешний контур')
  await expect(page.getByTestId('move-apply')).toHaveText('Изменить внешний контур')
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('notice')).toContainText('Внешний контур изменён')
  expect(await areaText(page)).not.toBe(net)
  expect(await page.getByTestId('setup-outer').textContent()).not.toBe(outer)
  await expect(page.getByTestId('setup-furniture')).toContainText('Мебель: 0')
})

test('7.5 (после 8): замена схемы при правках требует подтверждения и очищает историю', async ({ page }) => {
  const a = apt()
  const living = room(a, 'Комната')
  const w = Math.round(roomBox(a, living).widthCm)
  await openSetup(page)
  const original = await areaText(page)
  await page.getByTestId(`pick-wall-${wallAtX(a, 'Кухня', 'min')}`).click()
  await page.getByTestId(`size-${living.id}`).fill(String(w + 30))
  await page.getByTestId('move-apply').click()
  const edited = await areaText(page)
  expect(edited).not.toBe(original)
  await page.getByTestId('back-to-schemes').click()
  await page.getByTestId('choose-1v').click()
  await expect(page.getByTestId('replace-dialog')).toBeVisible()
  await page.getByTestId('replace-cancel').click()
  await page.getByTestId('choose-1b').click() // повторный выбор той же схемы продолжает правки
  expect(await areaText(page)).toBe(edited)
  await page.getByTestId('back-to-schemes').click()
  await page.getByTestId('choose-1v').click()
  await page.getByTestId('replace-confirm').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  await expect(page.getByTestId('undo')).toBeDisabled()
})

test('8.6: высота потолка; проём выше потолка блокирует изменение', async ({ page }) => {
  await openSetup(page)
  await expect(page.getByTestId('ceiling-input')).toHaveValue('270')
  await page.getByTestId('ceiling-input').fill('225') // окно: подоконник 90 + высота 140 = 230 см
  await page.getByTestId('ceiling-apply').click()
  await expect(page.getByTestId('refusal')).toContainText('Окно')
  await expect(page.getByTestId('refusal')).toContainText('230')
  await expect(page.getByTestId('undo')).toBeDisabled()
  await page.getByTestId('ceiling-input').fill('250')
  await page.getByTestId('ceiling-input').press('Enter')
  await expect(page.getByTestId('notice')).toContainText('250 см')
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('ceiling-input')).toHaveValue('270')
  await page.getByTestId('ceiling-input').fill('500')
  await page.getByTestId('ceiling-apply').click()
  await expect(page.getByTestId('refusal')).toContainText('400')
})
