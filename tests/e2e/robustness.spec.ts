import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 18: устойчивость (18.1, 18.2) и совместимость (18.5). Кадры — в docs/reports/stage18.
const OUT = 'docs/reports/stage18'
mkdirSync(OUT, { recursive: true })
const room = (name: string) => Object.values(buildApartment(templateById('1b')!).rooms).find((r) => r.name === name)!

async function openInterior(page: Page) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('active-room')).toBeVisible()
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), room('Комната').id)
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
}

const project = (page: Page) => page.evaluate(() => JSON.stringify((window as any).__interior.project.getState().history.present))
const furniture = (page: Page) => page.evaluate(() => (window as any).__interior.project.getState().history.present.furniture as Record<string, any>)
const center = async (page: Page, testId: string) => {
  const b = (await page.getByTestId(testId).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
/** Переносит предмет в центр плана: у стены поворот законно отклоняется (угол уходит за стену). */
async function toPlanCentre(page: Page, id: string) {
  const from = await center(page, `plan-item-${id}`)
  const to = await center(page, 'interior-plan')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

test('18.1 (AC-13): текстура обоев не загрузилась — сторона в цвете образца, 3D и редактор работают', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/textures/wallpaper/**', (r) => r.fulfill({ status: 404, body: 'нет' }))
  await openInterior(page)
  await page.getByTestId('side-0').click()
  await page.locator('[data-testid^="wallpaper-"]').first().click()
  await expect(page.getByTestId('finish-notice')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    let n = 0
    ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.material?.name === 'wallpaper-error') n++ })
    return n
  }), { timeout: 15_000 }).toBeGreaterThan(0)
  await expect(page.getByTestId('webgl-unavailable')).toHaveCount(0)
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  // Редактор жив: предмет добавляется и виден в 3D.
  await page.getByTestId('add-sofa_02').click()
  await expect(page.getByTestId('room-furniture')).toHaveText('1')
  // Загрузчик drei оставляет отказ промиса без обработчика (его ловит граница ошибок, страница работает);
  // любая другая ошибка страницы — провал.
  expect(errors.filter((m) => !/^Could not load \/textures\/wallpaper\//.test(m))).toEqual([])
})

test('18.1: поиск без совпадений показывает пустой список с подсказкой; длинный запрос не ломает панель', async ({ page }) => {
  await openInterior(page)
  await page.getByTestId('catalog-search').fill('ничего такого нет')
  await expect(page.getByTestId('catalog-empty')).toContainText('Ничего не найдено')
  await page.getByTestId('catalog-search').fill('ы'.repeat(500))
  await expect(page.getByTestId('catalog-empty')).toBeVisible()
  // Панель не шире своей колонки: длинная строка не распирает вёрстку.
  const panel = (await page.getByTestId('catalog-search').evaluate((el) => el.closest('aside')!.getBoundingClientRect().width))
  expect(panel).toBeLessThanOrEqual(301)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('18.2 (AC-16): горячие клавиши не срабатывают в полях поиска и выбора категории', async ({ page }) => {
  await openInterior(page)
  await page.getByTestId('add-sofa_02').click()
  const id = Object.keys(await furniture(page))[0]
  await toPlanCentre(page, id)
  await page.getByTestId(`plan-item-${id}`).click()
  await expect(page.getByTestId('selection')).toContainText('угол=0°')
  const before = await project(page)
  const search = page.getByTestId('catalog-search')
  await search.click()
  await page.keyboard.type('rR')
  for (const k of ['ArrowLeft', 'ArrowRight', 'Shift+ArrowUp', 'Delete', 'Backspace', 'Control+z', 'Control+y', 'Escape']) await page.keyboard.press(k)
  expect(await project(page)).toBe(before)
  await expect(page.getByTestId('selection')).toContainText('угол=0°')
  await page.getByTestId('catalog-category').focus()
  await page.keyboard.press('Delete')
  await page.keyboard.press('r')
  expect(await project(page)).toBe(before)
  // Вне поля те же клавиши работают.
  await page.getByTestId('active-room').click()
  await page.keyboard.press('r')
  await expect(page.getByTestId('selection')).toContainText('угол=90°')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('selection')).toContainText('угол=0°')
})

test('18.2: перенос предмета на плане — Esc и потеря фокуса окна возвращают предмет, история не меняется', async ({ page }) => {
  await openInterior(page)
  await page.getByTestId('add-sofa_02').click()
  const id = Object.keys(await furniture(page))[0]
  const saved = await project(page)
  const history = () => page.evaluate(() => (window as any).__interior.project.getState().history.past.length as number)
  const steps = await history()
  for (const finish of ['Escape', 'blur'] as const) {
    const c = await center(page, `plan-item-${id}`)
    await page.mouse.move(c.x, c.y)
    await page.mouse.down()
    await page.mouse.move(c.x + 60, c.y + 40, { steps: 6 })
    expect(await page.evaluate(() => !!(window as any).__interior.editor.getState().draft)).toBe(true)
    if (finish === 'Escape') await page.keyboard.press('Escape')
    else await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    expect(await page.evaluate(() => (window as any).__interior.editor.getState().draft)).toBeNull()
    await page.mouse.move(c.x + 120, c.y + 60, { steps: 4 })
    await page.mouse.up()
    expect(await project(page), finish).toBe(saved)
    expect(await history()).toBe(steps)
  }
  // Камера после отмены снова вращается (конфликт камеры с переносом снят).
  const cam = () => page.evaluate(() => (window as any).__interior.probe.camera.position.toArray() as number[])
  const before = await cam()
  const s = await center(page, 'interior-scene')
  await page.mouse.move(s.x, s.y)
  await page.mouse.down()
  await page.mouse.move(s.x + 90, s.y + 10, { steps: 6 })
  await page.mouse.up()
  expect(await cam()).not.toEqual(before)
})

test('18.2: перенос предмета в 3D не вращает камеру; Esc возвращает предмет', async ({ page }) => {
  await openInterior(page)
  await page.getByTestId('add-sofa_02').click()
  const id = Object.keys(await furniture(page))[0]
  await page.waitForFunction(() => {
    let loading = 0
    ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-loading') loading++ })
    return loading === 0
  })
  await page.waitForTimeout(400)
  const saved = await project(page)
  // Экранная точка предмета в 3D.
  const p = await page.evaluate((fid) => {
    const probe = (window as any).__interior.probe
    let obj: any = null
    probe.scene.traverse((o: any) => { if (o.name === `furniture-${fid}`) obj = o })
    const v = obj.position.clone(); v.y += 0.3
    v.project(probe.camera)
    const r = probe.gl.domElement.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }, id)
  const cam = () => page.evaluate(() => (window as any).__interior.probe.camera.position.toArray() as number[])
  const camBefore = await cam()
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.move(p.x + 50, p.y + 20, { steps: 6 })
  const dragging = await page.evaluate(() => !!(window as any).__interior.editor.getState().draft)
  expect(await cam()).toEqual(camBefore)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await project(page)).toBe(saved)
  test.info().annotations.push({ type: 'перенос в 3D начат', description: String(dragging) })
  expect(dragging).toBe(true)
})

test('18.5 (AC-14): без WebGL2 — понятное сообщение вместо 3D, план и мебель работают', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: any[]) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null
      return (orig as any).call(this, type, ...rest)
    } as any
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openInterior(page)
  await expect(page.getByTestId('webgl-unavailable')).toContainText('3D-вид недоступен')
  await expect(page.getByTestId('webgl-unavailable')).toContainText('WebGL2')
  await expect(page.getByTestId('interior-plan')).toBeVisible()
  await page.getByTestId('add-sofa_02').click()
  await expect(page.getByTestId('room-furniture')).toHaveText('1')
  const id = Object.keys(await furniture(page))[0]
  await toPlanCentre(page, id)
  await page.getByTestId(`plan-item-${id}`).click()
  await page.keyboard.press('r')
  await expect(page.getByTestId('selection')).toContainText('угол=90°')
  await page.getByTestId('side-0').click()
  await page.locator('[data-testid^="paint-"]').first().click()
  await expect(page.getByTestId('finish-notice')).toBeVisible()
  await page.getByTestId('interior-plan').screenshot({ path: `${OUT}/no-webgl-plan-${test.info().project.name}.png` })
  await page.screenshot({ path: `${OUT}/no-webgl-${test.info().project.name}.png` })
  expect(errors).toEqual([])
})

// Размеры окна: основное 1920×1080 (D-08) и типичные меньшие ноутбучные.
for (const vp of [{ width: 1920, height: 1080 }, { width: 1536, height: 864 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
  test(`18.5: окно ${vp.width}×${vp.height} — шаги без горизонтальной прокрутки, план и 3D видны`, async ({ page }) => {
    await page.setViewportSize(vp)
    const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    await page.goto('/')
    expect(await noHScroll()).toBe(true)
    await page.getByTestId('room-count-1').check()
    await page.getByTestId('area-input').fill('36')
    await page.getByTestId('submit-params').click()
    expect(await noHScroll()).toBe(true)
    await page.getByTestId('choose-1b').click()
    await expect(page.getByTestId('setup-plan')).toBeVisible()
    expect(await noHScroll()).toBe(true)
    await page.getByTestId('to-interior').click()
    await expect(page.getByTestId('interior-scene')).toBeVisible()
    expect(await noHScroll()).toBe(true)
    for (const t of ['interior-plan', 'interior-scene']) {
      const b = (await page.getByTestId(t).boundingBox())!
      expect(b.width, t).toBeGreaterThan(250)
      expect(b.height, t).toBeGreaterThan(250)
      expect(b.x + b.width, t).toBeLessThanOrEqual(vp.width + 1)
    }
    const add = page.locator('[data-testid^="add-"]').first()
    await add.scrollIntoViewIfNeeded()
    await expect(add).toBeVisible()
    await page.screenshot({ path: `${OUT}/viewport-${vp.width}x${vp.height}-${test.info().project.name}.png` })
  })
}
