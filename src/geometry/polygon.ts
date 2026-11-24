/** Чистая геометрия многоугольников в плоскости (x, z). Без зависимости от React и Three. */

export interface Pt {
  x: number
  z: number
}

/** Допуск проверок в см (SPEC §5.6); не зависит от округления подписей. */
export const EPS_CM = 0.01

/** Знаковая площадь (формула Гаусса): положительна при обходе против часовой стрелки. */
export function signedArea(p: Pt[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    s += a.x * b.z - b.x * a.z
  }
  return s / 2
}

const cross3 = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)

/** Многоугольник выпуклый (коллинеарные вершины допустимы); вырожденный — нет. */
export function isConvex(p: Pt[]): boolean {
  if (p.length < 3) return false
  const orient = Math.sign(signedArea(p))
  if (orient === 0) return false
  return p.every((a, i) => cross3(a, p[(i + 1) % p.length], p[(i + 2) % p.length]) * orient >= -EPS_CM)
}

/**
 * Рёбра многоугольника пересекаются не только в общих вершинах соседних рёбер
 * (самопересечение, касание вершиной чужого ребра, наложение рёбер).
 */
export function selfIntersects(p: Pt[]): boolean {
  const n = p.length
  const onSeg = (a: Pt, b: Pt, c: Pt) =>
    Math.abs(cross3(a, b, c)) <= EPS_CM * Math.hypot(b.x - a.x, b.z - a.z) &&
    c.x >= Math.min(a.x, b.x) - EPS_CM && c.x <= Math.max(a.x, b.x) + EPS_CM &&
    c.z >= Math.min(a.z, b.z) - EPS_CM && c.z <= Math.max(a.z, b.z) + EPS_CM
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue // соседние рёбра делят вершину
      const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n]
      const d1 = cross3(a, b, c), d2 = cross3(a, b, d), d3 = cross3(c, d, a), d4 = cross3(c, d, b)
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
      if (onSeg(a, b, c) || onSeg(a, b, d) || onSeg(c, d, a) || onSeg(c, d, b)) return true
    }
  }
  return false
}

/**
 * Сдвигает рёбра многоугольника внутрь на inward[i] (отрицательное значение — наружу).
 * Ребро i идёт от p[i] к p[i+1]. Возвращает вершины нового многоугольника.
 */
export function offsetPolygon(p: Pt[], inward: number[]): Pt[] {
  const n = p.length
  if (n < 3 || inward.length !== n) throw new Error('offsetPolygon: нужно ≥3 вершин и по смещению на ребро')
  const orient = Math.sign(signedArea(p)) || 1
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len < EPS_CM) throw new Error('offsetPolygon: ребро нулевой длины')
    const d = { x: dx / len, z: dz / len }
    const nrm = { x: (-d.z * orient), z: d.x * orient }
    return { origin: { x: a.x + nrm.x * inward[i], z: a.z + nrm.z * inward[i] }, d, nrm }
  })
  return p.map((v, i) => {
    const prev = lines[(i + n - 1) % n]
    const cur = lines[i]
    const cross = prev.d.x * cur.d.z - prev.d.z * cur.d.x
    if (Math.abs(cross) < 1e-9) {
      // Коллинеарные рёбра (например, T-образный узел): просто сдвигаем вершину.
      return { x: v.x + cur.nrm.x * inward[i], z: v.z + cur.nrm.z * inward[i] }
    }
    const wx = cur.origin.x - prev.origin.x
    const wz = cur.origin.z - prev.origin.z
    const t = (wx * cur.d.z - wz * cur.d.x) / cross
    return { x: prev.origin.x + prev.d.x * t, z: prev.origin.z + prev.d.z * t }
  })
}
