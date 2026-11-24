import { EPS_CM } from '../geometry/polygon'
import { wallEnds, wallLengthCm } from './derive'
import { roomsOfWall } from './doors'
import { furnitureIssues } from './geometryEdit'
import type { Catalog } from './placement'
import type { Apartment, Id, Issue, Opening } from './types'
import { validateApartment } from './validate'

/**
 * Правка окон и дверей (SPEC §9, D-04, D-21): положение вдоль стены, ширина, высота,
 * для двери ещё сторона петель и комната открывания. Перенос на другую стену, смена вида
 * проёма, добавление и удаление в первую версию не входят. Только чистые функции:
 * кандидат строится целиком, проверяется и либо применяется командой проекта, либо отбрасывается.
 */

/** Пределы размеров проёмов (D-21), см. */
export const OPENING_LIMITS = {
  door: { width: [60, 120], height: [190, 250] },
  window: { width: [40, 300], height: [40, 250] },
} as const

const round3 = (n: number) => Math.round(n * 1000) / 1000
const kindName = (o: Opening) => (o.kind === 'door' ? 'Дверь' : 'Окно')

/** Сколько стена с обоих концов занята перпендикулярными стенами: половина их толщины. */
function endInsets(apt: Apartment, wallId: Id): { start: number; end: number } {
  const w = apt.walls[wallId]
  const { a, b } = wallEnds(apt, w)
  const len = wallLengthCm(apt, w)
  const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
  const at = (vertexId: Id) => {
    let inset = 0
    for (const other of Object.values(apt.walls)) {
      if (other.id === wallId) continue
      if (other.startVertexId !== vertexId && other.endVertexId !== vertexId) continue
      const e = wallEnds(apt, other)
      const l = wallLengthCm(apt, other)
      if (l < EPS_CM) continue
      const cross = Math.abs(u.x * ((e.b.z - e.a.z) / l) - u.z * ((e.b.x - e.a.x) / l))
      if (cross > 0.5) inset = Math.max(inset, other.thicknessCm / 2)
    }
    return inset
  }
  return { start: at(w.startVertexId), end: at(w.endVertexId) }
}

export interface OpeningInfo {
  openingId: Id
  opening: Opening
  rooms: Array<{ id: Id; name: string }>
  wallLengthCm: number
  /** Чистая длина стены между перпендикулярными стенами, где можно ставить проём. */
  clearSpanCm: number
  /** От какого угла считается отступ: левого у горизонтальной стены, верхнего у вертикальной. */
  refCorner: 'left' | 'top'
  /** Чистое расстояние от этого угла до ближнего края проёма. */
  fromRefCm: number
  /** Чистое расстояние до противоположного угла. */
  fromOtherCm: number
}

function layout(apt: Apartment, o: Opening) {
  const wall = apt.walls[o.wallId]
  const { a, b } = wallEnds(apt, wall)
  const len = wallLengthCm(apt, wall)
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)
  const refIsStart = horizontal ? a.x <= b.x : a.z <= b.z
  const ins = endInsets(apt, o.wallId)
  return { len, horizontal, refIsStart, ins }
}

/** Отступ от опорного угла → отступ модели вдоль оси стены от её начала. */
export function offsetFromRef(apt: Apartment, o: Opening, fromRefCm: number, widthCm = o.widthCm): number {
  const { len, refIsStart, ins } = layout(apt, o)
  return round3(refIsStart ? fromRefCm + ins.start : len - widthCm - ins.end - fromRefCm)
}

export function openingInfo(apt: Apartment, openingId: Id): OpeningInfo {
  const o = apt.openings[openingId]
  if (!o || !apt.walls[o.wallId]) throw new Error(`Проём ${openingId} не найден`)
  const { len, horizontal, refIsStart, ins } = layout(apt, o)
  const fromStart = o.offsetCm - ins.start
  const fromEnd = len - o.offsetCm - o.widthCm - ins.end
  return {
    openingId, opening: o,
    rooms: roomsOfWall(apt, o.wallId).map((id) => ({ id, name: apt.rooms[id].name })),
    wallLengthCm: len, clearSpanCm: len - ins.start - ins.end,
    refCorner: horizontal ? 'left' : 'top',
    fromRefCm: round3(refIsStart ? fromStart : fromEnd),
    fromOtherCm: round3(refIsStart ? fromEnd : fromStart),
  }
}

/** Название проёма для сообщений: «Дверь в стене комнаты «X» / «Y»». */
export function openingLabel(apt: Apartment, o: Opening): string {
  const names = roomsOfWall(apt, o.wallId).map((id) => `«${apt.rooms[id].name}»`)
  return `${kindName(o)} в стене комнаты ${names.length > 0 ? names.join(' / ') : 'вне комнат'}`
}

export interface OpeningPatch {
  /** Чистый отступ от опорного угла (см. OpeningInfo.refCorner). */
  fromRefCm?: number
  widthCm?: number
  heightCm?: number
  hinge?: 'start' | 'end'
  swingRoomId?: Id
}

export interface OpeningProposal {
  ok: boolean
  openingId: Id
  candidate: Apartment | null
  before: Opening | null
  after: Opening | null
  issues: Issue[]
}

/**
 * Изменение одного проёма. У общей двери проём один: правка видна в обеих комнатах сразу (AC-04).
 * Пересечение с другим проёмом, выход за стену или в угол, высота выше потолка, размеры вне
 * пределов и мебель в новой зоне двери блокируют изменение с названием причины (AC-10).
 */
export function proposeOpeningChange(apt: Apartment, openingId: Id, patch: OpeningPatch, opts: { catalog?: Catalog } = {}): OpeningProposal {
  const o = apt.openings[openingId]
  const fail = (issues: Issue[]): OpeningProposal => ({ ok: false, openingId, candidate: null, before: o ?? null, after: null, issues })
  if (!o || !apt.walls[o.wallId]) return fail([{ code: 'missing-ref', message: 'Проём не найден', objectId: openingId }])

  const label = openingLabel(apt, o)
  const issue = (code: string, message: string): Issue => ({ code, message, objectId: openingId })
  const nums = [patch.fromRefCm, patch.widthCm, patch.heightCm].filter((n) => n !== undefined)
  if (nums.some((n) => !Number.isFinite(n))) return fail([issue('bad-number', `${label}: значения должны быть числами в сантиметрах`)])

  const lim = OPENING_LIMITS[o.kind]
  const width = patch.widthCm ?? o.widthCm
  const height = patch.heightCm ?? o.heightCm
  const issues: Issue[] = []
  if (width < lim.width[0] || width > lim.width[1]) issues.push(issue('opening-width', `${label}: ширина ${Math.round(width)} см вне допустимых ${lim.width[0]}–${lim.width[1]} см`))
  if (height < lim.height[0] || height > lim.height[1]) issues.push(issue('opening-height', `${label}: высота ${Math.round(height)} см вне допустимых ${lim.height[0]}–${lim.height[1]} см`))
  if (patch.hinge !== undefined && o.kind !== 'door') issues.push(issue('not-a-door', `${label}: петли и открывание есть только у двери`))
  if (patch.swingRoomId !== undefined) {
    if (o.kind !== 'door') issues.push(issue('not-a-door', `${label}: петли и открывание есть только у двери`))
    else if (!roomsOfWall(apt, o.wallId).includes(patch.swingRoomId)) issues.push(issue('door-bad-swing', `${label}: створка может открываться только в комнату этой стены`))
  }
  if (issues.length > 0) return fail(issues)

  const info = openingInfo(apt, openingId)
  const from = patch.fromRefCm ?? info.fromRefCm
  const next: Opening = { ...o, widthCm: width, heightCm: height, offsetCm: offsetFromRef(apt, o, from, width) }
  if (patch.hinge) next.hinge = patch.hinge
  if (patch.swingRoomId) next.swingRoomId = patch.swingRoomId

  const { len, ins } = layout(apt, o)
  if (next.offsetCm < ins.start - EPS_CM || next.offsetCm + width > len - ins.end + EPS_CM) {
    const room = Math.max(0, Math.floor(info.clearSpanCm - width))
    issues.push(issue('opening-out-of-wall', `${label}: проём не помещается в стену (свободно ${Math.round(info.clearSpanCm)} см, нужно ${Math.round(width)} см; отступ от угла от 0 до ${room} см)`))
  }
  if (next.sillCm + height > apt.ceilingHeightCm + EPS_CM) {
    issues.push(issue('opening-too-tall', `${label}: верх проёма (${next.sillCm + height} см) выше потолка (${apt.ceilingHeightCm} см)`))
  }
  for (const other of Object.values(apt.openings)) {
    if (other.id === openingId || other.wallId !== o.wallId) continue
    const overlap = Math.min(next.offsetCm + next.widthCm, other.offsetCm + other.widthCm) - Math.max(next.offsetCm, other.offsetCm)
    if (overlap > EPS_CM) issues.push(issue('opening-overlap', `${label}: пересекается с другим проёмом на этой стене («${kindName(other)}»)`))
  }
  if (issues.length > 0) return fail(issues)

  const candidate: Apartment = { ...apt, openings: { ...apt.openings, [openingId]: next } }
  try {
    const structural = validateApartment(candidate)
    if (structural.length > 0) return fail(structural)
    if (opts.catalog) {
      const furniture = furnitureIssues(candidate, opts.catalog)
      if (furniture.length > 0) return fail(furniture)
    }
  } catch (e) {
    return fail([issue('build-failed', `Изменение не построено: ${(e as Error).message}`)])
  }
  return { ok: true, openingId, candidate, before: o, after: next, issues: [] }
}
