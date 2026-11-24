import { rectCorners, localToWorld, pointsInsideConvex } from '../geometry/placement'
import type { Pt } from '../geometry/polygon'
import { wallEnds, wallLengthCm, roomClearPolygon } from './derive'
import { roomsOfWall } from './doors'
import { elevationOf, type Catalog } from './placement'
import type { Apartment, Id } from './types'

/**
 * Режим «Прогулка» (этап 24, SPEC D-17): модель движения от первого лица. Чистые функции без сцены: положение игрока
 * на плане (см), препятствия (стены без дверных проёмов, мебель), скольжение вдоль препятствий, определение комнаты.
 * Внутренние двери проходимы (высота 205 см больше роста), окна нет, входная дверь закрыта: из квартиры не выйти.
 */
export const EYE_HEIGHT_CM = 160
export const PLAYER_HEIGHT_CM = 180
export const PLAYER_RADIUS_CM = 25
export const WALK_SPEED_CM_S = 140
export const RUN_FACTOR = 1.8
/** Мебель ниже этой высоты через неё «переступают» (ковры и напольные покрытия не препятствие). */
const STEP_CM = 20

export interface Obstacle {
  id: string
  kind: 'wall' | 'furniture'
  /** Выпуклый многоугольник на плане, см. */
  corners: Pt[]
}

/** Прямоугольник вдоль отрезка a→b толщиной t, продлённый на ext с каждого конца. */
function bar(a: Pt, b: Pt, t: number, extA: number, extB: number): Pt[] {
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
  const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
  const n = { x: -u.z, z: u.x }
  const h = t / 2
  const s = { x: a.x - u.x * extA, z: a.z - u.z * extA }
  const e = { x: b.x + u.x * extB, z: b.z + u.z * extB }
  return [
    { x: s.x + n.x * h, z: s.z + n.z * h }, { x: e.x + n.x * h, z: e.z + n.z * h },
    { x: e.x - n.x * h, z: e.z - n.z * h }, { x: s.x - n.x * h, z: s.z - n.z * h },
  ]
}

/** Препятствия квартиры: куски стен между дверными проёмами и мебель, мешающая телу игрока. */
export function walkObstacles(apt: Apartment, catalog: Catalog): Obstacle[] {
  const out: Obstacle[] = []
  for (const w of Object.values(apt.walls)) {
    const { a, b } = wallEnds(apt, w)
    const len = wallLengthCm(apt, w)
    if (len < 1e-6) continue
    const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
    const at = (s: number): Pt => ({ x: a.x + u.x * s, z: a.z + u.z * s })
    const inside = roomsOfWall(apt, w.id).length > 1
    // Проходимы только двери внутренних стен; входная дверь и окна остаются стеной.
    const gaps = Object.values(apt.openings)
      .filter((o) => o.wallId === w.id && o.kind === 'door' && inside)
      .map((o) => [o.offsetCm, o.offsetCm + o.widthCm] as const)
      .sort((p, q) => p[0] - q[0])
    const h = w.thicknessCm / 2
    let cursor = 0
    let first = true
    const pieces: Array<{ s0: number; s1: number; extA: number; extB: number }> = []
    for (const [g0, g1] of gaps) {
      if (g0 - cursor > 1e-6) pieces.push({ s0: cursor, s1: g0, extA: first ? h : 0, extB: 0 })
      cursor = g1
      first = false
    }
    if (len - cursor > 1e-6) pieces.push({ s0: cursor, s1: len, extA: first ? h : 0, extB: h })
    pieces.forEach((p, i) => out.push({ id: `wall-${w.id}-${i}`, kind: 'wall', corners: bar(at(p.s0), at(p.s1), w.thicknessCm, p.extA, p.extB) }))
  }
  for (const f of Object.values(apt.furniture)) {
    const item = catalog[f.catalogItemId]
    if (!item || item.layer === 'floorCovering') continue
    const e = elevationOf(apt, item, f)
    item.colliders.forEach((c, i) => {
      if (c.yMaxCm + e <= STEP_CM || c.yMinCm + e >= PLAYER_HEIGHT_CM - 5) return // под ногами или над головой
      const off = localToWorld(c.xCm, c.zCm, f.angleDeg)
      out.push({ id: `${f.id}-${i}`, kind: 'furniture', corners: rectCorners({ cx: f.xCm + off.x, cz: f.zCm + off.z, w: c.widthCm, d: c.depthCm, angleDeg: f.angleDeg }) })
    })
  }
  return out
}

interface Push { x: number; z: number }

/** Выталкивание круга радиуса r из выпуклого многоугольника; null, если круг не пересекает его. */
function pushOut(p: Pt, r: number, poly: Pt[]): Push | null {
  // Ближайшая точка границы и знак: внутри ли центр.
  let best = Infinity
  let bx = 0, bz = 0, nx = 0, nz = 0
  let inside = true
  const sign = Math.sign(poly.reduce((s, q, i) => { const n = poly[(i + 1) % poly.length]; return s + (q.x * n.z - n.x * q.z) }, 0)) || 1
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ex = b.x - a.x, ez = b.z - a.z
    const l2 = ex * ex + ez * ez || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2))
    const cx = a.x + ex * t, cz = a.z + ez * t
    const d = Math.hypot(p.x - cx, p.z - cz)
    // Внешняя нормаль ребра.
    const len = Math.sqrt(l2)
    const onx = (ez / len) * sign, onz = (-ex / len) * sign
    if ((p.x - a.x) * onx + (p.z - a.z) * onz > 0) inside = false
    if (d < best) { best = d; bx = cx; bz = cz; nx = onx; nz = onz }
  }
  if (inside) return { x: bx + nx * r - p.x, z: bz + nz * r - p.z }
  if (best >= r) return null
  const k = (r - best) / (best || 1)
  return best < 1e-9 ? { x: nx * r, z: nz * r } : { x: (p.x - bx) * k, z: (p.z - bz) * k }
}

/** Выталкивает круг из всех препятствий (несколько проходов: угол между двумя стенами). */
export function resolveCollisions(pos: Pt, obstacles: Obstacle[], radius = PLAYER_RADIUS_CM): Pt {
  let p = { ...pos }
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const o of obstacles) {
      const push = pushOut(p, radius, o.corners)
      if (push && (Math.abs(push.x) > 1e-6 || Math.abs(push.z) > 1e-6)) { p = { x: p.x + push.x, z: p.z + push.z }; moved = true }
    }
    if (!moved) break
  }
  return p
}

/** Свободно ли место: круг не пересекает препятствий. */
export const isFree = (pos: Pt, obstacles: Obstacle[], radius = PLAYER_RADIUS_CM) => obstacles.every((o) => pushOut(pos, radius, o.corners) === null)

/**
 * Шаг игрока: смещение delta мелкими шагами (не больше 2 см, тоньше стены), после каждого препятствия выталкивают круг:
 * игрок скользит вдоль стены и не проходит сквозь неё даже на большой скорости.
 */
export function stepWalk(pos: Pt, delta: Pt, obstacles: Obstacle[], radius = PLAYER_RADIUS_CM): Pt {
  const dist = Math.hypot(delta.x, delta.z)
  const n = Math.max(1, Math.ceil(dist / 2))
  let p = { ...pos }
  for (let i = 0; i < n; i++) p = resolveCollisions({ x: p.x + delta.x / n, z: p.z + delta.z / n }, obstacles, radius)
  return p
}

/** Комната, в которой стоит игрок (по чистовому контуру); null в дверном проёме и между комнатами. */
export function roomAt(apt: Apartment, pos: Pt): Id | null {
  for (const room of Object.values(apt.rooms)) {
    if (pointsInsideConvex([pos], roomClearPolygon(apt, room), -0.01)) return room.id
  }
  return null
}

/** Начальное положение: центр комнаты, при занятом центре — ближайшее свободное место по спирали. */
export function startPosition(apt: Apartment, roomId: Id, obstacles: Obstacle[]): Pt {
  const poly = roomClearPolygon(apt, apt.rooms[roomId])
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
  if (isFree(c, obstacles) && pointsInsideConvex([c], poly)) return c
  for (let r = 20; r < 600; r += 20) {
    const steps = Math.max(8, Math.round((r * Math.PI * 2) / 20))
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }
      if (pointsInsideConvex([p], poly, -PLAYER_RADIUS_CM) && isFree(p, obstacles)) return p
    }
  }
  return c
}

/** Вектор «вперёд» по углу поворота (рад) в осях плана: yaw 0 — на север (−z), положительный — влево, как rotation.y three.js. */
export const forwardOf = (yaw: number): Pt => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
/** Вектор «вправо». */
export const rightOf = (yaw: number): Pt => ({ x: Math.cos(yaw), z: -Math.sin(yaw) })
