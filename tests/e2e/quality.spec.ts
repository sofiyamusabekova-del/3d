import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этапы 16–17: единое освещение и «Качественный снимок» (SPEC §13, D-09, AC-15). Кадры — в docs/reports/stage16.
const OUT = 'docs/reports/stage16'
mkdirSync(OUT, { recursive: true })
const room = (name: string) => Object.values(buildApartment(templateById('1b')!).rooms).find((r) => r.name === name)!

async function openFurnished(page: Page) {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  await page.evaluate((id) => (window as any).__interior.store.getState().enter(id), room('Комната').id)
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
  for (const id of ['sofa_02', 'modern_coffee_table_01', 'ArmChair_01', 'Shelf_01']) await page.getByTestId(`add-${id}`).click()
  await page.getByTestId('side-0').click()
  await page.locator('[data-testid^="wallpaper-"]').first().click()
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } }) // снять выбор
  // Все модели загружены: в сцене нет объёмов-заглушек.
  await page.waitForFunction(() => {
    let loading = 0, items = 0
    ;(window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-loading') loading++; if (o.name?.startsWith('furniture-')) items++ })
    return items === 4 && loading === 0
  })
  await page.waitForTimeout(600)
}

const stats = (page: Page) => page.evaluate(() => {
  const c = document.querySelector('[data-testid=quality-image] canvas') as HTMLCanvasElement
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  let sum = 0, sum2 = 0, n = 0, nonBlack = 0
  for (let i = 0; i < d.length; i += 16) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; sum2 += v * v; n++; if (v > 8) nonBlack++ }
  const mean = sum / n
  return { w: c.width, h: c.height, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), nonBlack: nonBlack / n }
})

test('16.1: интерактивная сцена с единым светом и тенями; кадр для отчёта', async ({ page }) => {
  await openFurnished(page)
  const light = await page.evaluate(() => {
    const p = (window as any).__interior.probe
    const sun = p.scene.getObjectByName('sun')
    return { shadows: p.gl.shadowMap.enabled, cast: sun.castShadow, tone: p.gl.toneMapping, cs: p.gl.outputColorSpace }
  })
  expect(light).toMatchObject({ shadows: true, cast: true })
  await page.getByTestId('interior-scene').screenshot({ path: `${OUT}/interactive.png` })
})

test('16.3 / 17: «Качественный снимок» строится, показывает прогресс, соответствует проекту и после изменения проекта неактуален (AC-15)', async ({ page }) => {
  test.setTimeout(240_000)
  await openFurnished(page)
  await page.getByTestId('quality-open').click()
  await page.getByTestId('quality-samples').selectOption('16')
  const projectBefore = JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))
  const t0 = Date.now()
  await page.getByTestId('quality-start').click()
  await expect(page.getByTestId('quality-progress')).toBeVisible()
  await expect(page.getByTestId('quality-done')).toBeVisible({ timeout: 200_000 })
  const wall = (Date.now() - t0) / 1000
  const s = await stats(page)
  // Кадр и замер пишутся до проверок, чтобы при провале было что смотреть.
  await page.getByTestId('quality-image').screenshot({ path: `${OUT}/path-traced-16-${test.info().project.name}.png` })
  console.log(`quality-shot 16 samples: ${wall.toFixed(1)} s, ${s.w}x${s.h}, mean ${s.mean.toFixed(1)}, std ${s.std.toFixed(1)}, nonBlack ${s.nonBlack.toFixed(3)}; ${await page.getByTestId('quality-done').textContent()}`)
  // Комната занимает заметную часть кадра (фон тёмный, как в редакторе). На этой камере доля 0,198–0,206
  // в Chrome и Edge (замеры 2026-11-16), поэтому порог 0,2 давал случайные провалы; пустой кадр даёт около 0.
  expect(s.nonBlack).toBeGreaterThan(0.12)
  expect(s.std).toBeGreaterThan(8) // и не однотонное
  // Редактор не изменился; снимок актуален.
  expect(JSON.stringify(await page.evaluate(() => (window as any).__interior.project.getState().history.present))).toBe(projectBefore)
  await expect(page.getByTestId('quality-stale')).toHaveCount(0)
  // Изменение проекта (через панель плана) делает снимок неактуальным.
  await page.evaluate(() => {
    const ed = (window as any).__interior.editor.getState()
    const f = Object.values((window as any).__interior.project.getState().history.present.furniture)[0] as any
    ed.select(f.id); ed.removeSelected()
  })
  await expect(page.getByTestId('quality-stale')).toBeVisible()
  await expect(page.getByTestId('quality-image')).toHaveAttribute('data-stale', 'true')
  // «К редактору»: кнопка показывает, что снимок устарел.
  await page.getByTestId('quality-close').click()
  await expect(page.getByTestId('quality-open')).toContainText('устарел')
})

test('17.2: отмена посреди съёмки возвращает редактор в рабочее состояние', async ({ page }) => {
  test.setTimeout(240_000)
  await openFurnished(page)
  await page.getByTestId('quality-open').click()
  await page.getByTestId('quality-samples').selectOption('256')
  await page.getByTestId('quality-start').click()
  await expect(page.getByTestId('quality-progress')).toContainText('Выборок', { timeout: 120_000 })
  await page.getByTestId('quality-cancel').click()
  await expect(page.getByTestId('quality-cancelled')).toBeVisible()
  await page.getByTestId('quality-close').click()
  // Редактор жив: предмет переносится, а 3D показывает комнату.
  const id = Object.keys(await page.evaluate(() => (window as any).__interior.project.getState().history.present.furniture))[0]
  await page.getByTestId(`plan-item-${id}`).click()
  await expect(page.getByTestId('selection')).toContainText(/Диван|Столик|Кресло|Стеллаж/)
  // Память: после отмены запуска можно повторить без ошибок.
  await page.getByTestId('quality-open').click()
  await page.getByTestId('quality-samples').selectOption('16')
  await page.getByTestId('quality-start').click()
  await expect(page.getByTestId('quality-done')).toBeVisible({ timeout: 200_000 })
  console.log(`повторный снимок после отмены (рендерер уже прогрет): ${await page.getByTestId('quality-done').textContent()}`)
})

test('17.2: нет поддержки нужных расширений — понятная ошибка, редактор работает', async ({ page }) => {
  await openFurnished(page)
  await page.evaluate(() => {
    const orig = WebGL2RenderingContext.prototype.getExtension
    WebGL2RenderingContext.prototype.getExtension = function (name: string) { return name === 'EXT_color_buffer_float' ? null : orig.call(this, name) }
  })
  await page.getByTestId('quality-open').click()
  await page.getByTestId('quality-start').click()
  await expect(page.getByTestId('quality-error')).toContainText('EXT_color_buffer_float', { timeout: 60_000 })
  await expect(page.getByTestId('quality-error')).toContainText('Редактор работает как прежде')
  await page.getByTestId('quality-close').click()
  const id = Object.keys(await page.evaluate(() => (window as any).__interior.project.getState().history.present.furniture))[0]
  await page.getByTestId(`plan-item-${id}`).click()
  await expect(page.getByTestId('selection')).not.toHaveText('Предмет не выбран')
})
