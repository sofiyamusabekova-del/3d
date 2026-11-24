import { expect, test, type Page } from '@playwright/test'

// Этап 4: AC-02, AC-06–AC-08 на технической сцене. Это не проверка всего редактора.
type Tech = {
  furniture: () => Record<string, { id: string; xCm: number; zCm: number; angleDeg: number; catalogItemId: string }>
  scenePosition: (id: string) => { xCm: number; zCm: number; angleDeg: number } | null
  measured: () => Record<string, { widthCm: number; depthCm: number; heightCm: number }>
  screenPosition: (id: string) => { x: number; y: number } | null
}
const tech = <T,>(page: Page, fn: (t: Tech) => T) => page.evaluate((src) => new Function('t', `return (${src})(t)`)((window as never as { __tech: Tech }).__tech), fn.toString()) as Promise<T>

/** Координаты на плане: SVG viewBox -> экран. */
async function planPoint(page: Page, xCm: number, zCm: number) {
  return page.getByTestId('plan').evaluate((svg: SVGSVGElement, [x, z]) => {
    const p = new DOMPoint(x, z).matrixTransform(svg.getScreenCTM()!)
    return { x: p.x, y: p.y }
  }, [xCm, zCm] as [number, number])
}

async function addItem(page: Page, id: string) {
  const before = Object.keys(await tech(page, (t) => t.furniture())).length
  await page.getByTestId(`add-${id}`).click()
  await expect.poll(async () => Object.keys(await tech(page, (t) => t.furniture())).length).toBe(before + 1)
  const all = await tech(page, (t) => t.furniture())
  return Object.values(all).find((f) => f.catalogItemId === id && !(f as { seen?: boolean }).seen)!
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?tech')
  await expect(page.getByTestId('plan')).toBeVisible()
})

test('4.3: измеренные размеры моделей совпадают с карточкой каталога (см)', async ({ page }) => {
  for (const id of ['sofa_02', 'modern_coffee_table_01', 'dining_chair_02', 'modern_wooden_cabinet']) await page.getByTestId(`add-${id}`).click()
  await expect.poll(async () => Object.keys(await tech(page, (t) => t.measured())).length, { timeout: 20000 }).toBe(4)
  const m = await tech(page, (t) => t.measured())
  const expected: Record<string, [number, number, number]> = {
    sofa_02: [181, 82, 71], modern_coffee_table_01: [60, 120, 39], dining_chair_02: [43, 58, 97], modern_wooden_cabinet: [244, 52, 68],
  }
  for (const [id, [w, d, h]] of Object.entries(expected)) {
    console.log(id, JSON.stringify(m[id], (_, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)))
    expect(Math.abs(m[id].widthCm - w), `${id} ширина`).toBeLessThan(1.5)
    expect(Math.abs(m[id].depthCm - d), `${id} глубина`).toBeLessThan(1.5)
    expect(Math.abs(m[id].heightCm - h), `${id} высота`).toBeLessThan(1.5)
  }
})

test('AC-06: перенос мышью на плане и в 3D даёт одинаковые координаты', async ({ page }) => {
  const f = await addItem(page, 'sofa_02')
  await expect.poll(async () => tech(page, (t) => t.screenPosition(Object.keys(t.furniture())[0]) !== null)).toBe(true)
  // Перенос на плане.
  const from = await planPoint(page, f.xCm, f.zCm)
  const to = await planPoint(page, f.xCm + 100, f.zCm + 60)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
  const afterPlan = (await tech(page, (t) => t.furniture()))[f.id]
  expect(afterPlan.xCm).toBeCloseTo(f.xCm + 100, -1)
  expect(afterPlan.zCm).toBeCloseTo(f.zCm + 60, -1)
  const s1 = await tech(page, (t) => t.scenePosition(Object.keys(t.furniture())[0]))
  expect(s1!.xCm).toBeCloseTo(afterPlan.xCm, 1)
  expect(s1!.zCm).toBeCloseTo(afterPlan.zCm, 1)
  // Перенос в 3D: берём предмет за его центр на экране и сдвигаем.
  await expect.poll(async () => tech(page, (t) => t.measured().sofa_02 !== undefined)).toBe(true)
  const p3 = (await tech(page, (t) => t.screenPosition(Object.keys(t.furniture())[0])))!
  await page.mouse.move(p3.x, p3.y)
  await page.mouse.down()
  await page.mouse.move(p3.x - 60, p3.y - 20, { steps: 6 })
  await page.mouse.up()
  const after3d = (await tech(page, (t) => t.furniture()))[f.id]
  expect(after3d.xCm).not.toBeCloseTo(afterPlan.xCm, 0)
  const s2 = await tech(page, (t) => t.scenePosition(Object.keys(t.furniture())[0]))
  expect(s2!.xCm).toBeCloseTo(after3d.xCm, 1)
  expect(s2!.zCm).toBeCloseTo(after3d.zCm, 1)
  // План отражает то же значение.
  const label = await page.getByTestId('selection').textContent()
  expect(label).toContain(`x=${Math.round(after3d.xCm)}`)
})

test('6.2: масштаб колесом и сдвиг плана не меняют координаты переноса', async ({ page }) => {
  const f = await addItem(page, 'sofa_02')
  const plan = (await page.getByTestId('plan').boundingBox())!
  const scaleBefore = await page.getByTestId('plan-scale').textContent()
  await page.mouse.move(plan.x + plan.width / 2, plan.y + plan.height / 2)
  await page.mouse.wheel(0, -250)
  await expect.poll(() => page.getByTestId('plan-scale').textContent()).not.toBe(scaleBefore)
  // Сдвиг: тянем за пустое место (левый верхний угол плана, вне комнаты).
  await page.mouse.move(plan.x + 6, plan.y + 6)
  await page.mouse.down()
  await page.mouse.move(plan.x + 26, plan.y + 16, { steps: 4 })
  await page.mouse.up()
  const from = await planPoint(page, f.xCm, f.zCm)
  const to = await planPoint(page, f.xCm + 40, f.zCm + 25)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  const after = (await tech(page, (t) => t.furniture()))[f.id]
  expect(after.xCm).toBeCloseTo(f.xCm + 40, -1)
  expect(after.zCm).toBeCloseTo(f.zCm + 25, -1)
  // «Вписать» возвращает исходный масштаб.
  await page.getByTestId('plan-fit').click()
  await expect(page.getByTestId('plan-scale')).toHaveText(scaleBefore!)
})

test('6.1: на плане подписаны чистовые размеры комнаты в см', async ({ page }) => {
  await expect(page.getByTestId('plan-dim-w-room')).toHaveText('420 см')
  await expect(page.getByTestId('plan-dim-d-room')).toHaveText('350 см')
})

test('AC-07/08: выход за стену — красный предмет с причиной, положение не фиксируется, камера снова работает', async ({ page }) => {
  const f = await addItem(page, 'sofa_02')
  const from = await planPoint(page, f.xCm, f.zCm)
  const out = await planPoint(page, -40, f.zCm) // центр дивана за стеной
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(out.x, out.y, { steps: 8 })
  await expect(page.getByTestId('reason')).toHaveText('Предмет выходит за стену')
  await page.mouse.up()
  const after = (await tech(page, (t) => t.furniture()))[f.id]
  expect(after.xCm).toBe(f.xCm)
  expect(after.zCm).toBe(f.zCm)
  await expect(page.getByTestId('message')).toHaveText('Предмет выходит за стену')
  expect(await page.evaluate(() => (window as never as { __tech: { draft: () => unknown } }).__tech.draft())).toBeNull()
  // Новый предмет при недопустимом отпускании не добавляется (перенос из каталога не входит в 4.4; проверяем второй предмет).
})

test('AC-07: поворот клавишей R и запрет поворота, при котором угол уходит за стену', async ({ page }) => {
  const f = await addItem(page, 'sofa_02')
  // Переносим диван в центр комнаты, подальше от стен, и оставляем его выбранным.
  const start = await planPoint(page, f.xCm, f.zCm)
  const centre = await planPoint(page, 210, 175)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(centre.x, centre.y, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.press('r')
  expect((await tech(page, (t) => Object.values(t.furniture())[0].angleDeg))).toBe(15)
  await page.keyboard.press('Shift+R')
  expect((await tech(page, (t) => Object.values(t.furniture())[0].angleDeg))).toBe(0)
  // Диван 181×82 у левой стены (левый край в 0): поворот на 15° выводит угол за стену.
  const edge = await planPoint(page, 95, 175)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move(edge.x, edge.y, { steps: 8 })
  await page.mouse.up()
  const placed = (await tech(page, (t) => Object.values(t.furniture())[0]))
  expect(placed.xCm).toBe(95)
  await page.keyboard.press('r')
  const angle = await tech(page, (t) => Object.values(t.furniture())[0].angleDeg)
  expect(angle).toBe(0)
  await expect(page.getByTestId('message')).toHaveText('Предмет выходит за стену')
})

test('AC-06/08: перенос нового предмета из каталога на план; недопустимое отпускание ничего не добавляет', async ({ page }) => {
  const handle = page.getByTestId('drag-sofa_02')
  const h = (await handle.boundingBox())!
  // Допустимое отпускание: предмет добавляется ровно один раз в нужном месте (сетка 5 см).
  const target = await planPoint(page, 210, 175)
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await page.mouse.up()
  let all = Object.values(await tech(page, (t) => t.furniture()))
  expect(all).toHaveLength(1)
  expect([all[0].xCm, all[0].zCm]).toEqual([210, 175])
  // Недопустимое отпускание (центр за стеной): новый предмет не добавляется.
  const outside = await planPoint(page, -60, 175)
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(outside.x, outside.y, { steps: 8 })
  await expect(page.getByTestId('reason')).toHaveText('Предмет выходит за стену')
  await page.mouse.up()
  all = Object.values(await tech(page, (t) => t.furniture()))
  expect(all).toHaveLength(1)
  // Esc во время переноса отменяет кандидата.
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + 120, target.y, { steps: 4 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(Object.values(await tech(page, (t) => t.furniture()))).toHaveLength(1)
})

test('AC-07: пересечение предметов запрещено, отмена возвращает прежнее состояние', async ({ page }) => {
  const a = await addItem(page, 'sofa_02')
  const b = await addItem(page, 'modern_coffee_table_01')
  const from = await planPoint(page, b.xCm, b.zCm)
  const onSofa = await planPoint(page, a.xCm, a.zCm)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(onSofa.x, onSofa.y, { steps: 8 })
  await expect(page.getByTestId('reason')).toContainText('Предмет пересекается')
  await page.mouse.up()
  const after = (await tech(page, (t) => t.furniture()))[b.id]
  expect([after.xCm, after.zCm]).toEqual([b.xCm, b.zCm])
  await page.keyboard.press('Control+z')
  expect(Object.keys(await tech(page, (t) => t.furniture()))).toHaveLength(1)
})
