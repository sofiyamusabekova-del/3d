import { EPS_CM } from '../geometry/polygon'
import { roomClearPolygon, wallLengthCm } from './derive'
import { signedArea } from '../geometry/polygon'
import { validateGeometry } from './rules'
import type { Apartment, Id, Issue } from './types'

const finite = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n)

/**
 * Проверка целостности модели (Tasks 3.5). Геометрические правила этапа 5
 * (перекрытия, проёмы, мебель) добавляются отдельно.
 */
export function validateApartment(apt: Apartment): Issue[] {
  const issues: Issue[] = []
  const add = (code: string, message: string, objectId?: Id) => issues.push({ code, message, objectId })

  if (!finite(apt.ceilingHeightCm) || apt.ceilingHeightCm <= 0) {
    add('bad-number', 'Высота потолка должна быть положительным числом')
  }
  for (const v of Object.values(apt.vertices)) {
    if (!finite(v.xCm) || !finite(v.zCm)) add('bad-number', `Вершина ${v.id}: координаты должны быть конечными числами`, v.id)
  }
  for (const w of Object.values(apt.walls)) {
    if (!apt.vertices[w.startVertexId] || !apt.vertices[w.endVertexId]) {
      add('missing-ref', `Стена ${w.id} ссылается на несуществующую вершину`, w.id)
      continue
    }
    if (!finite(w.thicknessCm) || w.thicknessCm <= 0) add('bad-number', `Стена ${w.id}: толщина должна быть положительной`, w.id)
    else if (wallLengthCm(apt, w) < EPS_CM) add('zero-length', `Стена ${w.id} имеет нулевую длину`, w.id)
  }

  const wallUses = new Map<Id, boolean[]>()
  for (const room of Object.values(apt.rooms)) {
    const b = room.boundary
    if (b.length < 3) {
      add('bad-boundary', `Комната «${room.name}»: в границе меньше трёх стен`, room.id)
      continue
    }
    if (b.some((r) => !apt.walls[r.wallId])) {
      add('missing-ref', `Комната «${room.name}» ссылается на несуществующую стену`, room.id)
      continue
    }
    let closed = true
    for (let i = 0; i < b.length; i++) {
      const cur = apt.walls[b[i].wallId]
      const next = apt.walls[b[(i + 1) % b.length].wallId]
      const end = b[i].reversed ? cur.startVertexId : cur.endVertexId
      const nextStart = b[(i + 1) % b.length].reversed ? next.endVertexId : next.startVertexId
      if (end !== nextStart) closed = false
      const arr = wallUses.get(cur.id) ?? []
      arr.push(b[i].reversed)
      wallUses.set(cur.id, arr)
    }
    if (!closed) {
      add('open-boundary', `Граница комнаты «${room.name}» не замкнута`, room.id)
      continue
    }
    try {
      const area = signedArea(roomClearPolygon(apt, room))
      if (area <= EPS_CM) add('bad-area', `Комната «${room.name}» имеет неположительную чистую площадь`, room.id)
    } catch {
      add('bad-area', `Комната «${room.name}»: не удалось построить чистовой контур`, room.id)
    }
  }
  for (const [wallId, dirs] of wallUses) {
    if (dirs.length > 2) add('wall-overused', `Стена ${wallId} входит в границы более чем двух комнат`, wallId)
    if (dirs.length === 2 && dirs[0] === dirs[1]) {
      add('wall-same-direction', `Стена ${wallId}: соседние комнаты обходят её в одном направлении (наложение)`, wallId)
    }
  }

  for (const o of Object.values(apt.openings)) {
    const wall = apt.walls[o.wallId]
    if (!wall) {
      add('missing-ref', `Проём ${o.id} ссылается на несуществующую стену`, o.id)
      continue
    }
    if (![o.offsetCm, o.widthCm, o.heightCm, o.sillCm].every(finite) || o.widthCm <= 0 || o.heightCm <= 0 || o.offsetCm < 0 || o.sillCm < 0) {
      add('bad-number', `Проём ${o.id}: размеры должны быть положительными конечными числами`, o.id)
    } else if (o.offsetCm + o.widthCm > wallLengthCm(apt, wall) + EPS_CM) {
      add('opening-out-of-wall', `Проём ${o.id} выходит за пределы стены ${wall.id}`, o.id)
    }
  }
  for (const f of Object.values(apt.furniture)) {
    if (!apt.rooms[f.roomId]) add('missing-ref', `Предмет ${f.id} относится к несуществующей комнате`, f.id)
    if (![f.xCm, f.zCm, f.angleDeg, f.elevationCm].every(finite)) add('bad-number', `Предмет ${f.id}: некорректные координаты`, f.id)
  }
  for (const key of Object.keys(apt.surfaceMaterials)) {
    const [wallId, roomId] = key.split('|')
    const room = apt.rooms[roomId]
    if (!apt.walls[wallId] || !room || !room.boundary.some((r) => r.wallId === wallId)) {
      add('bad-surface', `Отделка относится к несуществующей поверхности ${key}`)
    }
  }
  for (const roomId of Object.keys(apt.floorCoverings)) {
    if (!apt.rooms[roomId]) add('missing-ref', `Покрытие пола относится к несуществующей комнате ${roomId}`, roomId)
  }
  // Геометрические правила (этап 5) имеют смысл только для структурно целой модели.
  if (issues.length === 0) issues.push(...validateGeometry(apt))
  return issues
}
