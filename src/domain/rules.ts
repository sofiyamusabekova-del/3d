import { convexOverlap } from '../geometry/placement'
import { EPS_CM, isConvex, selfIntersects } from '../geometry/polygon'
import { roomAxisPolygon, roomClearPolygon, wallEnds, wallLengthCm } from './derive'
import { roomsOfWall } from './doors'
import type { Apartment, Issue } from './types'

/**
 * Геометрические правила этапа 5 (SPEC §9, AC-10). Вызывать только для структурно целой
 * модели (validateApartment проверяет ссылки и замкнутость раньше).
 */
export function validateGeometry(apt: Apartment): Issue[] {
  const issues: Issue[] = []
  const add = (code: string, message: string, objectId?: string) => issues.push({ code, message, objectId })

  // 5.1 Комнаты: самопересечение, выпуклость (D-01), наложение помещений.
  const clear = new Map<string, ReturnType<typeof roomClearPolygon>>()
  for (const room of Object.values(apt.rooms)) {
    if (selfIntersects(roomAxisPolygon(apt, room).pts)) {
      add('self-intersection', `Граница комнаты «${room.name}» пересекает сама себя`, room.id)
      continue
    }
    const poly = roomClearPolygon(apt, room)
    if (!isConvex(poly)) {
      add('non-convex', `Комната «${room.name}» не выпуклая: версия 1 поддерживает только прямоугольные комнаты`, room.id)
      continue
    }
    clear.set(room.id, poly)
  }
  const ids = [...clear.keys()]
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (convexOverlap(clear.get(ids[i])!, clear.get(ids[j])!)) {
        add('rooms-overlap', `Комнаты «${apt.rooms[ids[i]].name}» и «${apt.rooms[ids[j]].name}» накладываются друг на друга`, ids[i])
      }
    }
  }

  // 5.2 Стены: «двойная стена» — тела двух параллельных стен пересекаются по длине.
  const walls = Object.values(apt.walls)
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = walls[i], w2 = walls[j]
      const e1 = wallEnds(apt, w1), e2 = wallEnds(apt, w2)
      const l1 = wallLengthCm(apt, w1), l2 = wallLengthCm(apt, w2)
      const d1 = { x: (e1.b.x - e1.a.x) / l1, z: (e1.b.z - e1.a.z) / l1 }
      if (Math.abs(d1.x * (e2.b.z - e2.a.z) - d1.z * (e2.b.x - e2.a.x)) / l2 > 1e-9) continue // не параллельны
      const dist = Math.abs((e2.a.x - e1.a.x) * -d1.z + (e2.a.z - e1.a.z) * d1.x)
      const s2a = (e2.a.x - e1.a.x) * d1.x + (e2.a.z - e1.a.z) * d1.z
      const s2b = (e2.b.x - e1.a.x) * d1.x + (e2.b.z - e1.a.z) * d1.z
      const overlap = Math.min(l1, Math.max(s2a, s2b)) - Math.max(0, Math.min(s2a, s2b))
      if (overlap > EPS_CM && dist < (w1.thicknessCm + w2.thicknessCm) / 2 - EPS_CM) {
        add('double-wall', `Стены ${w1.id} и ${w2.id} накладываются: получилась двойная стена`, w1.id)
      }
    }
  }

  // 5.3 Проёмы: пересечение, высота, связи двери с комнатами.
  const byWall = new Map<string, typeof apt.openings[string][]>()
  for (const o of Object.values(apt.openings)) byWall.set(o.wallId, [...(byWall.get(o.wallId) ?? []), o])
  for (const [wallId, list] of byWall) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        const overlap = Math.min(a.offsetCm + a.widthCm, b.offsetCm + b.widthCm) - Math.max(a.offsetCm, b.offsetCm)
        if (overlap > EPS_CM) add('opening-overlap', `Проёмы ${a.id} и ${b.id} на стене ${wallId} пересекаются`, a.id)
      }
    }
  }
  for (const o of Object.values(apt.openings)) {
    if (o.sillCm + o.heightCm > apt.ceilingHeightCm + EPS_CM) add('opening-too-tall', `Проём ${o.id} выше потолка`, o.id)
    const rooms = roomsOfWall(apt, o.wallId)
    if (rooms.length === 0) add('opening-orphan', `Проём ${o.id}: стена ${o.wallId} не входит в границу ни одной комнаты`, o.id)
    if (o.kind === 'door') {
      if (o.sillCm !== 0) add('bad-number', `Дверь ${o.id}: порога быть не может (высота подоконника 0)`, o.id)
      if (!o.hinge) add('door-no-hinge', `Дверь ${o.id}: не задана сторона петель`, o.id)
      if (!o.swingRoomId || !rooms.includes(o.swingRoomId)) {
        add('door-bad-swing', `Дверь ${o.id}: створка должна открываться в комнату, к стене которой она относится`, o.id)
      }
    }
  }
  return issues
}
