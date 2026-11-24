import { CEILING_LIGHT, CEILING_LIGHT_DROP_CM } from '../catalog/lights'
import { elevationOf, type Catalog } from '../domain/placement'
import type { Apartment, Id } from '../domain/types'
import { localToWorld } from '../geometry/placement'

/**
 * Искусственный свет комнаты (этап 21, SPEC D-11, D-14): какие источники есть и какие из них светят.
 * Чистые функции: сцена берёт результат как есть, «Качественный снимок» видит те же источники через сцену.
 */

/** Предел одновременно светящих источников (D-08): остальные не светят, пока их число не уменьшится. */
export const MAX_ACTIVE_LIGHTS = 6

export interface Emitter {
  /** Устойчивый ключ: 'ceiling' или id предмета. */
  key: string
  kind: 'ceiling' | 'chandelier' | 'lamp'
  /** Положение в см: x, z — на плане, y — над полом. */
  xCm: number
  yCm: number
  zCm: number
  colorHex: string
  intensityCd: number
  glowRadiusCm: number
}

export interface RoomLightSet {
  /** Все источники комнаты по порядку важности: потолочный или люстры, затем светильники по идентификатору. */
  all: Emitter[]
  /** Первые MAX_ACTIVE_LIGHTS: именно они светят. */
  active: Emitter[]
  /** Сколько источников не светят из-за предела. */
  dropped: number
}

/**
 * Ограничение числа источников по близости к игроку (режим «Прогулка», D-17): главный источник комнаты остаётся первым
 * (он даёт тени), остальные — ближайшие к игроку, не больше max.
 */
export function nearestLights(all: Emitter[], pos: { x: number; z: number }, max = MAX_ACTIVE_LIGHTS): Emitter[] {
  const [main, ...rest] = all
  if (!main) return []
  const d = (e: Emitter) => Math.hypot(e.xCm - pos.x, e.zCm - pos.z)
  return [main, ...rest.sort((a, b) => d(a) - d(b))].slice(0, max)
}

export function roomLights(
  apt: Apartment, catalog: Catalog, roomId: Id, centre: { x: number; z: number },
): RoomLightSet {
  const items = Object.values(apt.furniture).filter((f) => f.roomId === roomId && catalog[f.catalogItemId]?.light)
  const toEmitter = (f: (typeof items)[number]): Emitter => {
    const item = catalog[f.catalogItemId]
    const l = item.light!
    const off = localToWorld(l.offsetCm.x, l.offsetCm.z, f.angleDeg)
    return {
      key: f.id, kind: l.chandelier ? 'chandelier' : 'lamp',
      xCm: f.xCm + off.x, zCm: f.zCm + off.z, yCm: elevationOf(apt, item, f) + l.offsetCm.y,
      colorHex: l.colorHex, intensityCd: l.intensityCd, glowRadiusCm: l.glowRadiusCm,
    }
  }
  const byId = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key, 'en', { numeric: true })
  const chandeliers = items.filter((f) => catalog[f.catalogItemId].light!.chandelier).map(toEmitter).sort(byId)
  const lamps = items.filter((f) => !catalog[f.catalogItemId].light!.chandelier).map(toEmitter).sort(byId)
  // Стандартный подвесной светильник скрывается, если в комнате есть люстра (D-14): люстра берёт на себя его место и выключатель.
  const main: Emitter[] = chandeliers.length > 0 ? chandeliers : [{
    key: 'ceiling', kind: 'ceiling', xCm: centre.x, zCm: centre.z, yCm: apt.ceilingHeightCm - CEILING_LIGHT_DROP_CM,
    colorHex: CEILING_LIGHT.colorHex, intensityCd: CEILING_LIGHT.intensityCd, glowRadiusCm: CEILING_LIGHT.glowRadiusCm,
  }]
  const all = [...main, ...lamps]
  const active = all.slice(0, MAX_ACTIVE_LIGHTS)
  return { all, active, dropped: all.length - active.length }
}
