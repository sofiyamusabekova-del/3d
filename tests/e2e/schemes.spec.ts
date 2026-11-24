import { expect, test, type Page } from '@playwright/test'

// Этап 22 (SPEC D-15): схемы увеличены (стороны ×1,1, площадь около +21 %); подбор и подсказки идут по новым площадям.
async function choose(page: Page, rooms: 1 | 2 | 3, area: string) {
  await page.goto('/')
  await page.getByTestId(`room-count-${rooms}`).check()
  await page.getByTestId('area-input').fill(area)
}

test('22.2: под полем ввода — диапазон площадей готовых схем выбранной комнатности', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await expect(page.getByTestId('scheme-range')).toContainText('от 36 до 49 м²')
  await page.getByTestId('room-count-2').check()
  await expect(page.getByTestId('scheme-range')).toContainText('от 53 до 68 м²')
  await page.getByTestId('room-count-3').check()
  await expect(page.getByTestId('scheme-range')).toContainText('от 80 до 89 м²')
})

for (const [rooms, area, closest, areaText] of [[1, '36', '1a', '36,1'], [2, '52', '2a', '52,6'], [3, '72', '3a', '80,1']] as const) {
  test(`22.2: для ${area} м² и ${rooms} жил. комн. ближе всего схема ${closest} (${areaText} м²), площади в карточках по новым размерам`, async ({ page }) => {
    await choose(page, rooms, area)
    await page.getByTestId('submit-params').click()
    await expect(page.getByTestId(`closest-${closest}`)).toBeVisible()
    await expect(page.getByTestId(`area-${closest}`)).toContainText(areaText)
    // Ровно одна схема помечена «ближе всего», карточек три.
    await expect(page.locator('[data-testid^="closest-"]')).toHaveCount(1)
    await expect(page.locator('[data-testid^="scheme-"]:not([data-testid^="scheme-range"])')).toHaveCount(3)
  })
}

test('22.1 / 22.3: выбранная схема 1Б открывается в увеличенных размерах (Комната 418 × 616 см), сцена строится', async ({ page }) => {
  await choose(page, 1, '43')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const size = await page.evaluate(() => {
    const a = (window as any).__interior.project.getState().history.present
    const room: any = (Object.values(a.rooms) as any[]).find((r) => r.name === 'Комната')
    const pts: Array<{ x: number; z: number }> = []
    for (const b of room.boundary) {
      const w = a.walls[b.wallId]
      pts.push({ x: a.vertices[w.startVertexId].xCm, z: a.vertices[w.startVertexId].zCm }, { x: a.vertices[w.endVertexId].xCm, z: a.vertices[w.endVertexId].zCm })
    }
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z)
    // Оси стен: чистый размер = расстояние между осями минус половины толщин (30 см снаружи, 10 см внутри).
    return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), ceiling: a.ceilingHeightCm }
  })
  expect(size.ceiling).toBe(270)
  expect(Math.round(size.w)).toBe(418 + 15 + 5) // 418 чистыми + половины внешней (15) и внутренней (5) стен
  expect(Math.round(size.d)).toBe(616 + 15 + 15)
})
