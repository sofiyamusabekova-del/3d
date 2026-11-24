import type * as THREE from 'three'
import { CATALOG } from '../catalog/catalog'
import type { Apartment, Id } from '../domain/types'

/**
 * Контракт снимка (SPEC §13, задача 17.1): данные о проекте и камере, по которым строится
 * «Качественный снимок». Чистые функции без WebGL: ключ состояния, описание и проверка соответствия сцены.
 * Любое изменение проекта или камеры меняет ключ — прежний снимок становится неактуальным (17.4).
 */

export interface ShotCamera {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  fov: number
  near: number
  far: number
}

export interface ShotFurniture { id: Id; catalogItemId: Id; xCm: number; zCm: number; angleDeg: number }

export interface ShotSnapshot {
  key: string
  roomId: Id
  roomName: string
  camera: ShotCamera
  width: number
  height: number
  furniture: ShotFurniture[]
  openings: number
  finishes: number
}

/** Быстрый 53-битный хеш строки (cyrb53): ключ снимка, не криптография. */
export function hashString(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4

/** Ключ состояния: проект целиком, комната и камера (с округлением, чтобы дрожание чисел не считалось изменением). */
export function snapshotKey(apt: Apartment, roomId: Id, cam: ShotCamera): string {
  return hashString(JSON.stringify([apt, roomId, cam.position.map(r4), cam.quaternion.map(r4), r4(cam.fov)]))
}

export function takeSnapshot(apt: Apartment, roomId: Id, cam: ShotCamera, size: { width: number; height: number }): ShotSnapshot {
  const room = apt.rooms[roomId]
  if (!room) throw new Error('Комната снимка не найдена в проекте')
  const wallIds = new Set(room.boundary.map((b) => b.wallId))
  return {
    key: snapshotKey(apt, roomId, cam),
    roomId,
    roomName: room.name,
    camera: cam,
    width: size.width,
    height: size.height,
    furniture: Object.values(apt.furniture)
      .filter((f) => f.roomId === roomId)
      .map((f) => ({ id: f.id, catalogItemId: f.catalogItemId, xCm: f.xCm, zCm: f.zCm, angleDeg: f.angleDeg })),
    openings: Object.values(apt.openings).filter((o) => wallIds.has(o.wallId)).length,
    finishes: Object.keys(apt.surfaceMaterials).filter((k) => k.endsWith(`|${roomId}`)).length,
  }
}

export const cameraOf = (c: THREE.PerspectiveCamera): ShotCamera => ({
  position: c.position.toArray() as [number, number, number],
  quaternion: c.quaternion.toArray() as [number, number, number, number],
  fov: c.fov,
  near: c.near,
  far: c.far,
})

/** Расхождения между описанием снимка и сценой трассировки; пустой список — сцена соответствует проекту. */
export function verifyTraceScene(scene: THREE.Scene, snap: ShotSnapshot, toleranceCm = 0.2): string[] {
  const problems: string[] = []
  const groups = new Map<string, THREE.Object3D>()
  scene.traverse((o) => { if (o.name.startsWith('furniture-')) groups.set(o.name.slice('furniture-'.length), o) })
  for (const f of snap.furniture) {
    const g = groups.get(f.id)
    if (!g) { problems.push(`предмет «${CATALOG[f.catalogItemId]?.name ?? f.catalogItemId}» (${f.id}) отсутствует в сцене`); continue }
    const dx = Math.abs(g.position.x * 100 - f.xCm), dz = Math.abs(g.position.z * 100 - f.zCm)
    if (dx > toleranceCm || dz > toleranceCm) problems.push(`предмет ${f.id} сдвинут: ${dx.toFixed(1)} × ${dz.toFixed(1)} см`)
    let hasMesh = false
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) hasMesh = true })
    if (!hasMesh) problems.push(`у предмета ${f.id} нет геометрии (модель не загружена)`)
  }
  for (const id of groups.keys()) if (!snap.furniture.some((f) => f.id === id)) problems.push(`в сцене лишний предмет ${id}`)
  return problems
}
