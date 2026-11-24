import type { FloorCovering, FloorKind } from '../domain/types'

/**
 * Покрытия пола (этап 23, SPEC D-16): ламинат, линолеум, ковролин, у каждого три цвета. Текстуры процедурные,
 * без загрузки файлов (src/scene3d/floorTexture.ts), поэтому в проекте хранятся только вид и id цвета.
 * tileCm — физический размер одного повтора рисунка: ламинат — 4 доски 19 × 120 см в шахматном порядке.
 */
export interface FloorColor { id: string; name: string; hex: string }
export interface FloorKindDef {
  kind: FloorKind
  name: string
  tileCm: { widthCm: number; heightCm: number }
  roughness: number
  colors: FloorColor[]
}

export const BOARD_CM = { widthCm: 19, lengthCm: 120 } as const
export const BOARD_ROWS = 4

export const FLOORS: Record<FloorKind, FloorKindDef> = {
  laminate: {
    kind: 'laminate', name: 'Ламинат', roughness: 0.5,
    tileCm: { widthCm: BOARD_CM.lengthCm, heightCm: BOARD_CM.widthCm * BOARD_ROWS },
    colors: [
      { id: 'oak_light', name: 'Дуб светлый', hex: '#d3b185' },
      { id: 'oak_natural', name: 'Дуб натуральный', hex: '#a9814f' },
      { id: 'walnut_dark', name: 'Орех тёмный', hex: '#5f4430' },
    ],
  },
  linoleum: {
    kind: 'linoleum', name: 'Линолеум', roughness: 0.42,
    tileCm: { widthCm: 100, heightCm: 100 },
    colors: [
      { id: 'lino_gray', name: 'Серый', hex: '#b4b6b8' },
      { id: 'lino_beige', name: 'Бежевый', hex: '#cdbf9e' },
      { id: 'lino_graphite', name: 'Графит', hex: '#575a60' },    ],
  },
  carpet: {
    kind: 'carpet', name: 'Ковролин', roughness: 1,
    tileCm: { widthCm: 50, heightCm: 50 },
    colors: [
      { id: 'carpet_gray', name: 'Серый', hex: '#8c8f95' },
      { id: 'carpet_beige', name: 'Бежевый', hex: '#bfb19a' },
      { id: 'carpet_blue', name: 'Синий', hex: '#3e5878' },
    ],
  },
}

export const FLOOR_KINDS: FloorKind[] = ['laminate', 'linoleum', 'carpet']

/** Цвет покрытия по записи проекта; undefined, если вида или цвета нет в реестре. */
export const floorColorOf = (c: FloorCovering): FloorColor | undefined => FLOORS[c.kind]?.colors.find((x) => x.id === c.colorId)

/** Известно ли реестру такое покрытие: проверка целостности проекта. */
export const isKnownFloor = (c: FloorCovering): boolean => Boolean(floorColorOf(c))

/** Цвет для плана и образцов. */
export const floorSwatchHex = (c: FloorCovering | undefined): string | null => (c ? floorColorOf(c)?.hex ?? null : null)

/** Цвет пола комнаты без покрытия. */
export const DEFAULT_FLOOR_HEX = '#8a8f9c'
