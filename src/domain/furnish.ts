import type { SetEntry } from '../catalog/sets'
import { localToWorld } from '../geometry/placement'
import { signedArea, type Pt } from '../geometry/polygon'
import { analyzeClearance } from './clearance'
import { roomClearPolygon } from './derive'
import { openingFrame } from './doors'
import { defaultElevation, snapToWall, validatePlacement, type Catalog } from './placement'
import type { Apartment, FurnitureInstance, Id } from './types'

/**
 * Расстановка готового набора (этап 4 доработок, SPEC D-33): для каждого предмета перебираются допустимые положения,
 * выбирается то, что не создаёт новых замечаний по проходам и лучше подходит по правилу набора. Чистая функция:
 * проект не меняется, возвращаются новые предметы; применять их нужно одной командой (одна отмена на весь набор).
 */
const STEP_WALL_CM = 10
const STEP_CENTER_CM = 10
const TOP_CANDIDATES = 12

interface Cand { xCm: number; zCm: number; angleDeg: number; base: number; elevationCm?: number }

const norm = (a: number) => ((Math.round(a * 1000) / 1000) % 360 + 360) % 360

/** Положения напольного предмета задней стороной к каждой стене с шагом вдоль стены. */
function wallCandidates(clear: Pt[], zBackCm: number): Array<{ xCm: number; zCm: number; angleDeg: number }> {
  const orient = Math.sign(signedArea(clear)) || 1
  const out: Array<{ xCm: number; zCm: number; angleDeg: number }> = []
  for (let i = 0; i < clear.length; i++) {
    const a = clear[i], b = clear[(i + 1) % clear.length]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len < 1) continue
    const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
    const n = { x: -u.z * orient, z: u.x * orient }
    const angleDeg = norm((Math.atan2(n.x, n.z) * 180) / Math.PI)
    const back = localToWorld(0, zBackCm, angleDeg)
    for (let t = 0; t <= len; t += STEP_WALL_CM) out.push({ xCm: a.x + u.x * t - back.x, zCm: a.z + u.z * t - back.z, angleDeg })
  }
  return out
}

export interface FurnishResult {
  /** Новые предметы (идентификаторы заданы newId). */
  added: FurnitureInstance[]
  /** Что не поместилось: названия из каталога. */
  skipped: string[]
}

export function planFurnish(apt: Apartment, catalog: Catalog, roomId: Id, entries: SetEntry[], newId: () => Id): FurnishResult {
  const room = apt.rooms[roomId]
  if (!room) return { added: [], skipped: entries.map((e) => e.id) }
  const clear = roomClearPolygon(apt, room)
  const xs = clear.map((p) => p.x), zs = clear.map((p) => p.z)
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
  const doors = Object.values(apt.openings).filter((o) => o.kind === 'door' && room.boundary.some((b) => b.wallId === o.wallId)).map((o) => {
    const f = openingFrame(apt, o, roomId)
    return { x: (f.p0.x + f.p1.x) / 2, z: (f.p0.z + f.p1.z) / 2 }
  })
  const doorDist = (x: number, z: number) => (doors.length ? Math.min(...doors.map((d) => Math.hypot(d.x - x, d.z - z))) : 0)

  let work = apt
  const placed: Array<FurnitureInstance | null> = []
  const added: FurnitureInstance[] = []
  const skipped: string[] = []

  for (const entry of entries) {
    const item = catalog[entry.id]
    const ref = entry.ref !== undefined ? placed[entry.ref] : null
    let cands: Cand[] = []
    if (!item) { placed.push(null); continue }
    if (entry.place === 'on') {
      if (ref) cands = [{ xCm: ref.xCm, zCm: ref.zCm, angleDeg: ref.angleDeg, base: 0 }]
    } else if (item.mount === 'ceiling') {
      cands = [{ xCm: centre.x, zCm: centre.z, angleDeg: 0, base: 0 }]
    } else if (item.mount === 'wall') {
      const seen = new Set<string>()
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 20) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 20) {
        const p = snapToWall(work, catalog, { id: null, catalogItemId: item.id, roomId, xCm: x, zCm: z, angleDeg: 0 })
        const key = `${Math.round(p.xCm)}|${Math.round(p.zCm)}|${Math.round(p.angleDeg)}`
        if (!seen.has(key)) { seen.add(key); cands.push({ ...p, base: -doorDist(p.xCm, p.zCm) * 0.2 }) }
      }
    } else if (entry.place === 'wall' && item.colliders.length > 0) {
      const zBack = Math.min(...item.colliders.map((c) => c.zCm - c.depthCm / 2))
      cands = wallCandidates(clear, zBack).map((p) => ({ ...p, base: -doorDist(p.xCm, p.zCm) * 0.5 }))
    } else {
      const target = ref ?? { xCm: centre.x, zCm: centre.z }
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += STEP_CENTER_CM) for (let z = Math.min(...zs); z <= Math.max(...zs); z += STEP_CENTER_CM) {
        cands.push({ xCm: x, zCm: z, angleDeg: ref ? ref.angleDeg : 0, base: Math.hypot(x - target.xCm, z - target.zCm) })
      }
    }

    // Допустимые положения, лучшие по правилу набора; из них — то, что не добавляет замечаний по проходам.
    const valid: Cand[] = []
    for (const c of cands) {
      const res = validatePlacement(work, catalog, { id: null, catalogItemId: item.id, roomId, xCm: c.xCm, zCm: c.zCm, angleDeg: c.angleDeg })
      if (res.valid) valid.push({ ...c, elevationCm: res.elevationCm ?? defaultElevation(work, item) })
    }
    valid.sort((p, q) => p.base - q.base)
    const baseline = analyzeClearance(work, catalog, roomId).length
    let best: { c: Cand; issues: number } | null = null
    for (const c of valid.slice(0, TOP_CANDIDATES)) {
      const probe: FurnitureInstance = { id: '__probe', catalogItemId: item.id, assetVersion: item.version, roomId, xCm: c.xCm, zCm: c.zCm, elevationCm: c.elevationCm ?? 0, angleDeg: c.angleDeg }
      const issues = analyzeClearance({ ...work, furniture: { ...work.furniture, [probe.id]: probe } }, catalog, roomId).length - baseline
      if (!best || issues < best.issues) best = { c, issues }
      if (issues <= 0) break
    }
    if (!best) { skipped.push(item.name); placed.push(null); continue }
    const f: FurnitureInstance = { id: newId(), catalogItemId: item.id, assetVersion: item.version, roomId, xCm: best.c.xCm, zCm: best.c.zCm, elevationCm: best.c.elevationCm ?? 0, angleDeg: best.c.angleDeg }
    work = { ...work, furniture: { ...work.furniture, [f.id]: f } }
    placed.push(f)
    added.push(f)
  }
  return { added, skipped }
}
