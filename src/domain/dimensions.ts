import { localToWorld, rectCorners } from '../geometry/placement'
import type { Pt } from '../geometry/polygon'
import { nearestOnSegment, obstaclesOf } from './clearance'
import { roomClearPolygon } from './derive'
import { openingFrame } from './doors'
import type { Catalog } from './placement'
import type { Apartment, Id } from './types'

/**
 * Размеры на плане (этап 3 доработок, SPEC D-32): от четырёх сторон предмета, по его осям, до ближайшей стены или
 * соседнего предмета. Только расчёт; рисует план.
 */
export interface DimLine {
  x1: number
  z1: number
  x2: number
  z2: number
  /** Длина, см (округлена до целого). */
  cm: number
  /** Что на конце: стена или другой предмет. */
  to: 'wall' | 'item'
}

/** Пересечение луча (o + t·d, t > 0) с отрезком a–b: расстояние t или null. */
function rayHit(o: Pt, d: Pt, a: Pt, b: Pt): number | null {
  const ex = b.x - a.x, ez = b.z - a.z
  const den = d.x * ez - d.z * ex
  if (Math.abs(den) < 1e-9) return null
  const t = ((a.x - o.x) * ez - (a.z - o.z) * ex) / den
  const u = ((a.x - o.x) * d.z - (a.z - o.z) * d.x) / den
  return t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null
}

export interface DimSubject { itemId: Id; xCm: number; zCm: number; angleDeg: number; selfId: Id | null; roomId: Id }

/** Линии размеров от сторон предмета; отсутствующие (предмет вплотную, ближе 1 см, или нет преграды) не возвращаются. */
export function dimensionLines(apt: Apartment, catalog: Catalog, s: DimSubject): DimLine[] {
  const item = catalog[s.itemId]
  const room = apt.rooms[s.roomId]
  if (!item || !room || item.colliders.length === 0) return []
  const clear = roomClearPolygon(apt, room)
  const others = obstaclesOf(apt, catalog, s.roomId).filter((o) => o.id !== s.selfId)
  const minX = Math.min(...item.colliders.map((c) => c.xCm - c.widthCm / 2)), maxX = Math.max(...item.colliders.map((c) => c.xCm + c.widthCm / 2))
  const minZ = Math.min(...item.colliders.map((c) => c.zCm - c.depthCm / 2)), maxZ = Math.max(...item.colliders.map((c) => c.zCm + c.depthCm / 2))
  const mx = (minX + maxX) / 2, mz = (minZ + maxZ) / 2
  const sides: Array<{ at: [number, number]; dir: [number, number] }> = [
    { at: [maxX, mz], dir: [1, 0] }, { at: [minX, mz], dir: [-1, 0] }, { at: [mx, maxZ], dir: [0, 1] }, { at: [mx, minZ], dir: [0, -1] },
  ]
  const out: DimLine[] = []
  for (const side of sides) {
    const off = localToWorld(side.at[0], side.at[1], s.angleDeg)
    const o = { x: s.xCm + off.x, z: s.zCm + off.z }
    const d = localToWorld(side.dir[0], side.dir[1], s.angleDeg)
    let best: { t: number; to: 'wall' | 'item' } | null = null
    const consider = (pts: Pt[], to: 'wall' | 'item') => {
      for (let i = 0; i < pts.length; i++) {
        const t = rayHit(o, d, pts[i], pts[(i + 1) % pts.length])
        if (t !== null && (!best || t < best.t)) best = { t, to }
      }
    }
    consider(clear, 'wall')
    for (const ob of others) consider(ob.pts, 'item')
    const hit = best as { t: number; to: 'wall' | 'item' } | null
    if (!hit || hit.t < 1) continue
    out.push({ x1: o.x, z1: o.z, x2: o.x + d.x * hit.t, z2: o.z + d.z * hit.t, cm: Math.round(hit.t), to: hit.to })
  }
  return out
}

/** Расстояние от предмета до ближайшей двери комнаты (до края проёма), см; null, если дверей нет. */
export function nearestDoorCm(apt: Apartment, catalog: Catalog, s: DimSubject): { cm: number; doorId: Id } | null {
  const item = catalog[s.itemId]
  const room = apt.rooms[s.roomId]
  if (!item || !room || item.colliders.length === 0) return null
  const c = item.colliders[0]
  const off = localToWorld(c.xCm, c.zCm, s.angleDeg)
  const body = rectCorners({ cx: s.xCm + off.x, cz: s.zCm + off.z, w: c.widthCm, d: c.depthCm, angleDeg: s.angleDeg })
  let best: { cm: number; doorId: Id } | null = null
  for (const o of Object.values(apt.openings)) {
    if (o.kind !== 'door' || !room.boundary.some((b) => b.wallId === o.wallId)) continue
    const f = openingFrame(apt, o, s.roomId)
    let dmin = Infinity
    for (let k = 0; k <= 20; k++) {
      const p = { x: f.p0.x + ((f.p1.x - f.p0.x) * k) / 20, z: f.p0.z + ((f.p1.z - f.p0.z) * k) / 20 }
      for (let i = 0; i < body.length; i++) dmin = Math.min(dmin, nearestOnSegment(p, body[i], body[(i + 1) % body.length]).d)
    }
    if (!best || dmin < best.cm) best = { cm: Math.round(dmin), doorId: o.id }
  }
  return best
}
