import { expect, test, type Page } from '@playwright/test'
import { roomClearPolygon } from '../../src/domain/derive'
import { roomBox } from '../../src/domain/geometryEdit'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 15: настройка и интерьер как один сценарий; конфликт со скрытой комнатой; отмена и повтор по всему сценарию.
const project = (page: Page) => page.evaluate(() => (window as any).__interior.project.getState().history.present as any)
const enter = async (page: Page, id: string, name: string) => {
  await page.evaluate((i) => (window as any).__interior.store.getState().enter(i), id)
  await expect(page.getByTestId('active-room')).toHaveText(name)
  await page.waitForTimeout(250)
}

async function startScheme(page: Page, rooms: 1 | 2 | 3, area: string, scheme: string) {
  await page.goto('/')
  await page.getByTestId(`room-count-${rooms}`).check()
  await page.getByTestId('area-input').fill(area)
  await page.getByTestId('submit-params').click()
  await page.getByTestId(`choose-${scheme}`).click()
}

test('15.1–15.4: конфликт в скрытой комнате: причина с комнатой и предметом, переход к предмету, исправление без потерь', async ({ page }) => {
  const a = buildApartment(templateById('1b')!)
  const kitchen = Object.values(a.rooms).find((r) => r.name === 'Кухня')!
  const living = Object.values(a.rooms).find((r) => r.name === 'Комната')!
  await startScheme(page, 1, '36', '1b')
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()

  // 15.1: в интерьере нет правки геометрии, есть возврат в настройку.
  await expect(page.locator('[data-testid^="size-"]')).toHaveCount(0)
  await expect(page.getByTestId('back-to-setup')).toBeVisible()

  // Диван на кухне вплотную к стене, общей с комнатой; в комнате покрашена стена.
  await enter(page, kitchen.id, 'Кухня')
  await page.getByTestId('catalog-scope-all').click() // диван на кухне в каталоге «для комнаты» не предлагается
  await page.getByTestId('add-sofa_02').click()
  const sofaId = Object.keys(await project(page).then((p) => p.furniture))[0]
  const minX = Math.min(...roomClearPolygon(a, kitchen).map((p) => p.x))
  const place = (x: number) => page.evaluate(({ id, x }) => {
    const ed = (window as any).__interior.editor.getState()
    const f = (window as any).__interior.project.getState().history.present.furniture[id]
    ed.beginDrag({ id }, { x: f.xCm, z: f.zCm }, 'plan'); ed.moveDrag({ x, z: f.zCm }, true); ed.endDrag()
  }, { id: sofaId, x })
  await place(minX + 91.5)
  await enter(page, living.id, 'Комната')
  await page.getByTestId('side-0').click()
  await page.getByTestId('finish-clear').waitFor()
  const paint = page.locator('[data-testid^="paint-"]').first()
  await paint.click()
  const stateBefore = JSON.stringify(await project(page))
  expect(Object.keys((await project(page)).surfaceMaterials)).toHaveLength(1)

  // 15.2: возврат в настройку не стирает мебель и отделку.
  await page.getByTestId('back-to-setup').click()
  await expect(page.getByTestId('setup-furniture')).toContainText('1')
  expect(JSON.stringify(await project(page))).toBe(stateBefore)

  // 15.3–15.4: сужение кухни на 20 см отклоняется; причина называет комнату и предмет.
  const shared = kitchen.boundary
    .map((b) => a.walls[b.wallId])
    .filter((w) => a.vertices[w.startVertexId].xCm === a.vertices[w.endVertexId].xCm)
    .sort((p, q) => a.vertices[p.startVertexId].xCm - a.vertices[q.startVertexId].xCm)[0]
  const kitchenW = Math.round(roomBox(a, kitchen).widthCm)
  await page.getByTestId(`pick-wall-${shared.id}`).click()
  await page.getByTestId(`size-${kitchen.id}`).fill(String(kitchenW - 20))
  await expect(page.getByTestId('move-issues')).toContainText('«Кухня»')
  await expect(page.getByTestId('move-issues')).toContainText('«Диван»')
  await page.getByTestId('move-apply').click() // отказ не меняет квартиру
  expect(JSON.stringify(await project(page))).toBe(stateBefore)

  // Показать конфликтующий предмет: интерьер открывается в нужной комнате, предмет выбран.
  await page.getByTestId('refusal').getByTestId(`show-conflict-${sofaId}`).click()
  await expect(page.getByTestId('active-room')).toHaveText('Кухня')
  await expect(page.getByTestId('selection')).toContainText('Диван')
  expect(JSON.stringify(await project(page))).toBe(stateBefore)

  // Исправление: сдвинуть диван от стены; тогда та же правка проходит, остальные данные целы.
  await place(minX + 150)
  await page.getByTestId('back-to-setup').click()
  await page.getByTestId(`pick-wall-${shared.id}`).click()
  await page.getByTestId(`size-${kitchen.id}`).fill(String(kitchenW - 20))
  await expect(page.getByTestId('move-issues')).toHaveCount(0)
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('notice')).toContainText('Стена сдвинута')
  const after = await project(page)
  expect(Object.keys(after.furniture)).toEqual([sofaId])
  expect(Object.keys(after.surfaceMaterials)).toHaveLength(1)
})

for (const [rooms, area, scheme] of [[1, '36', '1b'], [2, '52', '2a'], [3, '70', '3a']] as const) {
  test(`15.5–15.6: сценарий для схемы ${scheme} целиком: мебель и отделка в каждой комнате, отмена и повтор по всему сценарию`, async ({ page }) => {
    await startScheme(page, rooms, area, scheme)
    const a = buildApartment(templateById(scheme)!)
    const list = Object.values(a.rooms)
    // Настройка: потолок на шаге настройки — первый шаг истории.
    await page.getByTestId('ceiling-input').fill('260')
    await page.getByTestId('ceiling-apply').click()
    await expect(page.getByTestId('notice')).toContainText('260')
    await page.getByTestId('to-interior').click()
    await expect(page.getByTestId('interior-scene')).toBeVisible()

    let steps = 1
    for (const r of list) {
      await enter(page, r.id, r.name)
      await page.locator('[data-testid^="add-"]').first().click()
      await expect(page.getByTestId('room-furniture')).toHaveText('1')
      await page.getByTestId('side-0').click()
      await page.locator('[data-testid^="paint-"]').first().click()
      steps += 2
    }
    const full = await project(page)
    expect(Object.keys(full.furniture)).toHaveLength(list.length)
    expect(Object.keys(full.surfaceMaterials)).toHaveLength(list.length)
    // Мебель в каждой комнате лежит в своей комнате, а не в соседней (AC-05).
    for (const r of list) expect(Object.values(full.furniture).filter((f: any) => f.roomId === r.id)).toHaveLength(1)

    // Отмена по всему сценарию клавишей; клавиши в поле ввода не срабатывают (AC-16).
    await page.getByTestId('catalog-search').focus()
    await page.keyboard.press('Control+z')
    expect(Object.keys((await project(page)).surfaceMaterials)).toHaveLength(list.length) // в поле Ctrl+Z правит текст, не проект
    await page.locator('body').click({ position: { x: 2, y: 2 } })
    for (let i = 0; i < steps; i++) await page.keyboard.press('Control+z')
    const empty = await project(page)
    expect(Object.keys(empty.furniture)).toHaveLength(0)
    expect(Object.keys(empty.surfaceMaterials)).toHaveLength(0)
    expect(empty.ceilingHeightCm).toBe(270)
    for (let i = 0; i < steps; i++) await page.keyboard.press('Control+y')
    expect(JSON.stringify(await project(page))).toBe(JSON.stringify(full))
  })
}
