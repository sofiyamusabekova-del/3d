import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Этап 25 (SPEC D-13): система оформления в src/ui/tokens.css: полнота переменных и контраст (WCAG 2.x) прямо по файлу.
const css = readFileSync('src/ui/tokens.css', 'utf8')
const vars = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))

const rgb = (hex: string): [number, number, number] => {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) throw new Error(`не цвет: ${hex}`)
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number]
}
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(rgb(vars[a] ?? a)), lum(rgb(vars[b] ?? b))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('25.1 система оформления', () => {
  it('в файле заданы цвета, типографика, форма, отступы, глубина и переходы', () => {
    const need = [
      'bg', 'surface', 'surface-2', 'surface-3', 'border', 'border-strong', 'text', 'text-muted', 'accent', 'accent-strong', 'accent-ink', 'accent-soft', 'focus', 'danger', 'ok', 'warning',
      'plan-bg', 'plan-room', 'plan-wall', 'plan-furniture', 'plan-furniture-edge',
      'font', 'text-xs', 'text-sm', 'text-md', 'text-lg', 'text-xl', 'text-2xl', 'leading', 'weight-regular', 'weight-strong',
      'radius', 'radius-lg', 'space-1', 'space-2', 'space-3', 'space-4', 'shadow-1', 'shadow-2', 'ease',
    ]
    for (const n of need) expect(vars[n], `--${n}`).toBeTruthy()
  })

  it('шкала текста возрастает, отступы кратны 4 и возрастают', () => {
    const px = (n: string) => parseFloat(vars[n])
    const sizes = ['text-xs', 'text-sm', 'text-md', 'text-lg', 'text-xl', 'text-2xl'].map(px)
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1])
    expect(sizes[0]).toBeGreaterThanOrEqual(12) // мельче 12 пикселей текст не бывает
    const space = ['space-1', 'space-2', 'space-3', 'space-4'].map(px)
    for (const s of space) expect(s % 4).toBe(0)
    for (let i = 1; i < space.length; i++) expect(space[i]).toBeGreaterThan(space[i - 1])
  })

  it('текст читается на всех слоях: основной и приглушённый не ниже AA (4,5:1)', () => {
    for (const layer of ['bg', 'surface', 'surface-2', 'surface-3']) {
      expect(ratio('text', layer), `основной на ${layer}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio('text-muted', layer), `приглушённый на ${layer}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('акцент, ошибка, успех и предупреждение читаются как текст на слоях интерфейса', () => {
    for (const c of ['accent', 'danger', 'ok', 'warning', 'focus']) {
      for (const layer of ['bg', 'surface', 'surface-2']) expect(ratio(c, layer), `${c} на ${layer}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('кнопка с акцентом: текст на акценте и на акценте при наведении не ниже AA', () => {
    expect(ratio('accent-ink', 'accent')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('accent-ink', 'accent-strong')).toBeGreaterThanOrEqual(4.5)
  })

  it('границы полей и кнопок, фокус и план различимы не ниже 3:1', () => {
    for (const layer of ['bg', 'surface', 'surface-2']) {
      expect(ratio('border-strong', layer), `граница на ${layer}`).toBeGreaterThanOrEqual(3)
      expect(ratio('focus', layer), `фокус на ${layer}`).toBeGreaterThanOrEqual(3)
    }
    expect(ratio('plan-wall', 'plan-bg'), 'стены на плане').toBeGreaterThanOrEqual(3)
    expect(ratio('plan-wall', 'plan-room'), 'стены и комната').toBeGreaterThanOrEqual(3)
    expect(ratio('plan-furniture-edge', 'plan-room'), 'контур мебели').toBeGreaterThanOrEqual(3)
    expect(ratio('plan-furniture-edge', 'plan-furniture'), 'контур и заливка мебели').toBeGreaterThanOrEqual(3)
    expect(ratio('text', 'plan-furniture'), 'подпись на мебели').toBeGreaterThanOrEqual(4.5)
    expect(ratio('text', 'plan-room'), 'подпись на комнате').toBeGreaterThanOrEqual(4.5)
    expect(ratio('text-muted', 'plan-bg'), 'размеры на плане').toBeGreaterThanOrEqual(4.5)
  })

  it('слои различимы между собой: каждый следующий светлее предыдущего', () => {
    const l = ['bg', 'surface', 'surface-2', 'surface-3'].map((n) => lum(rgb(vars[n])))
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThan(l[i - 1])
  })

  it('фон 3D совпадает с фоном приложения (--bg)', () => {
    const light = readFileSync('src/scene3d/lightParams.ts', 'utf8')
    expect(light).toContain(`background: '${vars.bg}'`)
  })
})
