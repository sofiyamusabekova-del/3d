import { useMemo } from 'react'
import { dayAmount } from '../scene3d/hour'

/**
 * Запасная картинка главного меню: светлая комната в изометрии (чёрный стол, белые стулья, лампа, большое окно).
 * Чистая SVG-графика без 3D-движка: показывается, пока грузится живая 3D-комната, и вместо неё, если нет WebGL.
 * Час задаётся снаружи (общий с ползунком и лампой).
 */
const P = (x: number, y: number, z: number): [number, number] => [340 + 40 * x - 40 * y, 130 + 20 * x + 20 * y - z]
const pts = (a: Array<[number, number]>) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
const g = (v: number) => { const c = Math.max(0, Math.min(255, Math.round(v))); return `rgb(${c},${c},${c})` }

function box(x0: number, y0: number, x1: number, y1: number, h: number, v: number, z0 = 0): string {
  const z1 = z0 + h
  return `<polygon points="${pts([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)])}" fill="${g(v * 0.84)}"/>`
    + `<polygon points="${pts([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)])}" fill="${g(v * 0.66)}"/>`
    + `<polygon points="${pts([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)])}" fill="${g(v)}"/>`
}

/** Свет по часу: 0 ночью, 1 днём (плавно, общая функция с 3D-комнатой). */
export const daylightFactor = dayAmount

export function formatClock(hour: number): string {
  const total = Math.round(hour * 2) / 2
  const h = Math.floor(total)
  return `${h < 10 ? '0' : ''}${h}:${total % 1 ? '30' : '00'}`
}

export function sceneMarkup(hour: number): string {
  const l = daylightFactor(hour)
  const k = 0.5 + 0.5 * l
  const lamp = 1 - l
  let o = ''
  o += `<polygon points="${pts([P(0, 0, 0), P(6, 0, 0), P(6, 5, 0), P(0, 5, 0)])}" fill="${g(246 * k)}"/>`
  o += `<polygon points="${pts([P(0, 0, 0), P(0, 5, 0), P(0, 5, 90), P(0, 0, 90)])}" fill="${g(214 * k)}"/>`
  o += `<polygon points="${pts([P(0, 0, 0), P(6, 0, 0), P(6, 0, 90), P(0, 0, 90)])}" fill="${g(234 * k)}"/>`
  o += `<polygon points="${pts([P(0, 0.6, 18), P(0, 3.2, 18), P(0, 3.2, 60), P(0, 0.6, 60)])}" fill="${g(26)}"/>`
  o += `<polygon points="${pts([P(3.4, 0, 6), P(5.7, 0, 6), P(5.7, 0, 82), P(3.4, 0, 82)])}" fill="${g(20 + 235 * l)}" stroke="#111" stroke-width="3"/>`
  const m0 = P(4.55, 0, 6), m1 = P(4.55, 0, 82)
  o += `<line x1="${m0[0]}" y1="${m0[1]}" x2="${m1[0]}" y2="${m1[1]}" stroke="#111" stroke-width="2.5"/>`
  if (l > 0.1) o += `<polygon points="${pts([P(3.4, 0, 0), P(5.7, 0, 0), P(5.9, 3.8, 0), P(3.7, 3.8, 0)])}" fill="#fff" opacity="${(0.55 * l).toFixed(2)}"/>`
  const c = P(3.1, 2.6, 0)
  o += `<ellipse cx="${c[0]}" cy="${c[1] + 2}" rx="70" ry="28" fill="#000" opacity="0.14"/>`
  o += box(1.8, 2.1, 4.4, 3.1, 26, 22, 2) + box(2.4, 2.45, 2.6, 2.65, 2, 22) + box(4.0, 2.45, 4.2, 2.65, 2, 22)
  for (const [x, y] of [[2.2, 1.3], [3.7, 1.3], [2.2, 3.95], [3.7, 3.95]]) {
    o += box(x - 0.28, y - 0.28, x + 0.28, y + 0.28, 14, 236 * k, 6) + box(x - 0.28, y - 0.28, x + 0.28, y - 0.15, 26, 236 * k, 6)
    o += box(x - 0.22, y - 0.22, x - 0.16, y - 0.16, 6, 20) + box(x + 0.16, y + 0.16, x + 0.22, y + 0.22, 6, 20)
  }
  const t = P(3.1, 2.6, 100), b = P(3.1, 2.6, 74)
  o += `<line x1="${t[0]}" y1="${t[1]}" x2="${b[0]}" y2="${b[1] - 8}" stroke="#222" stroke-width="0.8"/>`
  if (lamp > 0.1) o += `<circle cx="${b[0]}" cy="${b[1] + 12}" r="${26 + 34 * lamp}" fill="#fff" opacity="${(0.2 * lamp).toFixed(2)}"/>`
  o += `<path d="M${b[0] - 20} ${b[1] + 8} A20 17 0 0 1 ${b[0] + 20} ${b[1] + 8} Z" fill="#111"/>`
  return o
}

/** Запасная картинка: SVG по часу. */
export function StartSceneFallback({ hour }: { hour: number }) {
  const markup = useMemo(() => sceneMarkup(hour), [hour])
  return <svg className="start-fallback" viewBox="120 8 480 330" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Светлая комната с чёрным столом, белыми стульями, лампой и большим окном" dangerouslySetInnerHTML={{ __html: markup }} />
}
