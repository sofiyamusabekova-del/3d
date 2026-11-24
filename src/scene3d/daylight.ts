import * as THREE from 'three'

/**
 * Модель времени суток (этап 20): по часу 0–24 даёт положение солнца и луны, цвет и силу света, цвета неба.
 * Чистые функции без обращения к сцене: интерактивная 3D-сцена и «Качественный снимок» читают одни и те же значения.
 *
 * Солнце идёт по настоящей небесной траектории: широта 50° с. ш., склонение +10° (весна или осень, день около 11,6 ч),
 * солнечное время. Север — вверх на плане (−Z сцены), восток — вправо (+X). Утром солнце в восточных окнах,
 * в полдень — на юге и высоко (около 50°), вечером — в западных; ночью светит луна напротив солнца.
 */

export const LATITUDE_DEG = 50
export const DECLINATION_DEG = 10
export { DEFAULT_HOUR, formatHour, wrapHour } from './hour'
import { wrapHour } from './hour'

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** Плавный переход 0→1 между a и b; при a > b — обратный (1→0). */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

export interface SunPosition {
  /** Высота над горизонтом, градусы (ниже нуля — солнце за горизонтом). */
  altitudeDeg: number
  /** Азимут от севера по часовой стрелке, градусы. */
  azimuthDeg: number
  /** Единичный вектор «на солнце» в осях сцены (+X восток, +Y вверх, −Z север). */
  direction: [number, number, number]
}

export function sunPosition(hour: number): SunPosition {
  const phi = rad(LATITUDE_DEG)
  const delta = rad(DECLINATION_DEG)
  const H = rad((wrapHour(hour) - 12) * 15)
  const sinAlt = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  const cosAz = (Math.sin(delta) - sinAlt * Math.sin(phi)) / (Math.cos(alt) * Math.cos(phi) || 1e-9)
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)))
  if (Math.sin(H) > 0) az = 2 * Math.PI - az // после полудня солнце уходит на запад
  const ca = Math.cos(alt)
  return {
    altitudeDeg: deg(alt),
    azimuthDeg: deg(az),
    direction: [Math.sin(az) * ca, Math.sin(alt), -Math.cos(az) * ca],
  }
}

/** Опорные точки неба по высоте солнца: верх неба, горизонт, цвета и сила рассеянного света, окружение. */
const SKY_STOPS = [
  { alt: -18, top: '#04071a', horizon: '#0b1230', hemiSky: '#2c3a6e', hemiGround: '#0c0e14', hemi: 0.2, env: 0.1 },
  { alt: -6, top: '#141c46', horizon: '#3b3f72', hemiSky: '#46558c', hemiGround: '#14161d', hemi: 0.26, env: 0.2 },
  { alt: 0, top: '#2f4a8a', horizon: '#ff7a3a', hemiSky: '#e8b49c', hemiGround: '#4a4038', hemi: 0.3, env: 0.28 },
  { alt: 4, top: '#4670b8', horizon: '#ff9a55', hemiSky: '#f2cdb4', hemiGround: '#544c44', hemi: 0.34, env: 0.36 },
  { alt: 12, top: '#4f86d6', horizon: '#f6c694', hemiSky: '#f3e6dc', hemiGround: '#5e6068', hemi: 0.36, env: 0.4 },
  { alt: 28, top: '#3f86e6', horizon: '#a9cdf0', hemiSky: '#e6f0ff', hemiGround: '#6b6f7a', hemi: 0.38, env: 0.44 },
  { alt: 60, top: '#3279e0', horizon: '#b4d6f5', hemiSky: '#ffffff', hemiGround: '#6b6f7a', hemi: 0.4, env: 0.46 },
] as const

/** Цвет прямого солнца по высоте: красноватый у горизонта, тёплый белый днём. */
const SUN_COLORS = [
  { alt: 0, color: '#ff7f36' },
  { alt: 6, color: '#ffa860' },
  { alt: 18, color: '#ffdcb0' },
  { alt: 45, color: '#fff3e4' },
] as const

function lerpStops<T extends { alt: number }>(stops: readonly T[], alt: number, pick: (s: T) => string): string {
  if (alt <= stops[0].alt) return pick(stops[0])
  for (let i = 1; i < stops.length; i++) {
    if (alt <= stops[i].alt) {
      const a = stops[i - 1], b = stops[i]
      return `#${new THREE.Color(pick(a)).lerp(new THREE.Color(pick(b)), (alt - a.alt) / (b.alt - a.alt)).getHexString()}`
    }
  }
  return pick(stops[stops.length - 1])
}
function lerpNumber<T extends { alt: number }>(stops: readonly T[], alt: number, pick: (s: T) => number): number {
  if (alt <= stops[0].alt) return pick(stops[0])
  for (let i = 1; i < stops.length; i++) {
    if (alt <= stops[i].alt) return mix(pick(stops[i - 1]), pick(stops[i]), (alt - stops[i - 1].alt) / (stops[i].alt - stops[i - 1].alt))
  }
  return pick(stops[stops.length - 1])
}

export interface Daylight {
  hour: number
  sun: SunPosition
  /** Единичный вектор «на луну»: напротив солнца. */
  moonDirection: [number, number, number]
  /** Единственный направленный источник сцены: солнце днём, луна ночью. */
  light: { direction: [number, number, number]; color: string; intensity: number; isMoon: boolean }
  sky: { top: string; horizon: string }
  hemisphere: { sky: string; ground: string; intensity: number }
  environmentIntensity: number
  /** 0 днём → 1 глубокой ночью: звёзды и огни в окнах домов. */
  night: number
  /** 0 — день, 1 — ночь: затемнение света и яркость диска луны. */
  moonAlpha: number
}

/** Пик силы прямого солнца и луны (до тонального отображения; прежнее фиксированное солнце — 2,2). */
const SUN_PEAK = 5.5
const MOON_PEAK = 0.42
export const MOON_COLOR = '#9fb8ff'

export function daylightAt(hourRaw: number): Daylight {
  const hour = wrapHour(hourRaw)
  const sun = sunPosition(hour)
  const alt = sun.altitudeDeg
  const [sx, sy, sz] = sun.direction
  const moonDirection: [number, number, number] = [-sx, -sy, -sz]
  const moonAlt = -alt

  const sinAlt = Math.max(0, sy)
  const sunIntensity = SUN_PEAK * Math.pow(sinAlt, 0.5) * smooth(-0.5, 8, alt)
  const nightFactor = smooth(-3, -12, alt) // луна светит, когда солнце ниже −3°
  const moonIntensity = MOON_PEAK * nightFactor * smooth(0, 10, moonAlt)
  const useMoon = alt < -0.5

  return {
    hour,
    sun,
    moonDirection,
    light: useMoon
      ? { direction: moonDirection, color: MOON_COLOR, intensity: moonIntensity, isMoon: true }
      : { direction: sun.direction, color: lerpStops(SUN_COLORS, alt, (s) => s.color), intensity: sunIntensity, isMoon: false },
    sky: { top: lerpStops(SKY_STOPS, alt, (s) => s.top), horizon: lerpStops(SKY_STOPS, alt, (s) => s.horizon) },
    hemisphere: {
      sky: lerpStops(SKY_STOPS, alt, (s) => s.hemiSky),
      ground: lerpStops(SKY_STOPS, alt, (s) => s.hemiGround),
      intensity: lerpNumber(SKY_STOPS, alt, (s) => s.hemi),
    },
    environmentIntensity: lerpNumber(SKY_STOPS, alt, (s) => s.env),
    night: smooth(-3, -12, alt),
    moonAlpha: 0.25 + 0.75 * smooth(-3, -12, alt),
  }
}

/** Быстрые значения часа для кнопок «Утро», «День», «Вечер», «Ночь». */
export const HOUR_PRESETS = [
  { label: 'Утро', hour: 8 },
  { label: 'День', hour: 13 },
  { label: 'Вечер', hour: 18.5 },
  { label: 'Ночь', hour: 23 },
] as const

/** Положение и размер ортографической камеры теней под размер комнаты и направление света. */
export function lightRig(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  direction: readonly [number, number, number],
): { position: [number, number, number]; target: [number, number, number]; radius: number } {
  const cx = (bounds.minX + bounds.maxX) / 200
  const cz = (bounds.minZ + bounds.maxZ) / 200
  const radius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 200 / 2 + 1.5
  const dist = radius * 3 + 6
  // Низкое солнце не опускается к самому горизонту: у тени остаётся конечная длина, камера теней не вырождается.
  const d = new THREE.Vector3(...direction)
  d.y = Math.max(d.y, 0.08)
  d.normalize()
  return { position: [cx + d.x * dist, d.y * dist, cz + d.z * dist], target: [cx, 0, cz], radius }
}
