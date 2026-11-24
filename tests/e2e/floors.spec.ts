import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Этап 23 (SPEC D-16): покрытие пола комнаты: панель «Пол», цвет на плане, процедурные текстуры в 3D, история, «Качественный снимок».
// Кадры — docs/reports/stage23.
const OUT = 'docs/reports/stage23'
mkdirSync(OUT, { recursive: true })

async function openRoom(page: Page, items: string[] = []) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('43')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const ids = await page.evaluate(() => {
    const p = (window as any).__interior.project.getState().history.present
    return Object.fromEntries((Object.values(p.rooms) as any[]).map((r) => [r.name, r.id])) as Record<string, string>
  })
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), ids['Комната'])
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
  for (const id of items) { await page.getByTestId('catalog-scope-all').click(); await page.getByTestId(`add-${id}`).click() }
  if (items.length) await page.waitForFunction(() => { let l = 0; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-loading') l++ }); return l === 0 })
  await page.waitForTimeout(500)
  return ids
}

const floorMesh = (page: Page) => page.evaluate(() => {
  let out: any = null
  ;(window as any).__interior.probe.scene.traverse((o: any) => {
    if (o.name?.startsWith('floor-') && !out) {
      const m = o.material
      out = { floor: o.userData.floor, hasMap: !!m.map, repeat: m.map ? [m.map.repeat.x, m.map.repeat.y] : null, color: `#${m.color.getHexString()}`, roughness: m.roughness, wrap: m.map ? m.map.wrapS : null, size: m.map ? [m.map.image.width, m.map.image.height] : null }
    }
  })
  return out as { floor: string | null; hasMap: boolean; repeat: number[] | null; color: string; roughness: number; wrap: number | null; size: number[] | null }
})
const planFill = (page: Page, roomId: string) => page.getByTestId(`room-fill-${roomId}`).first().getAttribute('data-floor')
const mem = (page: Page) => page.evaluate(() => { const i = (window as any).__interior.probe.gl.info; return { geometries: i.memory.geometries, textures: i.memory.textures } })

const aimFloor = (page: Page) => page.evaluate(() => {
  const probe = (window as any).__interior.probe
  const st = probe.scene.__r3f.root.getState()
  let floor: any = null
  probe.scene.traverse((o: any) => { if (o.name.startsWith('floor-') && !floor) floor = o })
  floor.geometry.computeBoundingBox()
  const b = floor.geometry.boundingBox
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2
  st.controls.target.set(cx, 0, cz)
  st.camera.position.set(cx + 0.01, 3.3, cz + 1.7)
  st.controls.update()
})

const COLORS: Array<[string, string, string]> = [
  ['laminate', 'oak_light', '#d3b185'], ['laminate', 'oak_natural', '#a9814f'], ['laminate', 'walnut_dark', '#5f4430'],
  ['linoleum', 'lino_gray', '#b4b6b8'], ['linoleum', 'lino_beige', '#cdbf9e'], ['linoleum', 'lino_graphite', '#575a60'],
  ['carpet', 'carpet_gray', '#8c8f95'], ['carpet', 'carpet_beige', '#bfb19a'], ['carpet', 'carpet_blue', '#3e5878'],
]

test('23.3: панель «Пол» назначает покрытие; цвет виден на плане, текстура с физическим масштабом в 3D; отмена и повтор', async ({ page }) => {
  const ids = await openRoom(page)
  const living = ids['Комната']
  await expect(page.getByTestId('floor-current')).toContainText('без покрытия')
  expect((await floorMesh(page)).hasMap).toBe(false)
  expect(await planFill(page, living)).toBeNull()

  await page.getByTestId('floor-laminate-oak_light').click()
  await expect(page.getByTestId('floor-current')).toContainText('Ламинат, Дуб светлый')
  expect(await planFill(page, living)).toBe('#d3b185')
  await page.waitForTimeout(400)
  let m = await floorMesh(page)
  expect(m.floor).toBe('laminate:oak_light')
  expect(m.hasMap).toBe(true)
  expect(m.color).toBe('#ffffff')
  // Образец ламината 120 × 76 см: повторов на метр 100/120 и 100/76; холст 8 пикселей на см.
  expect(m.repeat![0]).toBeCloseTo(100 / 120, 4)
  expect(m.repeat![1]).toBeCloseTo(100 / 76, 4)
  expect(m.size).toEqual([960, 608])
  expect(m.wrap).toBe(1000) // THREE.RepeatWrapping

  await page.getByTestId('floor-carpet-carpet_blue').click()
  m = await floorMesh(page)
  expect(m.floor).toBe('carpet:carpet_blue')
  expect(m.repeat![0]).toBeCloseTo(2, 4) // образец 50 × 50 см
  expect(m.roughness).toBe(1)
  expect(await planFill(page, living)).toBe('#3e5878')

  await page.getByTestId('floor-linoleum-lino_beige').click()
  m = await floorMesh(page)
  expect(m.repeat![0]).toBeCloseTo(1, 4) // образец 100 × 100 см
  expect(await planFill(page, living)).toBe('#cdbf9e')

  // История: одна отмена возвращает прежнее покрытие, повтор — следующее.
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('floor-current')).toContainText('Ковролин, Синий')
  expect((await floorMesh(page)).floor).toBe('carpet:carpet_blue')
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('floor-current')).toContainText('Ламинат, Дуб светлый')
  await page.getByTestId('redo').click()
  await expect(page.getByTestId('floor-current')).toContainText('Ковролин, Синий')
  await page.getByTestId('floor-clear').click()
  await expect(page.getByTestId('floor-current')).toContainText('без покрытия')
  expect(await planFill(page, living)).toBeNull()
  expect((await floorMesh(page)).hasMap).toBe(false)
  await expect(page.getByTestId('floor-clear')).toBeDisabled()
})

test('23.3: у каждой комнаты своё покрытие, переходы между комнатами его не теряют; покрытие сохраняется при возврате к настройке', async ({ page }) => {
  const ids = await openRoom(page)
  await page.getByTestId('floor-laminate-walnut_dark').click()
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), ids['Кухня'])
  await expect(page.getByTestId('active-room')).toHaveText('Кухня')
  await expect(page.getByTestId('floor-current')).toContainText('без покрытия')
  await page.getByTestId('floor-linoleum-lino_gray').click()
  expect(await planFill(page, ids['Кухня'])).toBe('#b4b6b8')
  expect(await planFill(page, ids['Комната'])).toBe('#5f4430') // у соседней комнаты на плане свой цвет
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), ids['Комната'])
  await expect(page.getByTestId('floor-current')).toContainText('Ламинат, Орех тёмный')
  await page.getByTestId('back-to-setup').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const cov = await page.evaluate(() => (window as any).__interior.project.getState().history.present.floorCoverings)
  expect(Object.keys(cov)).toHaveLength(2)
})

test('23.2: девять сочетаний вида и цвета показаны кадрами; память видеокарты не растёт при повторной смене', async ({ page }) => {
  test.setTimeout(150_000)
  await openRoom(page, ['sofa_02', 'modern_coffee_table_01'])
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await aimFloor(page)
  for (const [kind, id] of COLORS) {
    await page.getByTestId(`floor-${kind}-${id}`).click()
    await page.waitForTimeout(450)
    await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/floor-${id}-${test.info().project.name}.png` })
  }
  const warm = await mem(page)
  for (let round = 0; round < 3; round++) {
    for (const [kind, id] of COLORS) await page.getByTestId(`floor-${kind}-${id}`).click()
  }
  await page.waitForTimeout(500)
  const after = await mem(page)
  expect(after.textures).toBe(warm.textures)
  expect(after.geometries).toBe(warm.geometries)
  // Скорость с текстурой пола (пороги D-08: не меньше 60 к/с, p95 не больше 20 мс).
  await page.getByTestId('floor-laminate-oak_natural').click()
  await page.waitForTimeout(500)
  const dts = await page.evaluate((ms) => new Promise<number[]>((resolve) => {
    const out: number[] = []
    let last = performance.now()
    const end = last + ms
    const tick = (now: number) => { out.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(out) }
    requestAnimationFrame(tick)
  }), 4000)
  const s = dts.slice(5).sort((a, b) => a - b)
  const fps = 1000 / (s.reduce((a, b) => a + b, 0) / s.length)
  const p95 = s[Math.floor(s.length * 0.95)]
  console.log(`пол с ламинатом: ${fps.toFixed(1)} к/с, p95 ${p95.toFixed(1)} мс`)
  expect(fps).toBeGreaterThan(60)
  expect(p95).toBeLessThan(20)
})

test('23.4: «Качественный снимок» учитывает покрытие пола: светлый дуб ярче графитового линолеума', async ({ page }) => {
  test.setTimeout(420_000)
  await openRoom(page, ['sofa_02'])
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await aimFloor(page)
  const shot = async (kind: string, id: string, file: string) => {
    await page.getByTestId(`floor-${kind}-${id}`).click()
    await page.waitForTimeout(500)
    await page.getByTestId('quality-open').click()
    await page.getByTestId('quality-samples').selectOption('16')
    await page.getByTestId('quality-start').click()
    await expect(page.getByTestId('quality-done')).toBeVisible({ timeout: 250_000 })
    await page.getByTestId('quality-image').screenshot({ path: `${OUT}/path-traced-${file}-${test.info().project.name}.png` })
    const mean = await page.evaluate(() => {
      const c = document.querySelector('[data-testid=quality-image] canvas') as HTMLCanvasElement
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let s = 0, n = 0
      for (let i = 0; i < d.length; i += 16) { s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++ }
      return s / n
    })
    await page.getByTestId('quality-close').click()
    return mean
  }
  const projectBefore = JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present.furniture))
  const dark = await shot('linoleum', 'lino_graphite', 'lino-graphite')
  const light = await shot('laminate', 'oak_light', 'laminate-oak-light')
  console.log(`quality-shot пол: графит ${dark.toFixed(1)}, светлый дуб ${light.toFixed(1)}`)
  expect(light).toBeGreaterThan(dark * 1.15)
  expect(JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present.furniture))).toBe(projectBefore)
})
