import { EPS_CM, type Pt } from '../geometry/polygon'
import { cm2ToM2 } from '../geometry/units'
import { apartmentNetAreaM2, apartmentOuterAreaM2, roomAxisPolygon, roomClearPolygon, wallLengthCm } from './derive'
import { roomsOfWall } from './doors'
import { validateFurniturePlacement, type Catalog } from './placement'
import type { Apartment, Id, Issue, Opening, Room } from './types'
import { validateApartment } from './validate'

/**
 * Изменение общей геометрии квартиры (SPEC §9, D-03): сдвиг стены и высота потолка.
 * Контракт: построить кандидата → найти затронутые помещения → проверить → показать
 * последствия → применить целиком (через общую команду проекта) либо ничего не менять.
 * Здесь только чистые функции: состояние проекта они не трогают.
 */

/** Пределы SPEC §3.2. */
export const ROOM_SIZE_MIN_CM = 80
export const ROOM_SIZE_MAX_CM = 1500
export const CEILING_MIN_CM = 220
export const CEILING_MAX_CM = 400

type Axis = 'x' | 'z'
const coordKey = (axis: Axis) => (axis === 'x' ? 'xCm' : 'zCm') as 'xCm' | 'zCm'
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Прямая стена целиком: все стены, лежащие на одной линии и соединённые вершинами. */
export interface WallLine {
  /** Координата, которая меняется при сдвиге: у вертикальной стены (x = const) это 'x'. */
  axis: Axis
  coordCm: number
  wallIds: Id[]
  vertexIds: Id[]
  /** Хотя бы одна стена линии принадлежит ровно одной комнате: это внешний контур. */
  exterior: boolean
}

function wallAxis(apt: Apartment, wallId: Id): Axis | null {
  const w = apt.walls[wallId]
  const a = apt.vertices[w.startVertexId]
  const b = apt.vertices[w.endVertexId]
  if (Math.abs(a.xCm - b.xCm) < EPS_CM) return 'x'
  if (Math.abs(a.zCm - b.zCm) < EPS_CM) return 'z'
  return null
}

export function wallLine(apt: Apartment, wallId: Id): WallLine {
  const wall = apt.walls[wallId]
  if (!wall) throw new Error(`Стена ${wallId} не найдена`)
  const axis = wallAxis(apt, wallId)
  if (!axis) throw new Error('Наклонную стену двигать нельзя: версия 1 поддерживает только вертикальные и горизонтальные стены')
  const key = coordKey(axis)
  const coord = apt.vertices[wall.startVertexId][key]
  const wallIds = new Set<Id>([wallId])
  const vertexIds = new Set<Id>()
  const queue = [wallId]
  while (queue.length > 0) {
    const cur = apt.walls[queue.pop()!]
    for (const vid of [cur.startVertexId, cur.endVertexId]) {
      vertexIds.add(vid)
      for (const other of Object.values(apt.walls)) {
        if (wallIds.has(other.id)) continue
        if (other.startVertexId !== vid && other.endVertexId !== vid) continue
        if (wallAxis(apt, other.id) !== axis || Math.abs(apt.vertices[other.startVertexId][key] - coord) > EPS_CM) continue
        wallIds.add(other.id)
        queue.push(other.id)
      }
    }
  }
  const exterior = [...wallIds].some((id) => roomsOfWall(apt, id).length === 1)
  return { axis, coordCm: coord, wallIds: [...wallIds], vertexIds: [...vertexIds], exterior }
}

export interface RoomBox { widthCm: number; depthCm: number; areaM2: number }

export function roomBox(apt: Apartment, room: Room): RoomBox {
  const poly = roomClearPolygon(apt, room)
  const xs = poly.map((p) => p.x)
  const zs = poly.map((p) => p.z)
  const widthCm = Math.max(...xs) - Math.min(...xs)
  const depthCm = Math.max(...zs) - Math.min(...zs)
  // Комнаты прямоугольные (D-01): площадь = ширина × длина.
  return { widthCm, depthCm, areaM2: cm2ToM2(widthCm * depthCm) }
}

/** Комната, примыкающая к линии стены, и то, как её размер зависит от сдвига. */
export interface AdjacentRoom {
  roomId: Id
  name: string
  /** Какой размер комнаты меняется сдвигом: по оси x это ширина, по z — длина. */
  dimension: 'width' | 'depth'
  sizeCm: number
  /** +1: сдвиг на +d увеличивает размер (стена — дальний край комнаты); −1: уменьшает. */
  sign: 1 | -1
}

export interface WallInfo {
  wallId: Id
  line: WallLine
  lengthCm: number
  thicknessCm: number
  rooms: AdjacentRoom[]
}

export function wallInfo(apt: Apartment, wallId: Id): WallInfo {
  const line = wallLine(apt, wallId)
  const key = coordKey(line.axis)
  const rooms: AdjacentRoom[] = []
  const seen = new Set<Id>()
  for (const id of line.wallIds) {
    for (const roomId of roomsOfWall(apt, id)) {
      if (seen.has(roomId)) continue
      seen.add(roomId)
      const room = apt.rooms[roomId]
      const vals = roomAxisPolygon(apt, room).pts.map((p) => (key === 'xCm' ? p.x : p.z))
      const sign = Math.abs(Math.max(...vals) - line.coordCm) < EPS_CM ? 1 : Math.abs(Math.min(...vals) - line.coordCm) < EPS_CM ? -1 : 0
      if (sign === 0) continue
      const box = roomBox(apt, room)
      rooms.push({ roomId, name: room.name, dimension: line.axis === 'x' ? 'width' : 'depth', sizeCm: line.axis === 'x' ? box.widthCm : box.depthCm, sign })
    }
  }
  return { wallId, line, lengthCm: wallLengthCm(apt, apt.walls[wallId]), thicknessCm: apt.walls[wallId].thicknessCm, rooms }
}

/** Сдвиг стены, при котором выбранная комната получит заданный размер (противоположная стена остаётся на месте). */
export const deltaForRoomSize = (room: AdjacentRoom, sizeCm: number): number => (sizeCm - room.sizeCm) * room.sign

export interface RoomChange { roomId: Id; name: string; before: RoomBox; after: RoomBox }

export interface WallMoveProposal {
  ok: boolean
  wallId: Id
  deltaCm: number
  exterior: boolean
  /** Кандидат есть только у допустимого изменения: недопустимую геометрию рисовать нельзя. */
  candidate: Apartment | null
  affected: RoomChange[]
  before: { netM2: number; outerM2: number }
  after: { netM2: number; outerM2: number } | null
  issues: Issue[]
}

const kindName = (o: Opening) => (o.kind === 'door' ? 'Дверь' : 'Окно')
const wallRoomsLabel = (apt: Apartment, wallId: Id) => {
  const names = roomsOfWall(apt, wallId).map((id) => `«${apt.rooms[id].name}»`)
  return names.length > 0 ? names.join(' / ') : 'вне комнат'
}

/** Заменяет технические id в сообщениях на понятные названия комнат и проёмов (SPEC §9). */
export function explainIssues(apt: Apartment, issues: Issue[]): Issue[] {
  return issues.map((issue) => {
    const o = issue.objectId ? apt.openings[issue.objectId] : undefined
    const label = o ? `${kindName(o)} в стене комнаты ${wallRoomsLabel(apt, o.wallId)}` : ''
    switch (issue.code) {
      case 'opening-out-of-wall':
        if (o) return { ...issue, message: `${label}: стена стала короче проёма (стена ${Math.round(wallLengthCm(apt, apt.walls[o.wallId]))} см, проём ${o.widthCm} см)` }
        break
      case 'opening-too-tall':
        if (o) return { ...issue, message: `${label}: верх проёма (${o.sillCm + o.heightCm} см) выше потолка (${apt.ceilingHeightCm} см)` }
        break
      case 'bad-number':
        if (o && o.offsetCm < 0) return { ...issue, message: `${label}: после сдвига стена не доходит до проёма, проём остался бы за её краем` }
        break
      case 'zero-length':
        return { ...issue, message: 'Сдвиг слишком велик: одна из стен схлопывается в точку' }
    }
    return issue
  })
}

const FURNITURE_REASON: Record<string, string> = {
  'outside-room': 'выходит за стену',
  'door-zone': 'оказывается в зоне двери',
  'opening-conflict': 'закрывает проём',
  overlap: 'пересекается с другим предметом',
  'bad-support': 'теряет опору у стены',
}

export function furnitureIssues(apt: Apartment, catalog: Catalog): Issue[] {
  return validateFurniturePlacement(catalog)(apt).map((i) => {
    const f = apt.furniture[i.objectId ?? '']
    const room = f ? apt.rooms[f.roomId] : undefined
    const item = f ? catalog[f.catalogItemId] : undefined
    if (!f || !room || !item) return i
    return { ...i, message: `В комнате «${room.name}» предмет «${item.name}» ${FURNITURE_REASON[i.code] ?? 'стоит недопустимо'}` }
  })
}

/** Перепривязывает проёмы стен, у которых сместился конец: проём остаётся на прежнем месте плана (SPEC §9). */
function reanchorOpenings(apt: Apartment, vertices: Apartment['vertices'], line: WallLine): Apartment['openings'] {
  const moved = new Set(line.vertexIds)
  const openings = { ...apt.openings }
  for (const o of Object.values(apt.openings)) {
    const w = apt.walls[o.wallId]
    if (!w || line.wallIds.includes(w.id)) continue // стены линии едут поперёк себя: смещения вдоль неё те же
    if (!moved.has(w.startVertexId) && !moved.has(w.endVertexId)) continue
    const a = apt.vertices[w.startVertexId], b = apt.vertices[w.endVertexId]
    const a2 = vertices[w.startVertexId], b2 = vertices[w.endVertexId]
    const len = Math.hypot(b.xCm - a.xCm, b.zCm - a.zCm)
    const len2 = Math.hypot(b2.xCm - a2.xCm, b2.zCm - a2.zCm)
    if (len < EPS_CM || len2 < EPS_CM) continue // нулевую длину отклонит проверка
    const p: Pt = { x: a.xCm + ((b.xCm - a.xCm) / len) * o.offsetCm, z: a.zCm + ((b.zCm - a.zCm) / len) * o.offsetCm }
    const offset = (p.x - a2.xCm) * ((b2.xCm - a2.xCm) / len2) + (p.z - a2.zCm) * ((b2.zCm - a2.zCm) / len2)
    openings[o.id] = { ...o, offsetCm: round3(offset) }
  }
  return openings
}

const areas = (apt: Apartment) => ({ netM2: apartmentNetAreaM2(apt), outerM2: apartmentOuterAreaM2(apt) })

/**
 * Сдвиг выбранной стены (вместе со всей прямой линией) на deltaCm по нормали; противоположные
 * стены комнат остаются на месте. Соседние помещения сами не пересчитываются: меняются
 * только комнаты, к которым линия примыкает, и их перегородки на концах линии.
 */
export function proposeWallMove(apt: Apartment, wallId: Id, deltaCm: number, opts: { catalog?: Catalog } = {}): WallMoveProposal {
  const base = { wallId, deltaCm, exterior: false, candidate: null, affected: [] as RoomChange[], after: null }
  let before: WallMoveProposal['before']
  try {
    before = areas(apt)
  } catch {
    return { ...base, ok: false, before: { netM2: 0, outerM2: 0 }, issues: [{ code: 'build-failed', message: 'Квартира в недопустимом состоянии' }] }
  }
  const fail = (issues: Issue[], exterior = false): WallMoveProposal => ({ ...base, exterior, ok: false, before, issues })
  if (!Number.isFinite(deltaCm)) return fail([{ code: 'bad-number', message: 'Сдвиг должен быть числом в сантиметрах' }])

  let line: WallLine
  try {
    line = wallLine(apt, wallId)
  } catch (e) {
    return fail([{ code: 'bad-wall', message: (e as Error).message, objectId: wallId }])
  }
  if (Math.abs(deltaCm) < EPS_CM) return { ...base, ok: true, exterior: line.exterior, candidate: apt, before, after: before, issues: [] }

  const key = coordKey(line.axis)
  const vertices = { ...apt.vertices }
  for (const id of line.vertexIds) vertices[id] = { ...vertices[id], [key]: round3(line.coordCm + deltaCm) }
  const candidate: Apartment = { ...apt, vertices, openings: reanchorOpenings(apt, vertices, line) }

  try {
    const structural = validateApartment(candidate)
    if (structural.length > 0) return fail(explainIssues(candidate, structural), line.exterior)

    const affected: RoomChange[] = []
    const issues: Issue[] = []
    for (const room of Object.values(apt.rooms)) {
      const b = roomBox(apt, room)
      const a = roomBox(candidate, room)
      if (Math.abs(a.widthCm - b.widthCm) < EPS_CM && Math.abs(a.depthCm - b.depthCm) < EPS_CM) continue
      affected.push({ roomId: room.id, name: room.name, before: b, after: a })
      for (const [label, size] of [['ширина', a.widthCm], ['длина', a.depthCm]] as const) {
        if (size < ROOM_SIZE_MIN_CM - EPS_CM || size > ROOM_SIZE_MAX_CM + EPS_CM) {
          issues.push({ code: 'room-size', message: `Комната «${room.name}»: ${label} ${Math.round(size)} см вне допустимых ${ROOM_SIZE_MIN_CM}–${ROOM_SIZE_MAX_CM} см`, objectId: room.id })
        }
      }
    }
    if (issues.length === 0 && opts.catalog) issues.push(...furnitureIssues(candidate, opts.catalog))
    if (issues.length > 0) return fail(issues, line.exterior)
    return { ...base, ok: true, exterior: line.exterior, candidate, affected, before, after: areas(candidate), issues: [] }
  } catch (e) {
    return fail([{ code: 'build-failed', message: `Изменение не построено: ${(e as Error).message}` }], line.exterior)
  }
}

export interface CeilingProposal { ok: boolean; candidate: Apartment | null; issues: Issue[] }

/** Высота потолка одна на всю квартиру (D-04); проёмы выше потолка блокируют изменение. */
export function proposeCeilingHeight(apt: Apartment, heightCm: number): CeilingProposal {
  if (!Number.isFinite(heightCm)) return { ok: false, candidate: null, issues: [{ code: 'bad-number', message: 'Высота потолка должна быть числом в сантиметрах' }] }
  if (heightCm < CEILING_MIN_CM || heightCm > CEILING_MAX_CM) {
    return { ok: false, candidate: null, issues: [{ code: 'ceiling-range', message: `Высота потолка ${Math.round(heightCm)} см вне допустимых ${CEILING_MIN_CM}–${CEILING_MAX_CM} см` }] }
  }
  if (heightCm === apt.ceilingHeightCm) return { ok: true, candidate: apt, issues: [] }
  const candidate: Apartment = { ...apt, ceilingHeightCm: heightCm }
  const issues = explainIssues(candidate, validateApartment(candidate))
  return issues.length > 0 ? { ok: false, candidate: null, issues } : { ok: true, candidate, issues: [] }
}
