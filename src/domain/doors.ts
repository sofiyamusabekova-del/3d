import { signedArea, type Pt } from '../geometry/polygon'
import { roomAxisPolygon, wallEnds, wallLengthCm } from './derive'
import type { Apartment, Id, Opening } from './types'

/** Глубина запрещённой зоны перед дверным проёмом, см (SPEC §11.3). */
export const DOOR_FRONT_DEPTH_CM = 30
/**
 * Число сегментов дуги сектора открывания. Многоугольник вписан в дугу: концы дуги точные,
 * недобор у дуги не больше 0,003 см, то есть меньше допуска EPS_CM; касание остаётся допустимым.
 */
const SECTOR_SEGMENTS = 96

/** Комнаты, в границу которых входит стена (одна для внешней, две для общей). */
export function roomsOfWall(apt: Apartment, wallId: Id): Id[] {
  return Object.values(apt.rooms).filter((r) => r.boundary.some((b) => b.wallId === wallId)).map((r) => r.id)
}

/** Рамка проёма со стороны комнаты: точки на чистовой поверхности стены и нормаль внутрь комнаты. */
export function openingFrame(apt: Apartment, o: Opening, roomId: Id) {
  const wall = apt.walls[o.wallId]
  const room = apt.rooms[roomId]
  const ref = room.boundary.find((b) => b.wallId === o.wallId)
  if (!ref) throw new Error(`Стена ${o.wallId} не входит в границу комнаты ${roomId}`)
  const { a, b } = wallEnds(apt, wall)
  const len = wallLengthCm(apt, wall)
  const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
  const orient = Math.sign(signedArea(roomAxisPolygon(apt, room).pts)) || 1
  const travel = ref.reversed ? -1 : 1
  // Внутрь комнаты: слева от направления обхода при положительной ориентации.
  const nIn = { x: -u.z * travel * orient, z: u.x * travel * orient }
  const half = wall.thicknessCm / 2
  const at = (s: number): Pt => ({ x: a.x + u.x * s + nIn.x * half, z: a.z + u.z * s + nIn.z * half })
  return { u, nIn, p0: at(o.offsetCm), p1: at(o.offsetCm + o.widthCm) }
}

const add = (p: Pt, d: Pt, k: number): Pt => ({ x: p.x + d.x * k, z: p.z + d.z * k })

/** Четверть круга с центром в петле двери от направления `from` к направлению `to`. */
function sector(center: Pt, from: Pt, to: Pt, r: number): Pt[] {
  const R = r
  const pts = [center]
  for (let i = 0; i <= SECTOR_SEGMENTS; i++) {
    const t = (i / SECTOR_SEGMENTS) * (Math.PI / 2)
    const d = { x: from.x * Math.cos(t) + to.x * Math.sin(t), z: from.z * Math.cos(t) + to.z * Math.sin(t) }
    pts.push(add(center, d, R))
  }
  return pts
}

/**
 * Запрещённые для мебели зоны двери со стороны комнаты roomId: прямоугольник глубиной 30 см
 * перед проёмом и, если створка открывается в эту комнату, сектор в четверть круга
 * радиусом в ширину двери (D-06). Для окон зон нет.
 */
export function doorZones(apt: Apartment, door: Opening, roomId: Id): Pt[][] {
  if (door.kind !== 'door') return []
  const f = openingFrame(apt, door, roomId)
  const zones: Pt[][] = [[f.p0, f.p1, add(f.p1, f.nIn, DOOR_FRONT_DEPTH_CM), add(f.p0, f.nIn, DOOR_FRONT_DEPTH_CM)]]
  if (door.swingRoomId === roomId) {
    const hingeAtStart = door.hinge !== 'end'
    const hinge = hingeAtStart ? f.p0 : f.p1
    const along = hingeAtStart ? f.u : { x: -f.u.x, z: -f.u.z }
    zones.push(sector(hinge, along, f.nIn, door.widthCm))
  }
  return zones
}

/** Помещение, в которое переводит дверь из комнаты fromRoomId; null — дверь наружу. */
export function doorTarget(apt: Apartment, doorId: Id, fromRoomId: Id): Id | null {
  const door = apt.openings[doorId]
  if (!door || door.kind !== 'door') return null
  const rooms = roomsOfWall(apt, door.wallId)
  if (!rooms.includes(fromRoomId)) return null
  return rooms.find((r) => r !== fromRoomId) ?? null
}

/** Граф проходов: рёбра — двери на общих стенах. Входы — комнаты с дверью на внешней стене. */
export function passageGraph(apt: Apartment): { edges: Array<[Id, Id, Id]>; entrances: Id[] } {
  const edges: Array<[Id, Id, Id]> = []
  const entrances = new Set<Id>()
  for (const o of Object.values(apt.openings)) {
    if (o.kind !== 'door') continue
    const rooms = roomsOfWall(apt, o.wallId)
    if (rooms.length === 2) edges.push([rooms[0], rooms[1], o.id])
    else if (rooms.length === 1) entrances.add(rooms[0])
  }
  return { edges, entrances: [...entrances] }
}

/** Комнаты, в которые нельзя попасть от входа через двери. Без входной двери недостижимы все. */
export function unreachableRooms(apt: Apartment): Id[] {
  const { edges, entrances } = passageGraph(apt)
  const seen = new Set<Id>(entrances)
  const queue = [...entrances]
  while (queue.length) {
    const cur = queue.pop()!
    for (const [a, b] of edges) {
      const next = a === cur ? b : b === cur ? a : null
      if (next && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return Object.keys(apt.rooms).filter((id) => !seen.has(id))
}
