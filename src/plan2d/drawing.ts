import { floorSwatchHex } from '../catalog/floors'
import { roomClearPolygon, roomNetAreaM2, wallEnds, wallLengthCm } from '../domain/derive'
import { openingFrame, roomsOfWall } from '../domain/doors'
import type { Apartment, Id } from '../domain/types'
import type { Pt } from '../geometry/polygon'

/**
 * Описание рисунка плана, выведенное из общей модели (SPEC §10.1). Все координаты в см
 * проекта; рисунок хранит только то, что нужно показать, и ничего не пишет в модель.
 */
export interface PlanDrawing {
  rooms: Array<{
    id: Id
    name: string
    polygon: Pt[]
    center: Pt
    areaM2: number
    /** Чистовые размеры по осям x и z (комнаты прямоугольные). */
    widthCm: number
    depthCm: number
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number }
    /** Цвет покрытия пола (D-16); null, если покрытия нет. */
    floorHex: string | null
  }>
  walls: Array<{ id: Id; polygon: Pt[]; lengthCm: number }>
  openings: Array<{
    id: Id
    kind: 'door' | 'window'
    /** Прямоугольник проёма по всей толщине стены (вырез в стене). */
    cut: Pt[]
    /** Только дверь: петля, конец открытой створки, конец закрытой створки, направление дуги. */
    leaf?: { hinge: Pt; open: Pt; closed: Pt; sweep: 0 | 1; radiusCm: number }
  }>
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number }
}

export function planDrawing(apt: Apartment): PlanDrawing {
  const walls: PlanDrawing['walls'] = Object.values(apt.walls).map((w) => {
    const { a, b } = wallEnds(apt, w)
    const len = wallLengthCm(apt, w)
    const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
    const n = { x: -u.z, z: u.x }
    const h = w.thicknessCm / 2
    // Концы продлены на половину толщины: углы заполняются без щелей.
    const s = { x: a.x - u.x * h, z: a.z - u.z * h }
    const e = { x: b.x + u.x * h, z: b.z + u.z * h }
    return {
      id: w.id,
      lengthCm: len,
      polygon: [
        { x: s.x + n.x * h, z: s.z + n.z * h }, { x: e.x + n.x * h, z: e.z + n.z * h },
        { x: e.x - n.x * h, z: e.z - n.z * h }, { x: s.x - n.x * h, z: s.z - n.z * h },
      ],
    }
  })

  const rooms: PlanDrawing['rooms'] = Object.values(apt.rooms).map((r) => {
    const polygon = roomClearPolygon(apt, r)
    const xs = polygon.map((p) => p.x)
    const zs = polygon.map((p) => p.z)
    const bounds = { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) }
    return {
      id: r.id, name: r.name, polygon, areaM2: roomNetAreaM2(apt, r), bounds,
      center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
      widthCm: bounds.maxX - bounds.minX, depthCm: bounds.maxZ - bounds.minZ,
      floorHex: floorSwatchHex(apt.floorCoverings[r.id]),
    }
  })

  const openings: PlanDrawing['openings'] = []
  for (const o of Object.values(apt.openings)) {
    const wall = apt.walls[o.wallId]
    const roomId = roomsOfWall(apt, o.wallId)[0]
    if (!wall || !roomId) continue
    const f = openingFrame(apt, o, roomId)
    const h = wall.thicknessCm / 2
    const cut = [
      { x: f.p0.x - f.nIn.x * 2 * h, z: f.p0.z - f.nIn.z * 2 * h }, f.p0, f.p1,
      { x: f.p1.x - f.nIn.x * 2 * h, z: f.p1.z - f.nIn.z * 2 * h },
    ]
    const item: PlanDrawing['openings'][number] = { id: o.id, kind: o.kind, cut }
    if (o.kind === 'door' && o.swingRoomId) {
      const g = openingFrame(apt, o, o.swingRoomId)
      const atStart = o.hinge !== 'end'
      const hinge = atStart ? g.p0 : g.p1
      const along = atStart ? g.u : { x: -g.u.x, z: -g.u.z }
      const open = { x: hinge.x + g.nIn.x * o.widthCm, z: hinge.z + g.nIn.z * o.widthCm }
      const closed = { x: hinge.x + along.x * o.widthCm, z: hinge.z + along.z * o.widthCm }
      // Ось z смотрит вниз: положительное векторное произведение — по часовой стрелке на экране.
      const sweep = g.nIn.x * along.z - g.nIn.z * along.x > 0 ? 1 : 0
      item.leaf = { hinge, open, closed, sweep, radiusCm: o.widthCm }
    }
    openings.push(item)
  }

  const all = [...rooms.map((r) => r.bounds), ...walls.flatMap((w) => [boundsOf(w.polygon)])]
  const bounds = {
    minX: Math.min(...all.map((b) => b.minX)), minZ: Math.min(...all.map((b) => b.minZ)),
    maxX: Math.max(...all.map((b) => b.maxX)), maxZ: Math.max(...all.map((b) => b.maxZ)),
  }
  return { rooms, walls, openings, bounds }
}

function boundsOf(p: Pt[]) {
  const xs = p.map((q) => q.x)
  const zs = p.map((q) => q.z)
  return { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) }
}
