import { offsetPolygon, signedArea, type Pt } from '../geometry/polygon'
import { cm2ToM2 } from '../geometry/units'
import type { Apartment, Id, Room, Wall } from './types'

export function wallEnds(apt: Apartment, wall: Wall): { a: Pt; b: Pt } {
  const a = apt.vertices[wall.startVertexId]
  const b = apt.vertices[wall.endVertexId]
  return { a: { x: a.xCm, z: a.zCm }, b: { x: b.xCm, z: b.zCm } }
}

export function wallLengthCm(apt: Apartment, wall: Wall): number {
  const { a, b } = wallEnds(apt, wall)
  return Math.hypot(b.x - a.x, b.z - a.z)
}

/** Многоугольник по осям стен комнаты, в порядке обхода границы. */
export function roomAxisPolygon(apt: Apartment, room: Room): { pts: Pt[]; thickness: number[] } {
  const pts: Pt[] = []
  const thickness: number[] = []
  for (const ref of room.boundary) {
    const wall = apt.walls[ref.wallId]
    const { a, b } = wallEnds(apt, wall)
    pts.push(ref.reversed ? b : a)
    thickness.push(wall.thicknessCm)
  }
  return { pts, thickness }
}

/** Чистовой контур комнаты: расстояния между внутренними поверхностями стен (SPEC §3.4). */
export function roomClearPolygon(apt: Apartment, room: Room): Pt[] {
  const { pts, thickness } = roomAxisPolygon(apt, room)
  return offsetPolygon(pts, thickness.map((t) => t / 2))
}

export function roomNetAreaM2(apt: Apartment, room: Room): number {
  return cm2ToM2(Math.abs(signedArea(roomClearPolygon(apt, room))))
}

/** Сумма чистых площадей помещений: это значение используется при подборе схемы. */
export function apartmentNetAreaM2(apt: Apartment): number {
  return Object.values(apt.rooms).reduce((s, r) => s + roomNetAreaM2(apt, r), 0)
}

/**
 * Площадь по внешнему контуру (со стенами). Внешние стены — те, что входят в границу
 * ровно одной комнаты; их оси образуют замкнутый контур, который сдвигается наружу
 * на половину толщины.
 */
export function apartmentOuterAreaM2(apt: Apartment): number {
  const uses = new Map<Id, number>()
  for (const room of Object.values(apt.rooms)) {
    for (const ref of room.boundary) uses.set(ref.wallId, (uses.get(ref.wallId) ?? 0) + 1)
  }
  type Edge = { from: Id; to: Id; thickness: number }
  const byFrom = new Map<Id, Edge>()
  for (const room of Object.values(apt.rooms)) {
    for (const ref of room.boundary) {
      if (uses.get(ref.wallId) !== 1) continue
      const w = apt.walls[ref.wallId]
      const from = ref.reversed ? w.endVertexId : w.startVertexId
      const to = ref.reversed ? w.startVertexId : w.endVertexId
      byFrom.set(from, { from, to, thickness: w.thicknessCm })
    }
  }
  let total = 0
  const seen = new Set<Id>()
  for (const start of byFrom.keys()) {
    if (seen.has(start)) continue
    const pts: Pt[] = []
    const thickness: number[] = []
    let cur = start
    while (!seen.has(cur)) {
      seen.add(cur)
      const e = byFrom.get(cur)
      if (!e) throw new Error('Внешний контур квартиры не замкнут')
      const v = apt.vertices[cur]
      pts.push({ x: v.xCm, z: v.zCm })
      thickness.push(e.thickness)
      cur = e.to
    }
    if (cur !== start) throw new Error('Внешний контур квартиры не замкнут')
    const outer = offsetPolygon(pts, thickness.map((t) => -t / 2))
    total += Math.abs(signedArea(outer))
  }
  return cm2ToM2(total)
}
