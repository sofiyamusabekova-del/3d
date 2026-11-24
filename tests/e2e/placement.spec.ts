import { expect, test, type Page } from '@playwright/test'
import { buildApartment, templateById } from '../../src/scenario/layouts'
import { roomCenter } from '../../src/scene3d/roomGeometry'

// Этап 14: размещение из каталога на плане и в 3D, поворот, отмена переноса (AC-06–AC-08, AC-16).
const room = (name: string) => Object.values(buildApartment(templateById('1b')!).rooms).find((r) => r.name === name)!

async function openInterior(page: Page) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), room('Комната').id)
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
  await page.waitForTimeout(500)
}

const furniture = (page: Page) => page.evaluate(() => (window as any).__interior.project.getState().history.present.furniture as Record<string, any>)
const center = async (page: Page, testId: string) => {
  const b = (await page.getByTestId(testId).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const scenePos = (page: Page, id: string) => page.evaluate((i) => (window as any).__interior.scenePosition(i) as { xCm: number; zCm: number } | null, id)
const planPos = async (page: Page, id: string) => {
  const t = (await page.getByTestId(`plan-item-${id}`).locator('g').first().getAttribute('transform')) ?? ''
  const m = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(t)!
  return { xCm: Number(m[1]), zCm: Number(m[2]) }
}

async function dragCard(page: Page, cardId: string, target: { x: number; y: number }) {
  // Карточка может быть ниже видимой части колонки (панели отделки и пола выше): как пользователь, сначала прокручиваем к ней.
  await page.getByTestId(`card-${cardId}`).scrollIntoViewIfNeeded()
  const c = await center(page, `card-${cardId}`)
  await page.mouse.move(c.x - 30, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 10, c.y + 10, { steps: 3 })
  await page.mouse.move(target.x, target.y, { steps: 8 })
  return async () => { await page.mouse.up() }
}

test('14.1: карточка каталога переносится на план; предмет создаётся один раз в активной комнате', async ({ page }) => {
  await openInterior(page)
  const up = await dragCard(page, 'sofa_02', await center(page, 'interior-plan'))
  await expect(page.locator('[data-testid="plan-item-"]')).toHaveCount(0)
  await up()
  const f = Object.values(await furniture(page))
  expect(f).toHaveLength(1)
  expect(f[0].roomId).toBe(room('Комната').id)
  await expect(page.getByTestId('selection')).toContainText('Диван')
  await expect(page.locator('[data-testid^="plan-item-"]')).toHaveCount(1)
})

test('14.2: карточка каталога переносится в 3D; координаты в проекте, на плане и в сцене совпадают (AC-06)', async ({ page }) => {
  await openInterior(page)
  // Цель — центр пола комнаты, переведённый камерой в экранные координаты.
  const c = roomCenter(buildApartment(templateById('1b')!), room('Комната').id)
  const target = await page.evaluate(({ x, z }) => {
    const probe = (window as any).__interior.probe
    const v = new probe.camera.position.constructor(x / 100, 0, z / 100).project(probe.camera)
    const r = probe.gl.domElement.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }, { x: c.x, z: c.z })
  const up = await dragCard(page, 'sofa_02', target)
  await expect(page.getByTestId('reason')).toHaveCount(0)
  await up()
  const f = Object.values(await furniture(page))
  expect(f).toHaveLength(1)
  const id = f[0].id as string
  await page.waitForFunction((i) => (window as any).__interior.scenePosition(i) !== null, id)
  const plan = await planPos(page, id)
  const sc = (await scenePos(page, id))!
  expect(plan.xCm).toBeCloseTo(f[0].xCm, 3)
  expect(plan.zCm).toBeCloseTo(f[0].zCm, 3)
  expect(sc.xCm).toBeCloseTo(f[0].xCm, 1)
  expect(sc.zCm).toBeCloseTo(f[0].zCm, 1)
})

test('14.5: при переносе из каталога недопустимое место даёт красное превью с причиной; отпускание ничего не добавляет (AC-08)', async ({ page }) => {
  await openInterior(page)
  const planBox = (await page.getByTestId('interior-plan').boundingBox())!
  // Левый верхний угол плана: за стеной комнаты.
  const up = await dragCard(page, 'sofa_02', { x: planBox.x + 6, y: planBox.y + 6 })
  await expect(page.getByTestId('reason')).toBeVisible()
  await up()
  expect(Object.keys(await furniture(page))).toHaveLength(0)
  await expect(page.getByTestId('message')).toBeVisible()
})

test('14.6: Esc отменяет перенос из каталога, камера снова управляется, проект не меняется', async ({ page }) => {
  await openInterior(page)
  const up = await dragCard(page, 'sofa_02', await center(page, 'interior-plan'))
  await page.keyboard.press('Escape')
  await up()
  expect(Object.keys(await furniture(page))).toHaveLength(0)
  // Камера: вращение мышью после отмены меняет положение камеры.
  const before = await page.evaluate(() => (window as any).__interior.probe.camera.position.toArray())
  const c = await center(page, 'interior-scene')
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 80, c.y + 20, { steps: 6 })
  await page.mouse.up()
  const after = await page.evaluate(() => (window as any).__interior.probe.camera.position.toArray())
  expect(after).not.toEqual(before)
})

test('14.6: отпускание карточки вне плана и 3D отменяет перенос', async ({ page }) => {
  await openInterior(page)
  await page.getByTestId('card-sofa_02').scrollIntoViewIfNeeded()
  const c = await center(page, 'card-sofa_02')
  await page.mouse.move(c.x - 30, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x - 30, c.y + 40, { steps: 4 })
  await page.mouse.up()
  expect(Object.keys(await furniture(page))).toHaveLength(0)
  await expect(page.locator('[data-testid="draft"]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__interior.editor.getState().draft)).toBeNull()
})

test('14.4: ручка на плане поворачивает с привязкой 15°, одним шагом истории; R и стрелки работают, в поле ввода не срабатывают', async ({ page }) => {
  await openInterior(page)
  await page.getByTestId('add-sofa_02').click()
  const id = Object.keys(await furniture(page))[0]
  // Центр комнаты: рядом со стеной поворот был бы недопустим.
  const planBox = await center(page, 'interior-plan')
  const item = (await page.getByTestId(`plan-item-${id}`).boundingBox())!
  await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2)
  await page.mouse.down()
  await page.mouse.move(planBox.x, planBox.y, { steps: 8 })
  await page.mouse.up()
  const at = (await furniture(page))[id]
  const h = (await page.getByTestId('rotate-handle').boundingBox())!
  const hx = h.x + h.width / 2, hy = h.y + h.height / 2
  const cx = (await page.getByTestId(`plan-item-${id}`).boundingBox())!
  const ox = cx.x + cx.width / 2, oy = cx.y + cx.height / 2
  // Ручку ведём вправо от центра предмета: направление «назад» предмета смотрит на +x → угол −90° (270°).
  const r = Math.hypot(hx - ox, hy - oy)
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(ox + r, oy + 3, { steps: 8 })
  await page.mouse.up()
  const rotated = (await furniture(page))[id]
  expect(rotated.angleDeg % 15).toBe(0)
  expect(rotated.angleDeg).not.toBe(0)
  expect(rotated.xCm).toBe(at.xCm)
  expect(rotated.zCm).toBe(at.zCm)
  // Стрелки: 1 см и 10 см.
  const x0 = rotated.xCm
  await page.keyboard.press('ArrowRight')
  expect((await furniture(page))[id].xCm).toBe(x0 + 1)
  await page.keyboard.press('Shift+ArrowRight')
  expect((await furniture(page))[id].xCm).toBe(x0 + 11)
  // Фокус в поле поиска: клавиши предмета не срабатывают.
  await page.getByTestId('catalog-search').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('rr')
  expect((await furniture(page))[id].xCm).toBe(x0 + 11)
  expect((await furniture(page))[id].angleDeg).toBe(rotated.angleDeg)
  await expect(page.getByTestId('catalog-search')).toHaveValue('rr')
})

test('R как в The Sims: у стены предмет поворачивается на 90° и сам отходит на свободное место; Shift+R — обратно, одна отмена', async ({ page }) => {
  await openInterior(page)
  await page.getByTestId('add-sofa_02').click() // «+» ставит диван у стены: поворот на месте упёрся бы в стену
  const id = Object.keys(await furniture(page))[0]
  const before = (await furniture(page))[id]
  await page.getByTestId('active-room').click()
  await page.keyboard.press('r')
  const turned = (await furniture(page))[id]
  expect(turned.angleDeg).toBe(90)
  expect(Math.hypot(turned.xCm - before.xCm, turned.zCm - before.zCm)).toBeGreaterThan(0)
  await expect(page.getByTestId('message')).toHaveCount(0)
  await expect.poll(async () => (await scenePos(page, id))?.xCm).toBeCloseTo(turned.xCm, 1)
  // Shift+R — четверть оборота обратно (клавиша распознаётся по коду KeyR, поэтому работает и в русской раскладке).
  await page.keyboard.press('Shift+KeyR')
  expect((await furniture(page))[id].angleDeg).toBe(0)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  const undone = (await furniture(page))[id]
  expect([undone.xCm, undone.zCm, undone.angleDeg]).toEqual([before.xCm, before.zCm, before.angleDeg])
})

test('3D на весь экран: кнопка разворачивает панель, «Свернуть» возвращает, в прогулке F переключает', async ({ page }) => {
  await openInterior(page)
  const btn = page.getByTestId('fullscreen-toggle')
  await btn.click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid') ?? null)).toBe('scene-panel')
  await expect(btn).toHaveText('Свернуть')
  // Холст занимает весь экран.
  const vp = page.viewportSize()!
  await expect.poll(async () => Math.round((await page.getByTestId('interior-scene').boundingBox())!.width)).toBeGreaterThan(vp.width * 0.9)
  await btn.click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
  // В прогулке — клавиша F.
  await page.getByTestId('walk-toggle').click()
  await expect(page.getByTestId('walk-hint')).toContainText('F — на весь экран')
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid') ?? null)).toBe('scene-panel')
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
})
