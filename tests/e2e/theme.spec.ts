import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Этап 25 (SPEC D-13): единая тёмная тема. THEME_PHASE=before снимает только кадры «до» (docs/reports/stage25/before-*),
// без нее — проверки контраста текста (WCAG AA), клавиатуры и размеров окна и кадры «после» (after-*).
const OUT = 'docs/reports/stage25'
mkdirSync(OUT, { recursive: true })
const BEFORE = process.env.THEME_PHASE === 'before'
const tag = BEFORE ? 'before' : 'after'

type Screen = 'params' | 'schemes' | 'setup' | 'interior'

async function open(page: Page, screen: Screen) {
  await page.goto('/')
  if (screen === 'params') return
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('43')
  await page.getByTestId('submit-params').click()
  if (screen === 'schemes') return
  await page.getByTestId('choose-1b').click()
  await expect(page.getByTestId('setup-plan')).toBeVisible()
  if (screen === 'setup') return
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const id = await page.evaluate(() => {
    const p = (window as any).__interior.project.getState().history.present
    return (Object.values(p.rooms) as any[]).find((r) => r.name === 'Комната').id as string
  })
  await page.evaluate((rid) => (window as any).__interior.store.getState().enter(rid), id)
  await expect(page.getByTestId('active-room')).toHaveText('Комната')
  for (const item of ['sofa_02', 'modern_coffee_table_01', 'kenney_lampRoundFloor']) { await page.getByTestId('catalog-scope-all').click(); await page.getByTestId(`add-${item}`).click() }
  await page.waitForFunction(() => { let l = 0; (window as any).__interior.probe.scene.traverse((o: any) => { if (o.name === 'model-loading') l++ }); return l === 0 })
  await page.getByTestId('side-0').click()
  await page.locator('[data-testid^="paint-"]').nth(4).click()
  await page.getByTestId('floor-laminate-oak_natural').click()
  await page.getByTestId('interior-scene').click({ position: { x: 3, y: 3 } })
  await page.waitForTimeout(700)
}

const SCREENS: Screen[] = ['params', 'schemes', 'setup', 'interior']
const SIZES = [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]

for (const size of SIZES) {
  for (const screen of SCREENS) {
    test(`25: кадр «${tag}»: ${screen} ${size.width}×${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await open(page, screen)
      await page.screenshot({ path: `${OUT}/${tag}-${screen}-${size.width}-${test.info().project.name}.png` })
    })
  }
}

if (!BEFORE) {
  /** Контраст каждого видимого текста с фоном по факту отрисовки (WCAG 2.x), без отключённых элементов. */
  const contrast = (page: Page) => page.evaluate(() => {
    const parse = (s: string) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a } }
    const over = (top: { r: number; g: number; b: number; a: number }, bot: { r: number; g: number; b: number }) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a) })
    const lum = (c: { r: number; g: number; b: number }) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
    const bgOf = (el: Element) => {
      const stack: Array<ReturnType<typeof parse>> = []
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor)
        if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break }
      }
      let base = { r: 15, g: 17, b: 23 } // фон страницы (--bg), если все слои прозрачны
      for (const c of stack.reverse()) base = over(c!, base)
      return base
    }
    const fails: string[] = []
    let checked = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim()
      const el = n.parentElement
      if (!text || !el) continue
      const st = getComputedStyle(el)
      // Текст внутри SVG (план) красится заливкой поверх контура: его контраст проверяет tests/unit/theme.test.ts по токенам.
      if (st.visibility === 'hidden' || st.display === 'none' || el.closest('[disabled], [aria-disabled=true], canvas, script, style, svg')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      let opacity = 1
      for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity)
      const fg = parse(st.color)
      if (!fg) continue
      const bg = bgOf(el)
      const fgc = over({ ...fg, a: fg.a * opacity }, bg)
      const ratio = (Math.max(lum(fgc), lum(bg)) + 0.05) / (Math.min(lum(fgc), lum(bg)) + 0.05)
      const size = parseFloat(st.fontSize), bold = Number(st.fontWeight) >= 700
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5
      checked++
      if (ratio < need) fails.push(`«${text.slice(0, 40)}» ${ratio.toFixed(2)} < ${need} (${st.color} на rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}))`)
    }
    return { checked, fails }
  })

  for (const screen of SCREENS) {
    test(`25.1: контраст текста не ниже AA на экране ${screen}`, async ({ page }) => {
      await open(page, screen)
      const r = await contrast(page)
      expect(r.checked, 'на экране есть проверяемый текст').toBeGreaterThan(8)
      expect(r.fails, r.fails.join('\n')).toEqual([])
    })
  }

  test('25.1: интерактивные элементы имеют видимый фокус клавиатуры и состояние наведения', async ({ page }) => {
    await open(page, 'params')
    const seen: string[] = []
    // На странице параметров четыре точки останова: шаг мастера, число комнат (группа переключателей), площадь, кнопка.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      const f = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null
        if (!e || e === document.body) return null
        const s = getComputedStyle(e)
        return { tag: e.tagName, id: e.getAttribute('data-testid') ?? e.tagName, outline: s.outlineStyle, width: parseFloat(s.outlineWidth), box: s.boxShadow }
      })
      expect(f, `Tab ${i + 1}`).not.toBeNull()
      expect(f!.outline !== 'none' && f!.width >= 2 || f!.box !== 'none', `у ${f!.id} виден фокус`).toBe(true)
      seen.push(f!.id)
    }
    expect(new Set(seen).size).toBe(4) // порядок обхода проходит по разным элементам
    // Наведение меняет вид кнопки.
    const btn = page.getByTestId('submit-params')
    const a = await btn.evaluate((e) => getComputedStyle(e).filter + getComputedStyle(e).backgroundColor)
    await btn.hover()
    await page.waitForTimeout(250)
    const b = await btn.evaluate((e) => getComputedStyle(e).filter + getComputedStyle(e).backgroundColor)
    expect(b).not.toBe(a)
  })

  test('25.5: мастер без мыши: фокус на поле площади, ввод и Enter ведут к схемам', async ({ page }) => {
    await open(page, 'params')
    await page.getByTestId('area-input').focus()
    await page.keyboard.type('43')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('closest-1b')).toBeVisible()
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused).toBeTruthy()
  })

  for (const size of SIZES) {
    test(`25.5: окно ${size.width}×${size.height}: нет горизонтальной прокрутки, панели доступны прокруткой`, async ({ page }) => {
      await page.setViewportSize(size)
      for (const screen of SCREENS) {
        await open(page, screen)
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
        expect(m.sw, `${screen}: ширина содержимого`).toBeLessThanOrEqual(m.cw + 1)
      }
      // Интерьер: каталог в левой колонке достижим прокруткой колонки (панель не обрезана).
      const aside = await page.evaluate(() => {
        const a = document.querySelector('aside') as HTMLElement
        return { scrollable: a.scrollHeight > a.clientHeight, overflowY: getComputedStyle(a).overflowY, h: a.clientHeight }
      })
      expect(['auto', 'scroll']).toContain(aside.overflowY)
      await page.getByTestId('catalog-scope-all').scrollIntoViewIfNeeded()
      await expect(page.getByTestId('catalog-scope-all')).toBeVisible()
    })
  }
}
