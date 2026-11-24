import { roomClearPolygon } from '../domain/derive'
import { roomSides } from '../domain/finishes'
import { openingFrame } from '../domain/doors'
import type { Apartment, Id } from '../domain/types'
import { signedArea, type Pt } from '../geometry/polygon'

/**
 * Геометрия одной комнаты для 3D (SPEC §10.2), выведенная из общей модели: чистовой контур,
 * поверхности стен с реальными отверстиями под окна и двери. Чистые функции в сантиметрах,
 * без three.js: их проверяют юнит-тесты, сцена только превращает результат в сетки.
 */

/** Прямоугольник на поверхности стены: s — вдоль стены от её начала в обходе комнаты, y — высота. */
export interface Panel { s0: number; s1: number; y0: number; y1: number }

export interface Hole extends Panel { openingId: Id; kind: 'door' | 'window' }

export interface WallFace {
  wallId: Id
  /** Концы чистовой поверхности стены в порядке обхода комнаты. */
  a: Pt
  b: Pt
  lengthCm: number
  /** Единичное направление вдоль стены (от a к b) и нормаль внутрь комнаты. */
  dir: Pt
  nIn: Pt
  thicknessCm: number
  /** Сторона комнаты (цепочка стен одного направления), к которой относится участок, и его начало на ней. */
  sideIndex: number
  sideStartCm: number
  holes: Hole[]
  /** Куски стены вокруг отверстий: вместе с отверстиями дают всю стену без пропусков и наложений. */
  panels: Panel[]
}

export interface RoomFaces { floor: Pt[]; heightCm: number; faces: WallFace[] }

const EPS = 1e-6

/** Разбивает стену длиной len и высотой h на прямоугольники, обходя отверстия. */
export function wallPanels(len: number, h: number, holes: Panel[]): Panel[] {
  const sorted = [...holes]
    .map((x) => ({ s0: Math.max(0, x.s0), s1: Math.min(len, x.s1), y0: Math.max(0, x.y0), y1: Math.min(h, x.y1) }))
    .filter((x) => x.s1 - x.s0 > EPS && x.y1 - x.y0 > EPS)
    .sort((p, q) => p.s0 - q.s0)
  const out: Panel[] = []
  let cursor = 0
  for (const x of sorted) {
    if (x.s0 - cursor > EPS) out.push({ s0: cursor, s1: x.s0, y0: 0, y1: h })
    if (x.y0 > EPS) out.push({ s0: x.s0, s1: x.s1, y0: 0, y1: x.y0 })
    if (h - x.y1 > EPS) out.push({ s0: x.s0, s1: x.s1, y0: x.y1, y1: h })
    cursor = Math.max(cursor, x.s1)
  }
  if (len - cursor > EPS) out.push({ s0: cursor, s1: len, y0: 0, y1: h })
  return out
}

export function roomFaces(apt: Apartment, roomId: Id): RoomFaces {
  const room = apt.rooms[roomId]
  if (!room) throw new Error(`Комната ${roomId} не найдена`)
  const clear = roomClearPolygon(apt, room)
  const orient = Math.sign(signedArea(clear)) || 1
  const h = apt.ceilingHeightCm
  const sides = roomSides(apt, roomId)
  const faces = room.boundary.map((ref, i): WallFace => {
    const side = sides.find((s) => s.wallIds.includes(ref.wallId))!
    const a = clear[i]
    const b = clear[(i + 1) % clear.length]
    const lengthCm = Math.hypot(b.x - a.x, b.z - a.z)
    const dir = { x: (b.x - a.x) / lengthCm, z: (b.z - a.z) / lengthCm }
    const nIn = orient > 0 ? { x: -dir.z, z: dir.x } : { x: dir.z, z: -dir.x }
    const holes: Hole[] = []
    for (const o of Object.values(apt.openings)) {
      if (o.wallId !== ref.wallId) continue
      const f = openingFrame(apt, o, roomId)
      const s = [f.p0, f.p1].map((p) => (p.x - a.x) * dir.x + (p.z - a.z) * dir.z)
      holes.push({ openingId: o.id, kind: o.kind, s0: Math.min(...s), s1: Math.max(...s), y0: o.sillCm, y1: o.sillCm + o.heightCm })
    }
    return { wallId: ref.wallId, a, b, lengthCm, dir, nIn, thicknessCm: apt.walls[ref.wallId].thicknessCm, sideIndex: side.index, sideStartCm: side.startCm[ref.wallId], holes, panels: wallPanels(lengthCm, h, holes) }
  })
  return { floor: clear, heightCm: h, faces }
}

export const panelArea = (p: Panel) => (p.s1 - p.s0) * (p.y1 - p.y0)

export interface InitialView { target: [number, number, number]; position: [number, number, number] }

/** Центр комнаты по чистовому контуру. */
export function roomCenter(apt: Apartment, roomId: Id): Pt {
  const poly = roomClearPolygon(apt, apt.rooms[roomId])
  const xs = poly.map((p) => p.x)
  const zs = poly.map((p) => p.z)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
}

/**
 * Начальный вид: камера над комнатой с противоположной от двери стороны, дверная стена обращена
 * к камере и видна целиком (SPEC §10.2). Дверь, через которую вошли, имеет приоритет.
 */
export function initialView(apt: Apartment, roomId: Id, viaDoorId?: Id | null): InitialView {
  const { faces } = roomFaces(apt, roomId)
  const c = roomCenter(apt, roomId)
  const doors = faces.flatMap((f) => f.holes.filter((x) => x.kind === 'door').map((x) => ({ f, x })))
  const pick = doors.find((d) => d.x.openingId === viaDoorId) ?? doors[0]
  let dirX = 0, dirZ = 1
  let extent = 300
  const poly = roomClearPolygon(apt, apt.rooms[roomId])
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
  extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  if (pick) {
    const s = (pick.x.s0 + pick.x.s1) / 2
    const mid = { x: pick.f.a.x + pick.f.dir.x * s, z: pick.f.a.z + pick.f.dir.z * s }
    const len = Math.hypot(mid.x - c.x, mid.z - c.z) || 1
    dirX = (mid.x - c.x) / len
    dirZ = (mid.z - c.z) / len
  }
  // Расстояние подобрано так, чтобы вся комната с запасом помещалась в кадр при угле обзора 45°.
  const back = extent * 1.05
  return {
    target: [c.x, 60, c.z],
    position: [c.x - dirX * back, Math.max(apt.ceilingHeightCm, extent * 1.0), c.z - dirZ * back],
  }
}

/** Стена скрыта, когда камера по другую сторону её плоскости: смотрит на стену снаружи. */
export function isFaceHidden(face: WallFace, camera: { x: number; z: number }): boolean {
  return (camera.x - face.a.x) * face.nIn.x + (camera.z - face.a.z) * face.nIn.z < 0
}
