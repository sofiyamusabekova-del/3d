import { expect, test, type Page } from '@playwright/test'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 13: рабочий каталог мебели (SPEC §12, AC-12, AC-13).
const apt = () => buildApartment(templateById('2b')!)
const room = (name: string) => Object.values(apt().rooms).find((r) => r.name === name)!

async function openInterior(page: Page, roomName: string) {
  await page.goto('/')
  await page.getByTestId('room-count-2').check()
  await page.getByTestId('area-input').fill('55')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-2b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await enter(page, roomName)
}

async function enter(page: Page, name: string) {
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), room(name).id)
  await expect(page.getByTestId('active-room')).toHaveText(name)
  await page.waitForTimeout(300)
}

const furnitureIds = (page: Page) => page.evaluate(() => Object.keys((window as any).__interior.project.getState().history.present.furniture as object))

/** В 3D вместо объёма загрузки появилась настоящая модель предмета. */
const modelLoaded = (page: Page, id: string) => page.waitForFunction((i) => {
  let ok = false
  ;(window as any).__interior.probe.scene.traverse((o: any) => {
    if (o.name === `furniture-${i}`) o.traverse((m: any) => { if (m.isMesh && m.name !== 'model-loading' && m.name !== 'model-error') ok = true })
  })
  return ok
}, id)

test('13.5: в спальне предлагаются спальные предметы, «все предметы» показывают остальные', async ({ page }) => {
  await openInterior(page, 'Спальня')
  await expect(page.getByTestId('card-painted_wooden_nightstand')).toBeVisible()
  await expect(page.getByTestId('card-sofa_02')).toHaveCount(0)
  const roomCount = await page.getByTestId('catalog-count').textContent()
  await page.getByTestId('catalog-scope-all').click()
  await expect(page.getByTestId('card-sofa_02')).toBeVisible()
  expect(await page.getByTestId('catalog-count').textContent()).not.toBe(roomCount)
  // Карточка показывает габариты в см и превью.
  await expect(page.getByTestId('dims-sofa_02')).toHaveText('181 × 82 × 71 см')
  const img = page.getByTestId('card-sofa_02').locator('img')
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  // Категория и поиск.
  await page.getByTestId('catalog-category').selectOption('Стулья')
  await expect(page.getByTestId('card-sofa_02')).toHaveCount(0)
  await expect(page.getByTestId('card-dining_chair_02')).toBeVisible()
  await page.getByTestId('catalog-category').selectOption('')
  await page.getByTestId('catalog-search').fill('диван')
  await expect(page.getByTestId('card-sofa_02')).toBeVisible()
  await expect(page.getByTestId('card-dining_chair_02')).toHaveCount(0)
  await page.getByTestId('catalog-search').fill('zzzz')
  await expect(page.getByTestId('catalog-empty')).toContainText('Ничего не найдено')
})

test('13.1/13.5: санузел, кухня и спальня получают сантехнику, технику и кровати из Kenney', async ({ page }) => {
  await openInterior(page, 'Санузел')
  for (const id of ['kenney_toilet', 'kenney_bathtub', 'kenney_bathroomSink']) await expect(page.getByTestId(`card-${id}`)).toBeVisible()
  await expect(page.getByTestId('card-kenney_bedDouble')).toHaveCount(0)
  await page.getByTestId('add-kenney_toilet').click()
  const [id] = await furnitureIds(page)
  await modelLoaded(page, id)
  await enter(page, 'Кухня')
  for (const k of ['kenney_kitchenFridge', 'kenney_kitchenStove', 'kenney_kitchenSink']) await expect(page.getByTestId(`card-${k}`)).toBeVisible()
  await enter(page, 'Спальня')
  for (const k of ['kenney_bedDouble', 'kenney_bedSingle', 'kenney_cabinetBed']) await expect(page.getByTestId(`card-${k}`)).toBeVisible()
  await expect(page.getByTestId('dims-kenney_bedDouble')).toHaveText('170 × 200 × 67 см')
})

test('13.5: при смене комнаты каталог показывает предметы её типа', async ({ page }) => {
  await openInterior(page, 'Спальня')
  await expect(page.getByTestId('catalog-scope-room')).toContainText('Спальня')
  await enter(page, 'Кухня')
  await expect(page.getByTestId('catalog-scope-room')).toContainText('Кухня')
  await expect(page.getByTestId('card-dining_chair_02')).toBeVisible()
  await expect(page.getByTestId('card-painted_wooden_nightstand')).toHaveCount(0)
})

test('13.6 (AC-13): ошибка загрузки одной модели не ломает остальные, есть причина и повтор', async ({ page }) => {
  await page.route('**/catalog/ArmChair_01/*.glb', (r) => r.abort())
  await openInterior(page, 'Гостиная')
  await page.getByTestId('add-ArmChair_01').click()
  await page.getByTestId('add-sofa_02').click()
  const ids = await furnitureIds(page)
  expect(ids).toHaveLength(2) // предмет с неудачной моделью остаётся в проекте
  await expect(page.getByTestId('model-error-ArmChair_01')).toContainText('Не удалось загрузить модель «Кресло»')
  await expect(page.getByTestId('model-error-ArmChair_01')).toContainText('Остальные предметы работают')
  // Диван загрузился и работает; кресло показано как ошибка (красный каркас), а не как «готовая модель».
  const sofa = await page.evaluate(() => { const f = Object.values((window as any).__interior.project.getState().history.present.furniture as Record<string, any>) as any[]; return f.find((x) => x.catalogItemId === 'sofa_02').id as string })
  await modelLoaded(page, sofa)
  const names = await page.evaluate(() => { const n: string[] = []; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-error') n.push(o.name) }); return n })
  expect(names).toHaveLength(1)
  // Редактор жив: переход и добавление ещё одного предмета работают.
  await enter(page, 'Кухня')
  await enter(page, 'Гостиная')
  await expect(page.getByTestId('model-error-ArmChair_01')).toBeVisible()
  // Повтор после починки сети: ошибка исчезает, модель загружается.
  await page.unroute('**/catalog/ArmChair_01/*.glb')
  await page.getByTestId('retry-ArmChair_01').click()
  await expect(page.getByTestId('model-error-ArmChair_01')).toHaveCount(0)
  const arm = ids.find((i) => i !== sofa)!
  await modelLoaded(page, arm)
  await expect.poll(() => page.evaluate(() => { let n = 0; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-error') n++ }); return n })).toBe(0)
})

test('13.6: файл модели загружается один раз для нескольких экземпляров', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => { if (r.url().endsWith('/catalog/dining_chair_02/dining_chair_02.glb')) requests.push(r.url()) })
  await openInterior(page, 'Гостиная')
  for (let i = 0; i < 3; i++) await page.getByTestId('add-dining_chair_02').click()
  const ids = await furnitureIds(page)
  expect(ids).toHaveLength(3)
  for (const id of ids) await modelLoaded(page, id)
  expect(requests).toHaveLength(1)
  // У экземпляров свои материалы: подсветка выбранного не меняет остальные.
  const emissive = await page.evaluate((all) => {
    const out: Record<string, number> = {}
    ;(window as any).__interior.probe.scene.traverse((o: any) => {
      const m = /^furniture-(.+)$/.exec(o.name ?? '')
      if (m && all.includes(m[1])) o.traverse((c: any) => { if (c.isMesh && c.material?.emissiveIntensity !== undefined) out[m[1]] = Math.max(out[m[1]] ?? 0, c.material.emissiveIntensity) })
    })
    return out
  }, ids)
  const selected = await page.evaluate(() => (window as any).__interior.editor.getState().selectedId as string)
  for (const id of ids) expect(emissive[id] > 0, id).toBe(id === selected)
})

test('13.5: добавленный предмет из каталога встаёт в комнату допустимо и виден в плане и 3D', async ({ page }) => {
  await openInterior(page, 'Спальня')
  await page.getByTestId('add-painted_wooden_nightstand').click()
  const [id] = await furnitureIds(page)
  await expect(page.getByTestId(`plan-item-${id}`)).toBeVisible()
  await modelLoaded(page, id)
  await expect(page.getByTestId('selection')).toContainText('Тумбочка')
})
