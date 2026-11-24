import type { Pt } from '../geometry/polygon'

/**
 * Вид плана: точка проекта (см) в левом верхнем углу области и масштаб в пикселях на см.
 * Чистые функции без DOM: перевод указателя не зависит от того, чем нарисован план.
 */
export interface Viewport {
  xCm: number
  zCm: number
  pxPerCm: number
}

/** Пределы масштаба интерфейса (не требование проекта): комната 1500 см помещается, 1 см виден. */
export const MIN_PX_PER_CM = 0.1
export const MAX_PX_PER_CM = 8

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Точка в пикселях области (от её левого верхнего угла) → координаты проекта, см. */
export const screenToPlan = (vp: Viewport, sx: number, sy: number): Pt => ({
  x: vp.xCm + sx / vp.pxPerCm,
  z: vp.zCm + sy / vp.pxPerCm,
})

export const planToScreen = (vp: Viewport, p: Pt): { x: number; y: number } => ({
  x: (p.x - vp.xCm) * vp.pxPerCm,
  y: (p.z - vp.zCm) * vp.pxPerCm,
})

/** Масштабирование вокруг точки под указателем: эта точка проекта остаётся на месте. */
export function zoomAt(vp: Viewport, sx: number, sy: number, factor: number): Viewport {
  const next = clamp(vp.pxPerCm * factor, MIN_PX_PER_CM, MAX_PX_PER_CM)
  const p = screenToPlan(vp, sx, sy)
  return { pxPerCm: next, xCm: p.x - sx / next, zCm: p.z - sy / next }
}

/** Сдвиг вида на dx, dy пикселей: содержимое следует за указателем. */
export const panBy = (vp: Viewport, dx: number, dy: number): Viewport => ({
  ...vp,
  xCm: vp.xCm - dx / vp.pxPerCm,
  zCm: vp.zCm - dy / vp.pxPerCm,
})

/** Вписывает прямоугольник проекта (см) в область wPx × hPx с полем в пикселях. */
export function fitViewport(b: { minX: number; minZ: number; maxX: number; maxZ: number }, wPx: number, hPx: number, marginPx = 24): Viewport {
  const w = Math.max(b.maxX - b.minX, 1)
  const h = Math.max(b.maxZ - b.minZ, 1)
  const pxPerCm = clamp(Math.min((wPx - 2 * marginPx) / w, (hPx - 2 * marginPx) / h), MIN_PX_PER_CM, MAX_PX_PER_CM)
  return {
    pxPerCm,
    xCm: b.minX - (wPx / pxPerCm - w) / 2,
    zCm: b.minZ - (hPx / pxPerCm - h) / 2,
  }
}
