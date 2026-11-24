import { EPS_CM, signedArea, type Pt } from './polygon'

/** Прямоугольник на плане: центр, размеры в см и поворот вокруг вертикальной оси. */
export interface RotatedRect {
  cx: number
  cz: number
  w: number
  d: number
  angleDeg: number
}

/**
 * Преобразование локальных осей предмета в мировые. Совпадает с three.js rotation.y = θ:
 * x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ. На плане SVG это rotate(−θ).
 */
export function localToWorld(x: number, z: number, angleDeg: number): Pt {
  const t = (angleDeg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  return { x: x * c + z * s, z: -x * s + z * c }
}

export function rectCorners(r: RotatedRect): Pt[] {
  const hw = r.w / 2
  const hd = r.d / 2
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, z]) => {
    const p = localToWorld(x, z, r.angleDeg)
    return { x: r.cx + p.x, z: r.cz + p.z }
  })
}

/** Все точки лежат внутри выпуклого многоугольника; касание границы допустимо. */
export function pointsInsideConvex(points: Pt[], poly: Pt[], eps = EPS_CM): boolean {
  const orient = Math.sign(signedArea(poly)) || 1
  return points.every((p) =>
    poly.every((a, i) => {
      const b = poly[(i + 1) % poly.length]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const cross = ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / len
      return cross * orient >= -eps
    }),
  )
}

/** Пересечение выпуклых многоугольников (SAT): касание без проникновения не считается. */
export function convexOverlap(a: Pt[], b: Pt[], eps = EPS_CM): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const nx = -(q.z - p.z)
      const nz = q.x - p.x
      const len = Math.hypot(nx, nz)
      const proj = (pts: Pt[]) => pts.map((v) => (v.x * nx + v.z * nz) / len)
      const pa = proj(a)
      const pb = proj(b)
      const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb))
      if (overlap <= eps) return false
    }
  }
  return true
}
