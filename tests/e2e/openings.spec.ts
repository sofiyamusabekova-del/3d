import { expect, test, type Page } from '@playwright/test'
import { roomsOfWall } from '../../src/domain/doors'
import { openingInfo } from '../../src/domain/openingEdit'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 9: окна и двери на шаге настройки (SPEC §9, AC-04, AC-10).
const apt = () => buildApartment(templateById('1b')!)
const doors = (a = apt()) => Object.values(a.openings).filter((o) => o.kind === 'door')
const sharedDoor = () => { const a = apt(); return doors(a).find((o) => roomsOfWall(a, o.wallId).length === 2)! }
const entrance = () => { const a = apt(); return doors(a).find((o) => roomsOfWall(a, o.wallId).length === 1)! }
const win = () => Object.values(apt().openings).find((o) => o.kind === 'window')!

async function openSetup(page: Page) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
}

const cutPoints = async (page: Page, id: string) => (await page.getByTestId(`plan-opening-${id}`).locator('polygon').first().getAttribute('points')) ?? ''

test('9.1: выбор окна, отступ от угла числом, предпросмотр на плане, применение и отмена', async ({ page }) => {
  const w = win()
  const info = openingInfo(apt(), w.id)
  await openSetup(page)
  await expect(page.getByTestId('opening-hint')).toBeVisible()
  await page.getByTestId(`pick-opening-${w.id}`).click()
  await expect(page.getByTestId('opening-title')).toContainText('Окно')
  await expect(page.getByTestId('opening-from')).toHaveValue(String(Math.round(info.fromRefCm * 10) / 10))
  await expect(page.getByTestId(`plan-opening-${w.id}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('plan-opening-label')).toContainText('см')
  const before = await cutPoints(page, w.id)
  await page.getByTestId('opening-from').fill(String(Math.round(info.fromRefCm) + 10))
  await expect(page.getByTestId('opening-preview')).toBeVisible()
  expect(await cutPoints(page, w.id)).not.toBe(before) // предпросмотр виден на плане до применения
  await page.getByTestId('opening-from').press('Enter')
  await expect(page.getByTestId('notice')).toContainText('Проём изменён')
  const after = await cutPoints(page, w.id)
  expect(after).not.toBe(before)
  await page.getByTestId('undo').click()
  expect(await cutPoints(page, w.id)).toBe(before)
})

test('9.2 (AC-04): общая дверь одна, её правка применяется один раз', async ({ page }) => {
  const d = sharedDoor()
  const info = openingInfo(apt(), d.id)
  await openSetup(page)
  await expect(page.getByTestId(`plan-opening-${d.id}`)).toHaveCount(1)
  await page.getByTestId(`pick-opening-${d.id}`).click()
  await expect(page.getByTestId('opening-title')).toContainText('один общий проём')
  const before = await cutPoints(page, d.id)
  await page.getByTestId('opening-from').fill(String(Math.round(info.fromRefCm) + 10))
  await page.getByTestId('opening-apply').click()
  await expect(page.getByTestId('notice')).toContainText('Проём изменён')
  await expect(page.getByTestId(`plan-opening-${d.id}`)).toHaveCount(1)
  expect(await cutPoints(page, d.id)).not.toBe(before)
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('undo')).toBeDisabled() // правка была одним шагом истории
})

test('9.3 (AC-10): выход за стену, размеры вне пределов и высота выше потолка отклоняются с причиной', async ({ page }) => {
  const w = win()
  await openSetup(page)
  const area = (await page.getByTestId('setup-area').textContent()) ?? ''
  await page.getByTestId(`pick-opening-${w.id}`).click()
  await page.getByTestId('opening-from').fill('1400')
  await expect(page.getByTestId('opening-issues')).toContainText('не помещается в стену')
  await page.getByTestId('opening-apply').click()
  await expect(page.getByTestId('refusal')).toContainText('квартира осталась прежней')
  await expect(page.getByTestId('undo')).toBeDisabled()
  expect(await page.getByTestId('setup-area').textContent()).toBe(area)
  await page.getByTestId('opening-cancel').click()
  await page.getByTestId('opening-width').fill('5')
  await expect(page.getByTestId('opening-error')).toContainText('минимум')
  await page.getByTestId('opening-cancel').click()
  await page.getByTestId('opening-height').fill('250')
  await expect(page.getByTestId('opening-issues')).toContainText('выше потолка')
})

test('9.4: панель не предлагает перенос на другую стену, смену вида и удаление', async ({ page }) => {
  const w = win()
  await openSetup(page)
  await page.getByTestId(`pick-opening-${w.id}`).click()
  const panel = page.getByRole('region', { name: 'Окно или дверь' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: /удалить|перенести|добавить/i })).toHaveCount(0)
  await expect(page.getByTestId('door-hinge')).toHaveCount(0) // у окна петель нет
})

test('9.5: петли и направление открывания переключаются, зона створки на плане меняется', async ({ page }) => {
  const d = sharedDoor()
  await openSetup(page)
  await page.getByTestId(`pick-opening-${d.id}`).click()
  const leaf = () => page.getByTestId(`plan-opening-${d.id}`).locator('path').first().getAttribute('d')
  const before = await leaf()
  await page.getByTestId('door-hinge').click()
  await expect(page.getByTestId('notice')).toContainText('петель')
  expect(await leaf()).not.toBe(before)
  const afterHinge = await leaf()
  await page.getByTestId('door-swing').click()
  await expect(page.getByTestId('notice')).toContainText('Дверь открывается в')
  expect(await leaf()).not.toBe(afterHinge)
  await page.getByTestId('undo').click()
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('undo')).toBeDisabled()
  expect(await leaf()).toBe(before)
})

test('9.5: у входной двери можно переставить петли, но открывается она только внутрь', async ({ page }) => {
  const d = entrance()
  await openSetup(page)
  await page.getByTestId(`pick-opening-${d.id}`).click()
  await expect(page.getByTestId('door-hinge')).toBeVisible()
  await expect(page.getByTestId('door-swing')).toHaveCount(0)
  await page.getByTestId('door-hinge').click()
  await expect(page.getByTestId('notice')).toContainText('петель')
})
