import type { Apartment, Id, Opening, Room, RoomType, Vertex, Wall } from '../domain/types'

/**
 * Стартовые схемы (SPEC §3.1, D-15). Схема описывается деревом разрезов: ряд (`row`) —
 * соседи слева направо, колонка (`col`) — сверху вниз. Размеры — чистовые, в см, до
 * увеличения D-15; `'rest'` — остаток до размера родителя. Между соседями остаётся
 * перегородка 10 см, снаружи стена 30 см; прочие размеры из §3.1 не меняются.
 */
export interface LayoutSplit { dir: 'row' | 'col'; size: number | 'rest'; children: LayoutNode[] }
export type LayoutNode = { type: RoomType; name: string; size: number | 'rest' } | LayoutSplit

export interface LayoutTemplate {
  id: string
  name: string
  roomCount: 1 | 2 | 3
  /** Состав помещений для показа пользователю. */
  composition: string
  /** Диапазон чистой площади из SPEC §3.1 — до увеличения D-15. */
  baseAreaRangeM2: [number, number]
  layout: LayoutSplit
}

export const SIDE_SCALE = 1.1 // D-15: стороны комнат ×1,1, площадь около +21 %
export const OUTER_WALL_CM = 30
export const INNER_WALL_CM = 10
export const CEILING_CM = 270
export const DOOR_WIDTHS = { interior: 80, bath: 70, entrance: 90 } as const
const DOOR_HEIGHT_CM = 205
const WINDOW = { heightCm: 140, sillCm: 90 }

const leaf = (type: RoomType, name: string, size: number | 'rest'): LayoutNode => ({ type, name, size })
const row = (size: number | 'rest', ...children: LayoutNode[]): LayoutSplit => ({ dir: 'row', size, children })
const col = (size: number | 'rest', ...children: LayoutNode[]): LayoutSplit => ({ dir: 'col', size, children })

export const TEMPLATES: LayoutTemplate[] = [
  {
    id: '1a', name: 'Схема 1А (студия)', roomCount: 1, composition: 'Кухня-гостиная, прихожая, совмещённый санузел', baseAreaRangeM2: [28, 35],
    layout: row(500, leaf('kitchenLiving', 'Кухня-гостиная', 400), col(200, leaf('hallway', 'Прихожая', 290), leaf('combinedBathroom', 'Санузел', 'rest'))),
  },
  {
    id: '1b', name: 'Схема 1Б', roomCount: 1, composition: 'Комната, кухня, прихожая, совмещённый санузел', baseAreaRangeM2: [33, 40],
    layout: row(560, leaf('living', 'Комната', 380), col(260, leaf('kitchen', 'Кухня', 240), leaf('hallway', 'Прихожая', 170), leaf('combinedBathroom', 'Санузел', 'rest'))),
  },
  {
    id: '1v', name: 'Схема 1В', roomCount: 1, composition: 'Комната, кухня, прихожая, ванная и туалет раздельно', baseAreaRangeM2: [38, 46],
    layout: row(600, leaf('living', 'Комната', 400), col(280, leaf('kitchen', 'Кухня', 240), leaf('hallway', 'Прихожая', 180),
      row('rest', leaf('bathroom', 'Ванная', 140), leaf('toilet', 'Туалет', 'rest')))),
  },
  {
    id: '2a', name: 'Схема 2А', roomCount: 2, composition: 'Кухня-гостиная, спальня, прихожая, совмещённый санузел', baseAreaRangeM2: [40, 52],
    layout: row(580, leaf('kitchenLiving', 'Кухня-гостиная', 420), col(340, leaf('bedroom', 'Спальня', 260), leaf('hallway', 'Прихожая', 170), leaf('combinedBathroom', 'Санузел', 'rest'))),
  },
  {
    id: '2b', name: 'Схема 2Б', roomCount: 2, composition: 'Гостиная, спальня, кухня, прихожая, совмещённый санузел', baseAreaRangeM2: [48, 60],
    layout: row(640, col(380, leaf('living', 'Гостиная', 360), leaf('bedroom', 'Спальня', 'rest')), leaf('hallway', 'Прихожая', 150),
      col(260, leaf('kitchen', 'Кухня', 'rest'), leaf('combinedBathroom', 'Санузел', 200))),
  },
  {
    id: '2v', name: 'Схема 2В', roomCount: 2, composition: 'Гостиная, спальня, кухня, прихожая, ванная и туалет раздельно', baseAreaRangeM2: [54, 68],
    layout: row(700, col(400, leaf('living', 'Гостиная', 390), leaf('bedroom', 'Спальня', 'rest')), leaf('hallway', 'Прихожая', 150),
      col(260, leaf('kitchen', 'Кухня', 'rest'), leaf('bathroom', 'Ванная', 150), leaf('toilet', 'Туалет', 120))),
  },
  {
    id: '3a', name: 'Схема 3А', roomCount: 3, composition: 'Кухня-гостиная, две спальни, прихожая, совмещённый санузел', baseAreaRangeM2: [62, 78],
    layout: row(760, col(450, leaf('kitchenLiving', 'Кухня-гостиная', 400), leaf('bedroom', 'Спальня 1', 'rest')), leaf('hallway', 'Прихожая', 150),
      col(280, leaf('bedroom', 'Спальня 2', 'rest'), leaf('combinedBathroom', 'Санузел', 200))),
  },
  {
    id: '3b', name: 'Схема 3Б', roomCount: 3, composition: 'Гостиная, две спальни, кухня, прихожая, совмещённый санузел', baseAreaRangeM2: [65, 80],
    layout: row(800, col(420, leaf('living', 'Гостиная', 420), leaf('bedroom', 'Спальня 1', 'rest')), leaf('hallway', 'Прихожая', 150),
      col(280, leaf('kitchen', 'Кухня', 260), leaf('bedroom', 'Спальня 2', 'rest'), leaf('combinedBathroom', 'Санузел', 200))),
  },
  {
    id: '3v', name: 'Схема 3В', roomCount: 3, composition: 'Гостиная, две спальни, кухня, прихожая, ванная и туалет раздельно', baseAreaRangeM2: [72, 90],
    layout: row(840, col(460, leaf('living', 'Гостиная', 430), leaf('bedroom', 'Спальня 1', 'rest')), leaf('hallway', 'Прихожая', 150),
      col(280, leaf('kitchen', 'Кухня', 260), leaf('bedroom', 'Спальня 2', 'rest'), leaf('bathroom', 'Ванная', 150), leaf('toilet', 'Туалет', 120))),
  },
]

export const templateById = (id: string): LayoutTemplate | undefined => TEMPLATES.find((t) => t.id === id)

interface Rect { type: RoomType; name: string; x0: number; z0: number; x1: number; z1: number }

/** Раскладывает дерево разрезов в чистовые прямоугольники (в см, начало — угол чистового контура). */
function placeClear(t: LayoutTemplate, scale: number): { rects: Rect[]; width: number; depth: number } {
  const s = (n: number) => Math.round(n * scale)
  const rects: Rect[] = []
  const place = (node: LayoutNode, x0: number, z0: number, w: number, d: number): void => {
    if (!('dir' in node)) {
      rects.push({ type: node.type, name: node.name, x0, z0, x1: x0 + w, z1: z0 + d })
      return
    }
    const along = node.dir === 'row' ? w : d
    const gaps = INNER_WALL_CM * (node.children.length - 1)
    const fixed = node.children.reduce((sum, c) => sum + (c.size === 'rest' ? 0 : s(c.size as number)), 0)
    const rests = node.children.filter((c) => c.size === 'rest').length
    if (rests > 1) throw new Error(`Схема ${t.id}: больше одного 'rest' в одном разрезе`)
    const rest = along - gaps - fixed
    if ((rests === 1 && rest <= 0) || (rests === 0 && Math.abs(rest) > 1)) throw new Error(`Схема ${t.id}: размеры разреза не сходятся (${rest})`)
    let pos = node.dir === 'row' ? x0 : z0
    for (const c of node.children) {
      const len = c.size === 'rest' ? rest : s(c.size as number)
      if (node.dir === 'row') place(c, pos, z0, len, d)
      else place(c, x0, pos, w, len)
      pos += len + INNER_WALL_CM
    }
  }
  const root = t.layout
  const sizes = root.children.map((c) => {
    if (c.size === 'rest') throw new Error(`Схема ${t.id}: в корне нельзя 'rest'`)
    return s(c.size)
  })
  const total = sizes.reduce((a, b) => a + b, 0) + INNER_WALL_CM * (sizes.length - 1)
  const cross = s(root.size as number)
  const width = root.dir === 'row' ? total : cross
  const depth = root.dir === 'row' ? cross : total
  place(root, 0, 0, width, depth)
  return { rects, width, depth }
}

const key = (x: number, z: number) => `${x},${z}`

/**
 * Строит квартиру из схемы: чистовые прямоугольники → оси стен (внешние 30 см, внутренние
 * 10 см), общие стены делятся в местах примыканий, двери из прихожей в каждое смежное
 * помещение, входная дверь на внешней стене прихожей, окна в жилых комнатах и кухнях.
 * Мебели нет. `scale` — множитель сторон комнат (по умолчанию D-15).
 */
export function buildApartment(t: LayoutTemplate, scale: number = SIDE_SCALE): Apartment {
  const { rects: clear, width, depth } = placeClear(t, scale)
  const half = (border: boolean) => (border ? OUTER_WALL_CM : INNER_WALL_CM) / 2
  // Оси: чистовой прямоугольник, расширенный на половину толщины с каждой стороны.
  const axis = clear.map((r) => ({
    ...r,
    x0: r.x0 - half(r.x0 === 0),
    z0: r.z0 - half(r.z0 === 0),
    x1: r.x1 + half(r.x1 === width),
    z1: r.z1 + half(r.z1 === depth),
  }))
  const minX = -OUTER_WALL_CM / 2, minZ = -OUTER_WALL_CM / 2
  const maxX = width + OUTER_WALL_CM / 2, maxZ = depth + OUTER_WALL_CM / 2

  const vertices: Record<Id, Vertex> = {}
  const vid = new Map<string, Id>()
  const vertex = (x: number, z: number): Id => {
    const k = key(x, z)
    let id = vid.get(k)
    if (!id) {
      id = `v${vid.size + 1}`
      vid.set(k, id)
      vertices[id] = { id, xCm: x, zCm: z }
    }
    return id
  }
  const corners = axis.flatMap((r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] as const)
  const walls: Record<Id, Wall> = {}
  const wallByKey = new Map<string, Id>()
  const rooms: Record<Id, Room> = {}

  axis.forEach((r, i) => {
    const edges: Array<[[number, number], [number, number]]> = [
      [[r.x0, r.z0], [r.x1, r.z0]], [[r.x1, r.z0], [r.x1, r.z1]], [[r.x1, r.z1], [r.x0, r.z1]], [[r.x0, r.z1], [r.x0, r.z0]],
    ]
    const boundary: Room['boundary'] = []
    for (const [a, b] of edges) {
      // Точки других комнат, лежащие строго внутри ребра, делят его на участки.
      const along = (p: readonly [number, number]) => (b[0] === a[0] ? (p[1] - a[1]) * Math.sign(b[1] - a[1]) : (p[0] - a[0]) * Math.sign(b[0] - a[0]))
      const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
      const inside = corners.filter((p) => {
        const onLine = b[0] === a[0] ? p[0] === a[0] : p[1] === a[1]
        const t2 = along(p)
        return onLine && t2 > 0 && t2 < len
      })
      const pts = [a, ...[...new Map(inside.map((p) => [key(p[0], p[1]), p])).values()].sort((p, q) => along(p) - along(q)), b]
      for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k], q = pts[k + 1]
        const sk = [key(p[0], p[1]), key(q[0], q[1])].sort().join('|')
        let wid = wallByKey.get(sk)
        if (!wid) {
          wid = `w${wallByKey.size + 1}`
          wallByKey.set(sk, wid)
          const horizontal = p[1] === q[1]
          const perimeter = horizontal ? p[1] === minZ || p[1] === maxZ : p[0] === minX || p[0] === maxX
          walls[wid] = { id: wid, startVertexId: vertex(p[0], p[1]), endVertexId: vertex(q[0], q[1]), thicknessCm: perimeter ? OUTER_WALL_CM : INNER_WALL_CM }
        }
        boundary.push({ wallId: wid, reversed: walls[wid].startVertexId !== vertex(p[0], p[1]) })
      }
    }
    const id = `room-${i + 1}`
    rooms[id] = { id, type: r.type, name: r.name, boundary }
  })

  const wallLen = (w: Wall) => Math.hypot(
    vertices[w.endVertexId].xCm - vertices[w.startVertexId].xCm, vertices[w.endVertexId].zCm - vertices[w.startVertexId].zCm)
  const users = (wallId: Id) => Object.values(rooms).filter((r) => r.boundary.some((b) => b.wallId === wallId))
  const openings: Record<Id, Opening> = {}
  let n = 0
  const addDoor = (wallId: Id, widthCm: number, swingRoomId: Id) => {
    const L = wallLen(walls[wallId])
    if (L < widthCm + 40) throw new Error(`Схема ${t.id}: на стене ${wallId} (${L} см) не помещается дверь ${widthCm} см с отступами`)
    const id = `door-${++n}`
    openings[id] = { id, kind: 'door', wallId, offsetCm: (L - widthCm) / 2, widthCm, heightCm: DOOR_HEIGHT_CM, sillCm: 0, hinge: 'start', swingRoomId }
  }
  const hall = Object.values(rooms).find((r) => r.type === 'hallway')!
  for (const other of Object.values(rooms)) {
    if (other.id === hall.id) continue
    const shared = hall.boundary.map((b) => b.wallId).filter((w) => other.boundary.some((b) => b.wallId === w))
    if (shared.length === 0) continue
    const wallId = shared.sort((a, b) => wallLen(walls[b]) - wallLen(walls[a]))[0]
    const bath = other.type === 'bathroom' || other.type === 'toilet' || other.type === 'combinedBathroom'
    addDoor(wallId, bath ? DOOR_WIDTHS.bath : DOOR_WIDTHS.interior, other.id)
  }
  const exterior = (room: Room) => room.boundary.map((b) => b.wallId).filter((w) => users(w).length === 1).sort((a, b) => wallLen(walls[b]) - wallLen(walls[a]))
  const entrance = exterior(hall)[0]
  if (!entrance) throw new Error(`Схема ${t.id}: у прихожей нет внешней стены для входной двери`)
  addDoor(entrance, DOOR_WIDTHS.entrance, hall.id)
  for (const room of Object.values(rooms)) {
    if (!['living', 'bedroom', 'kitchen', 'kitchenLiving'].includes(room.type)) continue
    const wallId = exterior(room)[0]
    if (!wallId) throw new Error(`Схема ${t.id}: у комнаты «${room.name}» нет внешней стены для окна`)
    const L = wallLen(walls[wallId])
    const widthCm = Math.min(180, Math.max(90, Math.floor((L * 0.45) / 10) * 10))
    if (L < widthCm + 60) throw new Error(`Схема ${t.id}: на стене ${wallId} не помещается окно`)
    const id = `window-${++n}`
    openings[id] = { id, kind: 'window', wallId, offsetCm: (L - widthCm) / 2, widthCm, heightCm: WINDOW.heightCm, sillCm: WINDOW.sillCm }
  }

  return {
    id: `apartment-${t.id}`,
    schemaVersion: 1,
    ceilingHeightCm: CEILING_CM,
    vertices, walls, rooms, openings,
    furniture: {},
    surfaceMaterials: {},
    floorCoverings: {},
  }
}
