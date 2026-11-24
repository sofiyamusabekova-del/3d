import { localToWorld, rectCorners } from '../geometry/placement'
import type { Pt } from '../geometry/polygon'
import { roomClearPolygon } from './derive'
import { openingFrame } from './doors'
import type { Catalog } from './placement'
import { elevationOf } from './placement'
import type { Apartment, Id } from './types'

/**
 * Проверка проходов в комнате (этап 2 доработок, SPEC D-31). Подсказка, а не запрет: расстановка остаётся допустимой.
 * Три вида замечаний: «узкий проход» между двумя предметами или предметом и стеной, «дверь загорожена» (от двери нет
 * прохода шириной 60 см) и «часть комнаты отрезана» (свободное место, до которого от двери не дойти).
 */
export const MIN_PASSAGE_CM = 60
/** Щели уже этого не считаются проходом: туда никто не пойдёт (тумба вплотную к кровати и т.п.). */
export const DEAD_GAP_CM = 25
const CELL = 5
/** Предмет мешает ходьбе, если его низ ниже этой высоты (полка на 120 см и картина выше пояса не мешают). */
const WALK_BLOCK_BELOW_CM = 100
/** Часть комнаты меньше этой площади не считается отрезанной (угол за шкафом). */
const MIN_CUTOFF_AREA_CM2 = 4000
/** Сколько подряд лежащих образцов (по 5 см) должно смотреть друг на друга, чтобы щель считалась проходом. */
const MIN_FACING_SAMPLES = 6

export type ClearanceKind = 'narrow' | 'door-blocked' | 'cut-off'

export interface ClearanceIssue {
  kind: ClearanceKind
  /** Точка замечания на плане, см. */
  xCm: number
  zCm: number
  message: string
  /** Предметы и двери, о которых речь. */
  ids: Id[]
  /** Ширина прохода, см (у узкого прохода). */
  gapCm?: number
}

export interface Obstacle { id: Id; name: string; pts: Pt[] }

function insidePoly(p: Pt, poly: Pt[]): boolean {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)
    const s = Math.sign(cross)
    if (s !== 0) { if (sign !== 0 && s !== sign) return false; sign = s }
  }
  return true
}

export function nearestOnSegment(p: Pt, a: Pt, b: Pt): { q: Pt; d: number } {
  const dx = b.x - a.x, dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2))
  const q = { x: a.x + dx * t, z: a.z + dz * t }
  return { q, d: Math.hypot(p.x - q.x, p.z - q.z) }
}

function nearestOnPoly(p: Pt, pts: Pt[], closed: boolean): { q: Pt; d: number } {
  let best = { q: pts[0], d: Infinity }
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const r = nearestOnSegment(p, pts[i], pts[(i + 1) % pts.length])
    if (r.d < best.d) best = r
  }
  return best
}

/** Образцы по контуру через 5 см, у каждого — единичное направление его стороны. */
function samplesAlong(pts: Pt[]): Array<Pt & { tx: number; tz: number }> {
  const out: Array<Pt & { tx: number; tz: number }> = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len < 1e-6) continue
    const n = Math.max(1, Math.round(len / CELL))
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n, tx: (b.x - a.x) / len, tz: (b.z - a.z) / len })
  }
  return out
}

/** Следы предметов комнаты, которые мешают ходить (выше пола и ниже 100 см над ним у подвесных). */
export function obstaclesOf(apt: Apartment, catalog: Catalog, roomId: Id): Obstacle[] {
  const out: Obstacle[] = []
  for (const f of Object.values(apt.furniture)) {
    const item = catalog[f.catalogItemId]
    if (f.roomId !== roomId || !item || item.layer === 'floorCovering' || item.mount === 'surface' || item.mount === 'ceiling') continue
    const elev = elevationOf(apt, item, f)
    if (elev >= WALK_BLOCK_BELOW_CM) continue
    for (const c of item.colliders) {
      if (c.yMaxCm + elev <= 10) continue
      const off = localToWorld(c.xCm, c.zCm, f.angleDeg)
      out.push({ id: f.id, name: item.name, pts: rectCorners({ cx: f.xCm + off.x, cz: f.zCm + off.z, w: c.widthCm, d: c.depthCm, angleDeg: f.angleDeg }) })
    }
  }
  return out
}

/** Узкие проходы: пары «предмет — предмет» и «предмет — стена» с зазором от 25 до 60 см на протяжении не менее 30 см. */
function narrowPassages(clear: Pt[], obstacles: Obstacle[]): ClearanceIssue[] {
  const issues: ClearanceIssue[] = []
  const walls = clear.map((a, i) => ({ id: `wall${i}`, name: 'стена', pts: [a, clear[(i + 1) % clear.length]] }))
  const freeBetween = (m: Pt, skip: Set<Id>) => !obstacles.some((o) => !skip.has(o.id) && insidePoly(m, o.pts))
  const scan = (a: Obstacle, b: { id: Id; name: string; pts: Pt[] }, closed: boolean) => {
    const hits: Array<{ m: Pt; d: number }> = []
    for (const s of samplesAlong(a.pts)) {
      const { q, d } = nearestOnPoly(s, b.pts, closed)
      if (d < DEAD_GAP_CM || d >= MIN_PASSAGE_CM) continue
      // Стороны должны смотреть друг на друга: взгляд от образца к ближайшей точке почти перпендикулярен его стороне
      // (иначе это зазор до угла соседа, а не проход между двумя поверхностями).
      if (Math.abs((q.x - s.x) * s.tx + (q.z - s.z) * s.tz) / d > 0.2) continue
      const m = { x: (s.x + q.x) / 2, z: (s.z + q.z) / 2 }
      if (insidePoly(m, a.pts) || (closed && insidePoly(m, b.pts))) continue
      if (!freeBetween(m, new Set([a.id, b.id]))) continue
      hits.push({ m, d })
    }
    if (hits.length < MIN_FACING_SAMPLES) return
    const mid = hits[Math.floor(hits.length / 2)].m
    const gap = Math.round(Math.min(...hits.map((h) => h.d)))
    issues.push({
      kind: 'narrow', xCm: mid.x, zCm: mid.z, gapCm: gap, ids: [a.id, b.id].filter((id) => !id.startsWith('wall')),
      message: `Узкий проход ${gap} см между «${a.name}» и ${b.id.startsWith('wall') ? 'стеной' : `«${b.name}»`}: нужно не меньше ${MIN_PASSAGE_CM} см`,
    })
  }
  for (let i = 0; i < obstacles.length; i++) {
    for (let j = i + 1; j < obstacles.length; j++) if (obstacles[i].id !== obstacles[j].id) scan(obstacles[i], obstacles[j], true)
    for (const w of walls) scan(obstacles[i], w, false)
  }
  // Один предмет с несколькими коллайдерами или пара с одним и тем же зазором не должны дублироваться.
  const seen = new Set<string>()
  return issues.filter((x) => { const k = `${x.ids.slice().sort().join('|')}|${x.gapCm}`; if (seen.has(k)) return false; seen.add(k); return true })
}

/** Сетка 5 см: расстояние от каждой клетки до ближайшей преграды (стена или предмет), см. */
function distanceGrid(clear: Pt[], obstacles: Obstacle[]) {
  const xs = clear.map((p) => p.x), zs = clear.map((p) => p.z)
  const x0 = Math.min(...xs) - CELL, z0 = Math.min(...zs) - CELL
  const w = Math.ceil((Math.max(...xs) - x0) / CELL) + 2, h = Math.ceil((Math.max(...zs) - z0) / CELL) + 2
  const blocked = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = { x: x0 + (i + 0.5) * CELL, z: z0 + (j + 0.5) * CELL }
      if (!insidePoly(p, clear) || obstacles.some((o) => insidePoly(p, o.pts))) blocked[j * w + i] = 1
    }
  }
  // Двухпроходное преобразование расстояний (3-4): достаточно точно для порога в 30 см.
  const INF = 1e9
  const dist = new Float64Array(w * h)
  for (let k = 0; k < w * h; k++) dist[k] = blocked[k] ? 0 : INF
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : dist[j * w + i])
  const D1 = CELL, D2 = CELL * Math.SQRT2
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i
    dist[k] = Math.min(dist[k], at(i - 1, j) + D1, at(i, j - 1) + D1, at(i - 1, j - 1) + D2, at(i + 1, j - 1) + D2)
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i
    dist[k] = Math.min(dist[k], at(i + 1, j) + D1, at(i, j + 1) + D1, at(i + 1, j + 1) + D2, at(i - 1, j + 1) + D2)
  }
  return { w, h, x0, z0, dist, blocked }
}

/** Все замечания по проходам комнаты. Комната без предметов замечаний не даёт. */
export function analyzeClearance(apt: Apartment, catalog: Catalog, roomId: Id): ClearanceIssue[] {
  const room = apt.rooms[roomId]
  if (!room) return []
  const clear = roomClearPolygon(apt, room)
  const obstacles = obstaclesOf(apt, catalog, roomId)
  if (obstacles.length === 0) return []
  const issues = narrowPassages(clear, obstacles)

  const { w, h, x0, z0, dist } = distanceGrid(clear, obstacles)
  const half = MIN_PASSAGE_CM / 2
  const walkable = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && dist[j * w + i] >= half
  const cellOf = (p: Pt) => ({ i: Math.floor((p.x - x0) / CELL), j: Math.floor((p.z - z0) / CELL) })

  // Заливка от дверей: стартуем с проходимых клеток в полуметре перед проёмом.
  const reached = new Uint8Array(w * h)
  const queue: number[] = []
  const doors = Object.values(apt.openings).filter((o) => o.kind === 'door' && room.boundary.some((b) => b.wallId === o.wallId))
  for (const d of doors) {
    const f = openingFrame(apt, d, roomId)
    const c = { x: (f.p0.x + f.p1.x) / 2, z: (f.p0.z + f.p1.z) / 2 }
    let found = false
    for (let k = 0; k <= 10 && !found; k++) { // от проёма вглубь комнаты, до 50 см
      const p = { x: c.x + f.nIn.x * (CELL * (k + 3)), z: c.z + f.nIn.z * (CELL * (k + 3)) }
      const { i, j } = cellOf(p)
      for (let dj = -4; dj <= 4 && !found; dj++) for (let di = -4; di <= 4 && !found; di++) {
        if (walkable(i + di, j + dj) && !reached[(j + dj) * w + i + di]) { reached[(j + dj) * w + i + di] = 1; queue.push((j + dj) * w + i + di); found = true }
      }
    }
    if (!found) {
      issues.push({ kind: 'door-blocked', xCm: c.x + f.nIn.x * 40, zCm: c.z + f.nIn.z * 40, ids: [d.id], message: `Дверь загорожена: от проёма нет прохода шириной ${MIN_PASSAGE_CM} см` })
    }
  }
  while (queue.length) {
    const k = queue.pop()!
    const i = k % w, j = (k - i) / w
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj
      if (walkable(ni, nj) && !reached[nj * w + ni]) { reached[nj * w + ni] = 1; queue.push(nj * w + ni) }
    }
  }
  // Проходимые клетки, до которых не дойти: связные куски не меньше 0,4 м².
  if (doors.length > 0) {
    const seen = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k0 = j * w + i
      if (!walkable(i, j) || reached[k0] || seen[k0]) continue
      const stack = [k0]
      seen[k0] = 1
      let n = 0, sx = 0, sz = 0
      while (stack.length) {
        const k = stack.pop()!
        const ci = k % w, cj = (k - ci) / w
        n++; sx += x0 + (ci + 0.5) * CELL; sz += z0 + (cj + 0.5) * CELL
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di, nj = cj + dj
          if (walkable(ni, nj) && !reached[nj * w + ni] && !seen[nj * w + ni]) { seen[nj * w + ni] = 1; stack.push(nj * w + ni) }
        }
      }
      if (n * CELL * CELL >= MIN_CUTOFF_AREA_CM2) {
        issues.push({ kind: 'cut-off', xCm: sx / n, zCm: sz / n, ids: [], message: `Часть комнаты отрезана мебелью (${(n * CELL * CELL / 10000).toFixed(1).replace('.', ',')} м²): от двери туда не пройти` })
      }
    }
  }
  return issues
}
