import { create } from 'zustand'
import type { SetEntry } from '../catalog/sets'
import { planFurnish } from '../domain/furnish'
import { addFurnitureCommand, defaultElevation, moveFurnitureCommand, removeFurnitureCommand, snapToWall, validatePlacement, type Catalog, type PlacementResult } from '../domain/placement'
import type { createProjectStore } from '../domain/store'
import type { FurnitureInstance, Id } from '../domain/types'

export const GRID_CM = 5

export interface Draft {
  /** null — новый предмет из каталога. */
  id: Id | null
  catalogItemId: Id
  xCm: number
  zCm: number
  angleDeg: number
  result: PlacementResult
  grab: { dx: number; dz: number }
  /**
   * Представление, в котором начат перенос: только оно переводит указатель в координаты.
   * 'catalog' — предмет тянут из каталога: указатель переводит то представление, над которым он находится.
   */
  view: 'plan' | '3d' | 'catalog'
  /** 'rotate' — предмет поворачивают ручкой: указатель задаёт угол, положение не меняется. 'lift' — настенный предмет тянут по высоте. */
  mode: 'move' | 'rotate' | 'lift'
  /** Только у 'lift': высота подвеса в черновике, см. */
  elevationCm?: number
  /** Только у 'lift': расстояние от точки захвата до центра предмета по вертикали, см. */
  grabY?: number
}

export interface EditorStore {
  selectedId: Id | null
  draft: Draft | null
  message: string | null
  select: (id: Id | null) => void
  beginDrag: (src: { id: Id } | { catalogItemId: Id }, pointer: { x: number; z: number }, view: 'plan' | '3d' | 'catalog') => void
  moveDrag: (pointer: { x: number; z: number }, free: boolean) => void
  /** Поворот ручкой: начать для выбранного предмета и задавать угол (привязка 15°, Alt — свободный угол). */
  beginRotate: (id: Id, view: 'plan' | '3d') => void
  rotateTo: (angleDeg: number, free: boolean) => void
  /** Перенос настенного предмета по высоте в 3D (Shift + перетаскивание): hitYCm — высота точки указателя на стене. */
  beginLift: (id: Id, hitYCm: number) => void
  liftTo: (hitYCm: number, free: boolean) => void
  /** Сдвиг выбранного предмета стрелками (см); недопустимый сдвиг отклоняется с причиной. */
  nudge: (dxCm: number, dzCm: number) => void
  rotate: (deltaDeg: number) => void
  /**
   * Поворот на четверть оборота, как в The Sims (клавиша R): к следующему кратному 90° углу. Если после поворота предмет
   * задевает стену или соседа, он сдвигается на ближайшее свободное место (до 1,2 м); в переносе — только поворот.
   */
  quarterTurn: (dir: 1 | -1) => void
  endDrag: () => void
  cancelDrag: () => void
  addAtFreeSpot: (catalogItemId: Id) => void
  removeSelected: () => void
  /** Расставить готовый набор в активной комнате одной командой (одна отмена); message сообщает итог. */
  furnishRoom: (entries: SetEntry[]) => void
  /** Высота подвеса выбранного настенного предмета над полом (см); недопустимая высота отклоняется с причиной. */
  setElevation: (elevationCm: number) => void
}

export interface EditorDeps {
  project: ReturnType<typeof createProjectStore>
  catalog: Catalog
  /** Комната, в которой сейчас работает редактор (у интерьера — активная). */
  roomId: () => Id | null
  /** Префикс идентификаторов новых предметов: разные редакторы не пересекаются. */
  idPrefix: string
  /** Область поиска свободного места для «добавить», см. */
  spot: () => { minX: number; maxX: number; minZ: number; maxZ: number }
}

const snap = (v: number, free: boolean) => (free ? Math.round(v) : Math.round(v / GRID_CM) * GRID_CM)
const norm = (deg: number) => ((deg % 360) + 360) % 360

/**
 * Редактор предметов: один и тот же код переноса, поворота и выбора для плана и 3D (SPEC §10, AC-06/07).
 * Состояние проекта меняется только общими командами, черновик переноса живёт здесь и не попадает в историю.
 */
export function createEditor(deps: EditorDeps) {
  let seq = 0
  const { project, catalog } = deps

  const check = (id: Id | null, catalogItemId: Id, xCm: number, zCm: number, angleDeg: number, roomOverride?: Id, elevationOverride?: number): PlacementResult => {
    const roomId = roomOverride ?? deps.roomId()
    if (!roomId) return { valid: false, code: 'bad-data', message: 'Нет активной комнаты', conflictIds: [] }
    const apt = project.getState().history.present
    // Уже висящий настенный предмет проверяется на своей высоте, а не на высоте по умолчанию.
    const elevationCm = elevationOverride ?? (id && catalog[catalogItemId]?.mount === 'wall' ? apt.furniture[id]?.elevationCm : undefined)
    return validatePlacement(apt, catalog, { id, catalogItemId, roomId, xCm, zCm, angleDeg, ...(elevationCm === undefined ? {} : { elevationCm }) })
  }
  /** Настенный предмет притягивается к ближайшей стене лицом в комнату; остальные — без изменений. */
  const fit = (catalogItemId: Id, xCm: number, zCm: number, angleDeg: number, roomOverride?: Id) => {
    const roomId = roomOverride ?? deps.roomId()
    if (!roomId || catalog[catalogItemId]?.mount !== 'wall') return { xCm, zCm, angleDeg }
    return snapToWall(project.getState().history.present, catalog, { id: null, catalogItemId, roomId, xCm, zCm, angleDeg })
  }
  /**
   * Применяет перенос или поворот существующего предмета. Настольный предмет получает высоту новой поверхности,
   * предметы на переносимой опоре едут вместе с ней (moveFurnitureCommand).
   */
  const commitMove = (f: FurnitureInstance, label: string, patchRaw: { xCm: number; zCm: number; angleDeg: number }) => {
    const patch = fit(f.catalogItemId, patchRaw.xCm, patchRaw.zCm, patchRaw.angleDeg, f.roomId)
    let elevationCm: number | undefined
    if (catalog[f.catalogItemId]?.mount === 'surface') {
      const res = check(f.id, f.catalogItemId, patch.xCm, patch.zCm, patch.angleDeg, f.roomId)
      if (!res.valid) return { ok: false as const, message: res.message ?? 'Недопустимое положение' }
      elevationCm = res.elevationCm
    }
    const res = project.getState().apply(label, moveFurnitureCommand(catalog, f.id, elevationCm === undefined ? patch : { ...patch, elevationCm }))
    return res.ok ? { ok: true as const } : { ok: false as const, message: res.issues[0]?.message }
  }
  const newId = () => {
    const present = project.getState().history.present
    let id: string
    do id = `${deps.idPrefix}${++seq}`; while (present.furniture[id])
    return id
  }

  return create<EditorStore>((set, get) => ({
    selectedId: null,
    draft: null,
    message: null,
    select: (id) => set({ selectedId: id }),

    beginDrag: (src, pointer, view) => {
      if ('id' in src) {
        const f = project.getState().history.present.furniture[src.id]
        if (!f) return
        set({
          selectedId: f.id,
          message: null,
          draft: { id: f.id, catalogItemId: f.catalogItemId, xCm: f.xCm, zCm: f.zCm, angleDeg: f.angleDeg, result: check(f.id, f.catalogItemId, f.xCm, f.zCm, f.angleDeg), grab: { dx: f.xCm - pointer.x, dz: f.zCm - pointer.z }, view, mode: 'move' },
        })
      } else {
        const p = fit(src.catalogItemId, pointer.x, pointer.z, 0)
        set({
          selectedId: null,
          message: null,
          draft: { id: null, catalogItemId: src.catalogItemId, xCm: p.xCm, zCm: p.zCm, angleDeg: p.angleDeg, result: check(null, src.catalogItemId, p.xCm, p.zCm, p.angleDeg), grab: { dx: 0, dz: 0 }, view, mode: 'move' },
        })
      }
    },

    beginRotate: (id, view) => {
      const f = project.getState().history.present.furniture[id]
      if (!f) return
      set({
        selectedId: f.id,
        message: null,
        draft: { id: f.id, catalogItemId: f.catalogItemId, xCm: f.xCm, zCm: f.zCm, angleDeg: f.angleDeg, result: check(f.id, f.catalogItemId, f.xCm, f.zCm, f.angleDeg), grab: { dx: 0, dz: 0 }, view, mode: 'rotate' },
      })
    },

    beginLift: (id, hitYCm) => {
      const f = project.getState().history.present.furniture[id]
      const item = f && catalog[f.catalogItemId]
      if (!f || !item || item.mount !== 'wall') return
      set({
        selectedId: f.id,
        message: null,
        draft: {
          id: f.id, catalogItemId: f.catalogItemId, xCm: f.xCm, zCm: f.zCm, angleDeg: f.angleDeg,
          result: { ...check(f.id, f.catalogItemId, f.xCm, f.zCm, f.angleDeg), elevationCm: f.elevationCm },
          grab: { dx: 0, dz: 0 }, view: '3d', mode: 'lift', elevationCm: f.elevationCm, grabY: f.elevationCm + item.heightCm / 2 - hitYCm,
        },
      })
    },

    liftTo: (hitYCm, free) => {
      const d = get().draft
      if (!d || d.mode !== 'lift') return
      const item = catalog[d.catalogItemId]
      const cm = snap(hitYCm + (d.grabY ?? 0) - item.heightCm / 2, free)
      set({ draft: { ...d, elevationCm: cm, result: { ...check(d.id, d.catalogItemId, d.xCm, d.zCm, d.angleDeg, undefined, cm), elevationCm: cm } } })
    },

    rotateTo: (angleDeg, free) => {
      const d = get().draft
      if (!d || d.mode !== 'rotate') return
      const a = norm(free ? Math.round(angleDeg) : Math.round(angleDeg / 15) * 15)
      const p = fit(d.catalogItemId, d.xCm, d.zCm, a) // настенный предмет не поворачивается: он всегда лицом в комнату
      set({ draft: { ...d, xCm: p.xCm, zCm: p.zCm, angleDeg: p.angleDeg, result: check(d.id, d.catalogItemId, p.xCm, p.zCm, p.angleDeg) } })
    },

    nudge: (dxCm, dzCm) => {
      const sel = get().selectedId
      const f = sel ? project.getState().history.present.furniture[sel] : null
      if (!f || get().draft) return
      const res = commitMove(f, 'Сдвиг', { xCm: f.xCm + dxCm, zCm: f.zCm + dzCm, angleDeg: f.angleDeg })
      set({ message: res.ok ? null : (res.message ?? 'Сдвиг недопустим') })
    },

    moveDrag: (pointer, free) => {
      const d = get().draft
      if (!d || d.mode !== 'move') return
      const xCm = snap(pointer.x + d.grab.dx, free)
      const zCm = snap(pointer.z + d.grab.dz, free)
      const p = fit(d.catalogItemId, xCm, zCm, d.angleDeg)
      set({ draft: { ...d, xCm: p.xCm, zCm: p.zCm, angleDeg: p.angleDeg, result: check(d.id, d.catalogItemId, p.xCm, p.zCm, p.angleDeg) } })
    },

    rotate: (deltaDeg) => {
      const d = get().draft
      if (d) {
        const p = fit(d.catalogItemId, d.xCm, d.zCm, norm(d.angleDeg + deltaDeg))
        set({ draft: { ...d, xCm: p.xCm, zCm: p.zCm, angleDeg: p.angleDeg, result: check(d.id, d.catalogItemId, p.xCm, p.zCm, p.angleDeg) } })
        return
      }
      const sel = get().selectedId
      const f = sel ? project.getState().history.present.furniture[sel] : null
      if (!f) return
      const res = commitMove(f, 'Поворот', { xCm: f.xCm, zCm: f.zCm, angleDeg: norm(f.angleDeg + deltaDeg) })
      set({ message: res.ok ? null : (res.message ?? 'Поворот недопустим') })
    },

    quarterTurn: (dir) => {
      const turn = (a: number) => norm(dir > 0 ? (Math.floor(a / 90 + 1e-6) + 1) * 90 : (Math.ceil(a / 90 - 1e-6) - 1) * 90)
      const d = get().draft
      if (d) {
        const p = fit(d.catalogItemId, d.xCm, d.zCm, turn(d.angleDeg))
        set({ draft: { ...d, xCm: p.xCm, zCm: p.zCm, angleDeg: p.angleDeg, result: check(d.id, d.catalogItemId, p.xCm, p.zCm, p.angleDeg) } })
        return
      }
      const sel = get().selectedId
      const f = sel ? project.getState().history.present.furniture[sel] : null
      if (!f) return
      if (catalog[f.catalogItemId]?.mount === 'wall') { set({ message: 'Настенный предмет всегда повёрнут лицом в комнату' }); return }
      const angle = turn(f.angleDeg)
      const here = check(f.id, f.catalogItemId, f.xCm, f.zCm, angle, f.roomId)
      let best: { x: number; z: number } | null = here.valid ? { x: f.xCm, z: f.zCm } : null
      // Поиск ближайшего свободного места кольцами по сетке: первое кольцо с допустимой точкой, внутри — ближайшая.
      for (let r = GRID_CM; !best && r <= 120; r += GRID_CM) {
        let bestD = Infinity
        const tryAt = (dx: number, dz: number) => {
          const dist = Math.hypot(dx, dz)
          if (dist >= bestD) return
          if (check(f.id, f.catalogItemId, f.xCm + dx, f.zCm + dz, angle, f.roomId).valid) { bestD = dist; best = { x: f.xCm + dx, z: f.zCm + dz } }
        }
        for (let dx = -r; dx <= r; dx += GRID_CM) { tryAt(dx, -r); tryAt(dx, r) }
        for (let dz = -r + GRID_CM; dz <= r - GRID_CM; dz += GRID_CM) { tryAt(-r, dz); tryAt(r, dz) }
      }
      const spot = best as { x: number; z: number } | null
      if (!spot) { set({ message: here.message ?? 'После поворота предмет не помещается' }); return }
      const res = commitMove(f, 'Поворот', { xCm: spot.x, zCm: spot.z, angleDeg: angle })
      set({ message: res.ok ? null : (res.message ?? 'Поворот недопустим') })
    },

    endDrag: () => {
      const d = get().draft
      if (!d) return
      set({ draft: null })
      if (!d.result.valid) {
        // Недопустимое отпускание: новый предмет не добавляется, существующий остаётся на месте.
        set({ message: d.result.message ?? 'Недопустимое положение' })
        return
      }
      if (d.mode === 'lift' && d.id && d.elevationCm !== undefined) {
        const cur = project.getState().history.present.furniture[d.id]
        if (cur && d.elevationCm !== cur.elevationCm) {
          const r = project.getState().apply('Высота подвеса', moveFurnitureCommand(catalog, d.id, { elevationCm: d.elevationCm }))
          set({ message: r.ok ? null : (r.issues[0]?.message ?? 'Такая высота недопустима') })
        } else set({ message: null })
        return
      }
      if (d.id) {
        const cur = project.getState().history.present.furniture[d.id]
        if (cur) commitMove(cur, 'Перенос', { xCm: d.xCm, zCm: d.zCm, angleDeg: d.angleDeg })
        set({ message: null })
      } else {
        const roomId = deps.roomId()
        if (!roomId) return
        const item = catalog[d.catalogItemId]
        const f: FurnitureInstance = { id: newId(), catalogItemId: item.id, assetVersion: item.version, roomId, xCm: d.xCm, zCm: d.zCm, elevationCm: d.result.elevationCm ?? 0, angleDeg: d.angleDeg }
        project.getState().apply('Добавление', addFurnitureCommand(f))
        set({ selectedId: f.id, message: null })
      }
    },

    cancelDrag: () => set({ draft: null }),

    addAtFreeSpot: (catalogItemId) => {
      const roomId = deps.roomId()
      const { minX, maxX, minZ, maxZ } = deps.spot()
      const points: Array<{ x: number; z: number }> = []
      for (let z = minZ; z <= maxZ; z += GRID_CM * 2) for (let x = minX; x <= maxX; x += GRID_CM * 2) points.push({ x, z })
      // Потолочный предмет (люстра) сначала пробуется в центре комнаты, остальные — по порядку обхода.
      if (catalog[catalogItemId]?.mount === 'ceiling') {
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
        points.sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz))
      }
      for (const pt of points) {
        const p = fit(catalogItemId, pt.x, pt.z, 0)
        const res = roomId ? check(null, catalogItemId, p.xCm, p.zCm, p.angleDeg) : null
        if (roomId && res?.valid) {
          const item = catalog[catalogItemId]
          const f: FurnitureInstance = { id: newId(), catalogItemId, assetVersion: item.version, roomId, xCm: p.xCm, zCm: p.zCm, elevationCm: res.elevationCm ?? defaultElevation(project.getState().history.present, item), angleDeg: p.angleDeg }
          project.getState().apply('Добавление', addFurnitureCommand(f))
          set({ selectedId: f.id, message: null })
          return
        }
      }
      set({ message: catalog[catalogItemId]?.mount === 'surface' ? 'Сначала поставьте стол или тумбу, на которую встанет предмет' : 'Нет свободного места для предмета' })
    },

    furnishRoom: (entries) => {
      const roomId = deps.roomId()
      if (!roomId) { set({ message: 'Нет активной комнаты' }); return }
      const res = planFurnish(project.getState().history.present, catalog, roomId, entries, newId)
      if (res.added.length === 0) { set({ message: 'Набор не поместился: в комнате нет свободного места' }); return }
      const r = project.getState().apply('Набор мебели', (a) => ({ ...a, furniture: { ...a.furniture, ...Object.fromEntries(res.added.map((f) => [f.id, f])) } }))
      if (!r.ok) { set({ message: r.issues[0]?.message ?? 'Набор не применён' }); return }
      set({ selectedId: null, message: res.skipped.length ? `Добавлено ${res.added.length}, не поместилось: ${res.skipped.join(', ')}` : null })
    },

    setElevation: (elevationCm) => {
      const sel = get().selectedId
      const f = sel ? project.getState().history.present.furniture[sel] : null
      if (!f || get().draft) return
      if (catalog[f.catalogItemId]?.mount !== 'wall') { set({ message: 'Высоту можно менять только у настенных предметов' }); return }
      if (!Number.isFinite(elevationCm)) { set({ message: 'Введите высоту числом в сантиметрах' }); return }
      const cm = Math.round(elevationCm)
      const res = validatePlacement(project.getState().history.present, catalog, {
        id: f.id, catalogItemId: f.catalogItemId, roomId: f.roomId, xCm: f.xCm, zCm: f.zCm, angleDeg: f.angleDeg, elevationCm: cm,
      })
      if (!res.valid) { set({ message: res.message ?? 'Такая высота недопустима' }); return }
      if (cm === f.elevationCm) { set({ message: null }); return }
      const r = project.getState().apply('Высота подвеса', moveFurnitureCommand(catalog, f.id, { elevationCm: cm }))
      set({ message: r.ok ? null : (r.issues[0]?.message ?? 'Такая высота недопустима') })
    },

    removeSelected: () => {
      const id = get().selectedId
      if (!id) return
      project.getState().apply('Удаление', removeFurnitureCommand(id, catalog))
      set({ selectedId: null })
    },
  }))
}
