import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Этап 20: время суток, вид за окнами, свет и тени по часам, «Качественный снимок» с небом (SPEC D-12). Кадры — docs/reports/stage20.
const OUT = 'docs/reports/stage20'
mkdirSync(OUT, { recursive: true })

async function openRoom(page: Page, items: string[] = ['sofa_02', 'modern_coffee_table_01', 'Shelf_01']) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const roomId = await page.evaluate(() => {
    const p = (window as any).__interior.project.getState().history.present
    return (Object.values(p.rooms) as any[]).find((r) => r.name === 'Комната').id as string
  })
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), roomId)
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
  for (const id of items) await page.getByTestId(`add-${id}`).click()
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } }) // снять выбор
  await page.waitForFunction((n) => {
    let loading = 0, count = 0
    ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-loading') loading++; if (o.name?.startsWith('furniture-')) count++ })
    return count === n && loading === 0
  }, items.length)
  await page.waitForTimeout(600)
}

const setHour = async (page: Page, hour: number) => {
  await page.getByTestId('time-slider').fill(String(hour))
  await page.waitForTimeout(500) // кадр с новым светом
}

const sun = (page: Page) => page.evaluate(() => {
  const l = (window as any).__interior.probe.scene.getObjectByName('sun')
  return { x: l.position.x, y: l.position.y, z: l.position.z, intensity: l.intensity, color: `#${l.color.getHexString()}`, shadow: l.castShadow }
})

/** Камера: центр комнаты на уровне глаз (чтобы все стены были видны), затем взгляд на окно или обзор пола. */
async function aim(page: Page, mode: 'window' | 'floor') {
  return page.evaluate((m) => {
    const probe = (window as any).__interior.probe
    const st = probe.scene.__r3f.root.getState()
    let floor: any = null
    probe.scene.traverse((o: any) => { if (o.name.startsWith('floor-') && !floor) floor = o })
    floor.geometry.computeBoundingBox()
    const b = floor.geometry.boundingBox
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2
    if (m === 'floor') {
      st.controls.target.set(cx, 0, cz)
      st.camera.position.set(cx + 0.01, 6.5, cz + 3.2)
      st.controls.update()
      return true
    }
    st.controls.target.set(cx + 0.5, 1, cz)
    st.camera.position.set(cx, 1.4, cz)
    st.controls.update()
    return new Promise<boolean>((resolve) => setTimeout(() => {
      let win: any = null
      probe.scene.traverse((o: any) => { if (o.name === 'window-stencil' && !win) win = o })
      if (!win) { resolve(false); return }
      win.geometry.computeBoundingBox()
      const w = win.geometry.boundingBox
      const wx = (w.min.x + w.max.x) / 2, wz = (w.min.z + w.max.z) / 2
      const dx = cx - wx, dz = cz - wz, l = Math.hypot(dx, dz) || 1
      st.controls.target.set(wx, 1.2, wz)
      st.camera.position.set(wx + (dx / l) * 3, 1.3, wz + (dz / l) * 3)
      st.controls.update()
      resolve(true)
    }, 700))
  }, mode)
}

/** Средняя яркость кадра 3D (0–255) по снимку холста. */
const brightness = (page: Page) => page.evaluate(() => {
  const c = document.querySelector('[data-testid=interior-scene] canvas') as HTMLCanvasElement
  const t = document.createElement('canvas')
  t.width = 160; t.height = 90
  const g = t.getContext('2d')!
  g.drawImage(c, 0, 0, t.width, t.height)
  const d = g.getImageData(0, 0, t.width, t.height).data
  let s = 0
  for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3
  return s / (d.length / 4)
})

test('20.2: ползунок и кнопки меняют время суток, свет сцены и не попадают в историю отмены', async ({ page }) => {
  await openRoom(page)
  const history = () => page.evaluate(() => { const h = (window as any).__interior.project.getState().history; return { past: h.past.length, future: h.future.length, project: JSON.stringify(h.present) } })
  const before = await history()
  await expect(page.getByTestId('time-label')).toHaveText('15:00')
  for (const [label, text] of [['Утро', '08:00'], ['День', '13:00'], ['Вечер', '18:30'], ['Ночь', '23:00']] as const) {
    await page.getByTestId(`time-${label}`).click()
    await expect(page.getByTestId('time-label')).toHaveText(text)
    expect(await page.evaluate(() => (window as any).__interior.store.getState().hour)).toBeCloseTo(Number(text.slice(0, 2)) + Number(text.slice(3)) / 60, 3)
  }
  // Свет: днём сильное тёплое солнце, ночью слабый холодный свет луны (синий канал выше красного).
  await setHour(page, 13)
  const day = await sun(page)
  await setHour(page, 23)
  const night = await sun(page)
  expect(day.intensity).toBeGreaterThan(3)
  expect(night.intensity).toBeGreaterThan(0.05)
  expect(night.intensity).toBeLessThan(day.intensity / 3)
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  expect(rgb(night.color)[2]).toBeGreaterThan(rgb(night.color)[0])
  expect(rgb(day.color)[0]).toBeGreaterThanOrEqual(rgb(day.color)[2])
  // Ползунок возвращает значение; история и проект не менялись ни разу.
  await setHour(page, 6.25)
  await expect(page.getByTestId('time-label')).toHaveText('06:15')
  expect(await history()).toEqual(before)
  // Отмена не трогает время суток.
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('time-label')).toHaveText('06:15')
})

test('20.3 / 20.4: вид из окна и свет по четырём моментам суток; тень и пятно света идут за солнцем', async ({ page }) => {
  test.setTimeout(120_000)
  await openRoom(page)
  expect(await aim(page, 'window')).toBe(true)
  const names = await page.evaluate(() => {
    const out: string[] = []
    ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.name?.startsWith('world-') || o.name === 'window-stencil' || o.name === 'ceiling-shadow') out.push(o.name) })
    return [...new Set(out)]
  })
  for (const n of ['world-sky', 'world-ground', 'world-windows', 'window-stencil', 'ceiling-shadow']) expect(names, n).toContain(n)
  const lum: Record<string, number> = {}
  for (const [label, file, hour] of [['Утро', 'morning', 8], ['День', 'day', 13], ['Вечер', 'evening', 18.5], ['Ночь', 'night', 23]] as const) {
    await page.getByTestId(`time-${label}`).click()
    await page.waitForTimeout(900)
    lum[file] = await brightness(page)
    await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/window-${file}-${test.info().project.name}.png` })
    expect(hour).toBeGreaterThan(0)
  }
  expect(lum.night).toBeLessThan(lum.day * 0.6)
  expect(lum.evening).toBeLessThan(lum.day)
  // Свет одной камеры в разные часы: пятно от окна меняет место.
  await aim(page, 'floor')
  const dirs: Record<number, number[]> = {}
  for (const h of [8, 10, 12, 15, 17.5]) {
    await setHour(page, h)
    const s = await sun(page)
    dirs[h] = [s.x, s.y, s.z]
    await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/floor-${String(h).replace('.', '_')}-${test.info().project.name}.png` })
  }
  expect(dirs[8][0]).toBeGreaterThan(0) // утром солнце на востоке (+X)
  expect(dirs[17.5][0]).toBeLessThan(0) // вечером на западе
  expect(dirs[12][1]).toBeGreaterThan(dirs[8][1]) // в полдень выше, чем утром
  expect(dirs[12][1]).toBeGreaterThan(dirs[17.5][1])
})

test('20.6: смена часа не накапливает память видеокарты и не ломает сцену', async ({ page }) => {
  test.setTimeout(120_000)
  await openRoom(page)
  const mem = () => page.evaluate(() => { const i = (window as any).__interior.probe.gl.info; return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs.length } })
  // Прогрев: пройти по суткам, чтобы все варианты шейдеров собрались.
  for (const h of [0, 6, 12, 18, 23]) await setHour(page, h)
  const before = await mem()
  for (let i = 0; i < 60; i++) {
    await page.getByTestId('time-slider').fill(String((i * 7.25) % 24))
    if (i % 10 === 0) await page.waitForTimeout(150)
  }
  await page.waitForTimeout(600)
  const after = await mem()
  expect(after.geometries).toBe(before.geometries)
  expect(after.textures).toBe(before.textures)
  expect(after.programs).toBeLessThanOrEqual(before.programs + 1)
  // Сцена жива: свет есть, 3D не показывает ошибку, предметы на месте.
  expect((await sun(page)).shadow).toBe(true)
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  expect(await page.evaluate(() => Object.keys((window as any).__interior.project.getState().history.present.furniture).length)).toBe(3)
})

test('20.5: «Качественный снимок» использует небо и свет часа: ночью темнее, чем днём; геометрия проекта та же', async ({ page }) => {
  test.setTimeout(360_000)
  await openRoom(page)
  await aim(page, 'window')
  const shot = async (label: string, file: string) => {
    await page.getByTestId(`time-${label}`).click()
    await page.waitForTimeout(700)
    await page.getByTestId('quality-open').click()
    await page.getByTestId('quality-samples').selectOption('16')
    await page.getByTestId('quality-start').click()
    await expect(page.getByTestId('quality-done')).toBeVisible({ timeout: 250_000 })
    await page.getByTestId('quality-image').screenshot({ path: `${OUT}/path-traced-${file}-${test.info().project.name}.png` })
    const s = await page.evaluate(() => {
      const c = document.querySelector('[data-testid=quality-image] canvas') as HTMLCanvasElement
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let sum = 0, n = 0
      for (let i = 0; i < d.length; i += 16) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++ }
      return sum / n
    })
    await page.getByTestId('quality-close').click()
    return s
  }
  const projectBefore = JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))
  const day = await shot('День', 'day')
  const night = await shot('Ночь', 'night')
  console.log(`quality-shot день ${day.toFixed(1)}, ночь ${night.toFixed(1)}`)
  expect(night).toBeLessThan(day * 0.75)
  expect(JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))).toBe(projectBefore)
})
