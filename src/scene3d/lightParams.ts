import * as THREE from 'three'

/**
 * Единые параметры света и цвета (SPEC §13, задача 16.1). Интерактивная сцена и «Качественный снимок»
 * читают одни и те же значения: направление солнца, цвет неба и тональное отображение не расходятся.
 * Значения подобраны по эталонной комнате и снимкам этапа 16 (docs/reports/stage16).
 */
export const LIGHT = {
  background: '#0b0b0b', // как --bg в src/ui/tokens.css: 3D сливается с оформлением приложения
  /** Направление на солнце (от центра комнаты, в единицах сцены): сверху сбоку, как у окна. */
  sunDirection: new THREE.Vector3(3, 6, 2).normalize(),
  sunColor: '#fff4e6',
  hemisphere: { sky: '#ffffff', ground: '#6b6f7a', intensity: 0.55 },
  sunIntensity: 2.2,
  environmentIntensity: 0.7,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1,
  /** Свет трассировки: собственные источники (D-09); небо задаётся градиентом, а не картой окружения интерактива. */
  trace: {
    sunIntensity: 4.5,
    skyIntensity: 1,
    skyTop: '#a9c6ec',
    skyHorizon: '#f3efe8',
    bounces: 3,
    transmissiveBounces: 2,
    filterGlossyFactor: 0.5,
  },
} as const

/** Границы области, которую охватывает тень солнца (см). */
export interface LightBounds { minX: number; maxX: number; minZ: number; maxZ: number }

/** Положение солнца и размер ортографической камеры теней под размер комнаты. */
export function sunFor(bounds: LightBounds): { position: [number, number, number]; target: [number, number, number]; radius: number } {
  const cx = (bounds.minX + bounds.maxX) / 200 // см → единицы сцены, центр
  const cz = (bounds.minZ + bounds.maxZ) / 200
  const radius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 200 / 2 + 1
  const d = LIGHT.sunDirection
  const dist = radius * 3 + 6
  return { position: [cx + d.x * dist, d.y * dist, cz + d.z * dist], target: [cx, 0, cz], radius }
}
