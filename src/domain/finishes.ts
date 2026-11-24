import type { Pt } from '../geometry/polygon'
import { signedArea } from '../geometry/polygon'
import { roomClearPolygon } from './derive'
import { roomsOfWall } from './doors'
import { surfaceKey, type Apartment, type Id, type Issue, type MaterialDefinition } from './types'

/**
 * Отделка стен (SPEC §13, D-24). Поверхность — это «стена + комната» (SurfaceKey): обе стороны
 * общей перегородки независимы. Для пользователя поверхность — сторона комнаты: подряд идущие
 * прямые участки (деление T-примыканием) красятся вместе и имеют сплошной рисунок.
 */

export interface WallSide {
  roomId: Id
  /** Номер стороны в обходе комнаты. */
  index: number
  wallIds: Id[]
  /** Концы чистовой поверхности стороны в порядке обхода комнаты. */
  a: Pt
  b: Pt
  lengthCm: number
  dir: Pt
  /** Нормаль внутрь комнаты. */
  nIn: Pt
  /** Расстояние от начала стороны до начала каждого участка: рисунок обоев идёт непрерывно. */
  startCm: Record<Id, number>
}

const COLLINEAR = 1 - 1e-9

/** Стороны комнаты: максимальные цепочки подряд идущих стен одного направления. */
export function roomSides(apt: Apartment, roomId: Id): WallSide[] {
  const room = apt.rooms[roomId]
  if (!room) throw new Error(`Комната ${roomId} не найдена`)
  const clear = roomClearPolygon(apt, room)
  const orient = Math.sign(signedArea(clear)) || 1
  const n = room.boundary.length
  const seg = room.boundary.map((ref, i) => {
    const a = clear[i]
    const b = clear[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    return { wallId: ref.wallId, a, b, len, dir: { x: (b.x - a.x) / len, z: (b.z - a.z) / len } }
  })
  const same = (p: (typeof seg)[number], q: (typeof seg)[number]) => p.dir.x * q.dir.x + p.dir.z * q.dir.z > COLLINEAR
  // Начало обхода — первый участок, не продолжающий предыдущий: сторона не разрывается на стыке списка.
  let start = seg.findIndex((s, i) => !same(seg[(i + n - 1) % n], s))
  if (start < 0) start = 0
  const sides: WallSide[] = []
  for (let k = 0; k < n; k++) {
    const s = seg[(start + k) % n]
    const last = sides[sides.length - 1]
    const prev = k > 0 ? seg[(start + k - 1) % n] : null
    if (last && prev && same(prev, s)) {
      last.startCm[s.wallId] = last.lengthCm
      last.wallIds.push(s.wallId)
      last.lengthCm += s.len
      last.b = s.b
    } else {
      sides.push({
        roomId, index: sides.length, wallIds: [s.wallId], a: s.a, b: s.b, lengthCm: s.len, dir: s.dir,
        nIn: orient > 0 ? { x: -s.dir.z, z: s.dir.x } : { x: s.dir.z, z: -s.dir.x },
        startCm: { [s.wallId]: 0 },
      })
    }
  }
  return sides
}

/** Название стороны для списка: по положению на плане (ось z смотрит вниз). */
export function sideLabel(side: WallSide): string {
  if (side.nIn.z > 0.5) return 'Верхняя стена'
  if (side.nIn.z < -0.5) return 'Нижняя стена'
  if (side.nIn.x > 0.5) return 'Левая стена'
  if (side.nIn.x < -0.5) return 'Правая стена'
  return `Стена ${side.index + 1}`
}

/** Материал стороны; null, если не назначен (или участки стороны отделаны по-разному). */
export function sideMaterialId(apt: Apartment, side: WallSide): Id | null {
  const ids = side.wallIds.map((w) => apt.surfaceMaterials[surfaceKey(w, side.roomId)] ?? null)
  return ids.every((x) => x === ids[0]) ? ids[0] : null
}

/** Соседние комнаты за стеной стороны (для пояснения «другая сторона не меняется»). */
export function neighbourRooms(apt: Apartment, side: WallSide): Id[] {
  const ids = new Set<Id>()
  for (const w of side.wallIds) for (const r of roomsOfWall(apt, w)) if (r !== side.roomId) ids.add(r)
  return [...ids]
}

/** Назначает материал (или снимает при null) только на стороне этой комнаты: соседняя сторона не меняется. */
export const setSideFinishCommand = (roomId: Id, wallIds: Id[], materialId: Id | null) => (a: Apartment): Apartment => {
  const next = { ...a.surfaceMaterials }
  for (const w of wallIds) {
    const key = surfaceKey(w, roomId)
    if (materialId === null) delete next[key]
    else next[key] = materialId
  }
  return { ...a, surfaceMaterials: next }
}

/** Сколько раз рисунок повторяется на стороне: из физических размеров в см (SPEC §13). */
export const textureRepeats = (lengthCm: number, heightCm: number, tile: { widthCm: number; heightCm: number }) => ({
  across: lengthCm / tile.widthCm,
  up: heightCm / tile.heightCm,
})

/** Проверка: отделка ссылается на известные материалы (подключается к проекту вместе с реестром). */
export const validateSurfaceMaterials = (materials: Record<Id, MaterialDefinition>) => (apt: Apartment): Issue[] => {
  const issues: Issue[] = []
  for (const [key, id] of Object.entries(apt.surfaceMaterials)) {
    if (!materials[id]) issues.push({ code: 'unknown-material', message: `Отделка поверхности ${key}: неизвестный материал «${id}»` })
  }
  return issues
}
