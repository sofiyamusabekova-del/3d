import { convexOverlap, localToWorld, pointsInsideConvex, rectCorners } from '../geometry/placement'
import { EPS_CM, signedArea, type Pt } from '../geometry/polygon'
import { roomClearPolygon } from './derive'
import { doorZones, openingFrame } from './doors'
import type { Apartment, CatalogItem, ColliderBox, FurnitureInstance, Id, Issue } from './types'

export type Catalog = Record<Id, CatalogItem>

export interface PlacementCandidate {
  id: Id | null
  catalogItemId: Id
  roomId: Id
  xCm: number
  zCm: number
  angleDeg: number
  /** Высота установки над полом (настенные предметы); по умолчанию 0. */
  elevationCm?: number
}

export interface PlacementResult {
  valid: boolean
  code?: 'bad-data' | 'bad-support' | 'outside-room' | 'door-zone' | 'opening-conflict' | 'overlap'
  /** Текстовая причина: цвет не единственный сигнал (SPEC §14). */
  message?: string
  conflictIds: Id[]
  /** Высота установки, которую нужно сохранить с предметом (у настольных — высота поверхности). */
  elevationCm?: number
}

const finite = (n: number) => Number.isFinite(n)

function worldBoxes(item: CatalogItem, xCm: number, zCm: number, angleDeg: number, elevationCm = 0) {
  return item.colliders.map((c: ColliderBox) => {
    const off = localToWorld(c.xCm, c.zCm, angleDeg)
    return {
      corners: rectCorners({ cx: xCm + off.x, cz: zCm + off.z, w: c.widthCm, d: c.depthCm, angleDeg }),
      yMin: c.yMinCm + elevationCm,
      yMax: c.yMaxCm + elevationCm,
    }
  })
}

/** Категории мебели с ровной столешницей, на которую ставится настольная техника (mount = 'surface'). */
const SURFACE_CATEGORIES = new Set(['Столы', 'Хранение', 'Кухонные модули'])
/** Допустимая высота столешницы, см: ниже — пуф и подставка, выше — шкаф, куда ничего не поставить. */
const SURFACE_MIN_CM = 30
const SURFACE_MAX_CM = 130

/**
 * Высота установки предмета над полом. Потолочный предмет (люстра) всегда висит от потолка вниз: хранимое значение
 * не используется, поэтому смена высоты потолка не оставляет люстру в воздухе.
 */
export function elevationOf(apt: Apartment, item: CatalogItem, f: { elevationCm: number }): number {
  return item.mount === 'ceiling' ? apt.ceilingHeightCm - item.heightCm : f.elevationCm
}

/** Высота установки нового предмета: настенный — по умолчанию из карточки, потолочный — от потолка, остальные — 0. */
export function defaultElevation(apt: Apartment, item: CatalogItem): number {
  if (item.mount === 'ceiling') return apt.ceilingHeightCm - item.heightCm
  if (item.mount === 'wall') return item.mountHeightCm ?? 0
  return 0
}

/**
 * Привязка настенного предмета к ближайшей стене комнаты: задняя сторона вплотную к чистой поверхности стены,
 * лицом в комнату, вдоль стены положение сохраняется. Для остальных предметов возвращает кандидата без изменений.
 */
export function snapToWall(apt: Apartment, catalog: Catalog, cand: PlacementCandidate): { xCm: number; zCm: number; angleDeg: number } {
  const same = { xCm: cand.xCm, zCm: cand.zCm, angleDeg: cand.angleDeg }
  const item = catalog[cand.catalogItemId]
  const room = apt.rooms[cand.roomId]
  if (!item || item.mount !== 'wall' || !room || item.colliders.length === 0) return same
  const clear = roomClearPolygon(apt, room)
  const orient = Math.sign(signedArea(clear)) || 1
  const zBack = Math.min(...item.colliders.map((c) => c.zCm - c.depthCm / 2))
  let best: { dist: number; xCm: number; zCm: number; angleDeg: number } | null = null
  for (let i = 0; i < clear.length; i++) {
    const a = clear[i]
    const b = clear[(i + 1) % clear.length]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len < 1e-6) continue
    const n = { x: (-(b.z - a.z) / len) * orient, z: ((b.x - a.x) / len) * orient } // внутрь комнаты
    const dist = (cand.xCm - a.x) * n.x + (cand.zCm - a.z) * n.z
    // Локальная +Z предмета должна смотреть по нормали n: x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ при (0, 1).
    const angleDeg = ((Math.round((Math.atan2(n.x, n.z) * 180) / Math.PI * 1000) / 1000) % 360 + 360) % 360
    const back = localToWorld(0, zBack, angleDeg)
    // Центр так, чтобы задняя точка легла на линию стены (расстояние от стены до задней точки = 0).
    const along = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
    const t = (cand.xCm - a.x) * along.x + (cand.zCm - a.z) * along.z
    const px = a.x + along.x * t, pz = a.z + along.z * t // проекция на линию стены
    const xCm = px - back.x, zCm = pz - back.z
    const score = Math.abs(dist + zBack)
    if (!best || score < best.dist) best = { dist: score, xCm, zCm, angleDeg }
  }
  return best ? { xCm: best.xCm, zCm: best.zCm, angleDeg: best.angleDeg } : same
}

/** Предмет с поверхностью, на которую можно ставить настольные предметы. */
export const hasSupportSurface = (item: CatalogItem) =>
  item.layer === 'item' && item.mount === 'floor' && SURFACE_CATEGORIES.has(item.category) && item.colliders.length === 1 &&
  item.colliders[0].yMaxCm >= SURFACE_MIN_CM && item.colliders[0].yMaxCm <= SURFACE_MAX_CM

/**
 * Опора настольного предмета: самая высокая поверхность той же комнаты, внутри контура которой лежит весь
 * его след. Возвращает идентификатор опоры и высоту поверхности над полом (то же значение — elevationCm предмета).
 */
export function findSupport(apt: Apartment, catalog: Catalog, cand: PlacementCandidate): { id: Id; topCm: number } | null {
  const item = catalog[cand.catalogItemId]
  if (!item || item.mount !== 'surface') return null
  const mine = worldBoxes(item, cand.xCm, cand.zCm, cand.angleDeg)
  let best: { id: Id; topCm: number } | null = null
  for (const other of Object.values(apt.furniture)) {
    if (other.id === cand.id || other.roomId !== cand.roomId) continue
    const otherItem = catalog[other.catalogItemId]
    if (!otherItem || !hasSupportSurface(otherItem)) continue
    const [box] = worldBoxes(otherItem, other.xCm, other.zCm, other.angleDeg, other.elevationCm)
    if (!mine.every((b) => pointsInsideConvex(b.corners, box.corners))) continue
    if (!best || box.yMax > best.topCm) best = { id: other.id, topCm: box.yMax }
  }
  return best
}

/** Предметы, стоящие на данном (их след внутри контура и подошва на поверхности). */
export function itemsOnTop(apt: Apartment, catalog: Catalog, id: Id): FurnitureInstance[] {
  const base = apt.furniture[id]
  const baseItem = base && catalog[base.catalogItemId]
  if (!base || !baseItem || !hasSupportSurface(baseItem)) return []
  const [box] = worldBoxes(baseItem, base.xCm, base.zCm, base.angleDeg, base.elevationCm)
  return Object.values(apt.furniture).filter((f) => {
    const it = catalog[f.catalogItemId]
    if (f.id === id || f.roomId !== base.roomId || it?.mount !== 'surface' || Math.abs(f.elevationCm - box.yMax) > EPS_CM) return false
    return worldBoxes(it, f.xCm, f.zCm, f.angleDeg, f.elevationCm).every((b) => pointsInsideConvex(b.corners, box.corners))
  })
}

/**
 * Правила опоры (D-05): на пол — без подъёма; на стену — задней стороной (локальная ось −Z)
 * вплотную к чистовой поверхности стены, лицом в комнату; настольный предмет — на поверхности стола
 * или тумбы, высота подъёма равна высоте поверхности. Потолок в версию 1 не входит.
 * Возвращает индекс стены границы комнаты для настенных предметов.
 */
function checkSupport(
  clear: Pt[], item: CatalogItem, cand: PlacementCandidate, elevation: number, support: { topCm: number } | null,
): { error?: string; wallIndex?: number } {
  if (item.mount === 'floor') return Math.abs(elevation) > EPS_CM ? { error: 'Напольный предмет не может висеть над полом' } : {}
  if (item.mount === 'surface') {
    if (!support) return { error: 'Настольный предмет ставится на стол или тумбу' }
    return Math.abs(elevation - support.topCm) > EPS_CM ? { error: 'Предмет не лежит на поверхности' } : {}
  }
  if (item.mount === 'ceiling') return {} // потолочный предмет: высота задана потолком, положение — любая точка комнаты
  if (item.mount !== 'wall') return { error: 'Этот способ установки не поддерживается в версии 1' }
  if (item.colliders.length === 0) return { error: 'У настенного предмета нет объёма' }
  const zBack = Math.min(...item.colliders.map((c) => c.zCm - c.depthCm / 2))
  const front = localToWorld(0, 1, cand.angleDeg)
  const back = localToWorld(0, zBack, cand.angleDeg)
  const p = { x: cand.xCm + back.x, z: cand.zCm + back.z }
  const orient = Math.sign(signedArea(clear)) || 1
  for (let i = 0; i < clear.length; i++) {
    const a = clear[i]
    const b = clear[(i + 1) % clear.length]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const n = { x: (-(b.z - a.z) / len) * orient, z: ((b.x - a.x) / len) * orient }
    const faces = front.x * n.x + front.z * n.z > 1 - 1e-6
    const dist = (p.x - a.x) * n.x + (p.z - a.z) * n.z
    if (faces && Math.abs(dist) <= EPS_CM) return { wallIndex: i }
  }
  return { error: 'Настенный предмет должен стоять задней стороной вплотную к стене' }
}

/**
 * Единый валидатор размещения для 2D и 3D (SPEC §11.2). Учитывает поворот и все
 * коллайдеры предмета; пересечение предметов проверяется с учётом диапазонов высот.
 * Комнаты первой версии прямоугольные, поэтому контур комнаты выпуклый.
 */
export function validatePlacement(apt: Apartment, catalog: Catalog, cand: PlacementCandidate): PlacementResult {
  const item = catalog[cand.catalogItemId]
  const room = apt.rooms[cand.roomId]
  if (!item || !room || ![cand.xCm, cand.zCm, cand.angleDeg].every(finite)) {
    return { valid: false, code: 'bad-data', message: 'Некорректные данные размещения', conflictIds: [] }
  }
  // Настольный предмет: высота берётся с поверхности под ним; если она задана явно (сохранённый предмет), должна совпасть.
  const surface = findSupport(apt, catalog, cand)
  const elevation = item.mount === 'ceiling'
    ? defaultElevation(apt, item) // висит от потолка, хранимое значение не важно
    : cand.elevationCm ?? (item.mount === 'surface' ? (surface?.topCm ?? 0) : defaultElevation(apt, item))
  if (!finite(elevation)) return { valid: false, code: 'bad-data', message: 'Некорректные данные размещения', conflictIds: [] }
  // Настенный предмет висит на любой высоте, но целиком между полом и потолком.
  if (item.mount === 'wall') {
    if (elevation < -EPS_CM) return { valid: false, code: 'bad-support', message: 'Предмет не может висеть ниже пола', conflictIds: [] }
    if (elevation + item.heightCm > apt.ceilingHeightCm + EPS_CM) {
      return { valid: false, code: 'bad-support', message: `Предмет упирается в потолок: самая большая высота подвеса ${Math.floor(apt.ceilingHeightCm - item.heightCm)} см`, conflictIds: [] }
    }
  }
  const clear = roomClearPolygon(apt, room)
  const mine = worldBoxes(item, cand.xCm, cand.zCm, cand.angleDeg, elevation)
  if (!mine.every((b) => pointsInsideConvex(b.corners, clear))) {
    return { valid: false, code: 'outside-room', message: 'Предмет выходит за стену', conflictIds: [] }
  }
  const support = checkSupport(clear, item, cand, elevation, surface)
  if (support.error) return { valid: false, code: 'bad-support', message: support.error, conflictIds: [] }

  // Проёмы и двери (D-06). Ковры (слой floorCovering) лежат и в зоне двери.
  if (item.layer !== 'floorCovering') {
    for (const o of Object.values(apt.openings)) {
      if (!room.boundary.some((r) => r.wallId === o.wallId)) continue
      if (o.kind === 'door') {
        const zones = doorZones(apt, o, room.id)
        const hit = zones.some((z) => mine.some((b) => b.yMin < o.heightCm - EPS_CM && convexOverlap(b.corners, z)))
        if (hit) return { valid: false, code: 'door-zone', message: 'Предмет стоит в зоне двери', conflictIds: [o.id] }
      }
      if (item.mount === 'wall' && support.wallIndex !== undefined && room.boundary[support.wallIndex].wallId === o.wallId) {
        const f = openingFrame(apt, o, room.id)
        const strip = [f.p0, f.p1, { x: f.p1.x + f.nIn.x * 5, z: f.p1.z + f.nIn.z * 5 }, { x: f.p0.x + f.nIn.x * 5, z: f.p0.z + f.nIn.z * 5 }]
        const hit = mine.some((b) =>
          Math.min(b.yMax, o.sillCm + o.heightCm) - Math.max(b.yMin, o.sillCm) > EPS_CM && convexOverlap(b.corners, strip))
        if (hit) {
          return { valid: false, code: 'opening-conflict', message: o.kind === 'door' ? 'Предмет закрывает дверной проём' : 'Предмет закрывает окно', conflictIds: [o.id] }
        }
      }
    }
  }

  const conflicts: Id[] = []
  for (const other of Object.values(apt.furniture)) {
    if (other.id === cand.id || other.roomId !== cand.roomId) continue
    const otherItem = catalog[other.catalogItemId]
    if (!otherItem) continue
    // Ковёр может лежать под мебелью; два покрытия пола друг на друге запрещены (D-05).
    if ((item.layer === 'floorCovering') !== (otherItem.layer === 'floorCovering')) continue
    const theirs = worldBoxes(otherItem, other.xCm, other.zCm, other.angleDeg, elevationOf(apt, otherItem, other))
    const hit = mine.some((a) =>
      theirs.some((b) => Math.min(a.yMax, b.yMax) - Math.max(a.yMin, b.yMin) > EPS_CM && convexOverlap(a.corners, b.corners)),
    )
    if (hit) conflicts.push(other.id)
  }
  if (conflicts.length > 0) {
    const name = catalog[apt.furniture[conflicts[0]].catalogItemId]?.name ?? 'другим предметом'
    return { valid: false, code: 'overlap', message: `Предмет пересекается: ${name}`, conflictIds: conflicts }
  }
  return { valid: true, conflictIds: [], elevationCm: elevation }
}

/** Проверка всей мебели квартиры; подключается к атомарному применению изменений. */
export function validateFurniturePlacement(catalog: Catalog) {
  return (apt: Apartment): Issue[] => {
    const issues: Issue[] = []
    for (const f of Object.values(apt.furniture)) {
      const r = validatePlacement(apt, catalog, f)
      if (!r.valid) issues.push({ code: r.code ?? 'bad-data', message: r.message ?? 'Недопустимое размещение', objectId: f.id })
    }
    return issues
  }
}

export const addFurnitureCommand = (f: FurnitureInstance) => (a: Apartment): Apartment => ({
  ...a,
  furniture: { ...a.furniture, [f.id]: f },
})

export const updateFurnitureCommand = (id: Id, patch: Partial<Pick<FurnitureInstance, 'xCm' | 'zCm' | 'angleDeg'>>) =>
  (a: Apartment): Apartment => {
    const cur = a.furniture[id]
    if (!cur) throw new Error(`Предмет ${id} не найден`)
    return { ...a, furniture: { ...a.furniture, [id]: { ...cur, ...patch } } }
  }

/**
 * Перенос или поворот предмета вместе с тем, что стоит на нём: настольные предметы смещаются и поворачиваются
 * жёстко вместе с опорой. Для самого настольного предмета в патче передаётся elevationCm — высота новой поверхности.
 */
export const moveFurnitureCommand = (catalog: Catalog, id: Id, patch: Partial<Pick<FurnitureInstance, 'xCm' | 'zCm' | 'angleDeg' | 'elevationCm'>>) =>
  (a: Apartment): Apartment => {
    const cur = a.furniture[id]
    if (!cur) throw new Error(`Предмет ${id} не найден`)
    const next = { ...cur, ...patch }
    const furniture = { ...a.furniture, [id]: next }
    const dAngle = next.angleDeg - cur.angleDeg
    for (const child of itemsOnTop(a, catalog, id)) {
      const off = localToWorld(child.xCm - cur.xCm, child.zCm - cur.zCm, dAngle)
      furniture[child.id] = { ...child, xCm: next.xCm + off.x, zCm: next.zCm + off.z, angleDeg: (((child.angleDeg + dAngle) % 360) + 360) % 360 }
    }
    return { ...a, furniture }
  }

/** Удаление предмета вместе с настольными предметами на нём (передайте каталог). */
export const removeFurnitureCommand = (id: Id, catalog?: Catalog) => (a: Apartment): Apartment => {
  const rest = { ...a.furniture }
  if (catalog) for (const child of itemsOnTop(a, catalog, id)) delete rest[child.id]
  delete rest[id]
  return { ...a, furniture: rest }
}
