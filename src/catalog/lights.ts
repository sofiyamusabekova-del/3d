import type { LightSpec } from '../domain/types'

/**
 * Свет предметов каталога (этап 21, SPEC D-11, D-14): положение источника в локальных осях предмета, цвет, сила и размер
 * видимого свечения. Сила света в кандела (PointLight three.js, затухание физическое): подобрана по снимкам этапа 21 так,
 * чтобы ночью комната читалась при одной лампе, а несколько ламп не пересвечивали её.
 */
const WARM = '#ffd9a0'
const WARM_SOFT = '#ffcf8a'

export const LIGHT_SPECS: Record<string, LightSpec> = {
  // Торшеры: источник у верха абажура.
  kenney_lampRoundFloor: { offsetCm: { x: 0, y: 140, z: 0 }, colorHex: WARM, intensityCd: 5, glowRadiusCm: 6 },
  kenney_lampSquareFloor: { offsetCm: { x: 0, y: 130, z: 0 }, colorHex: WARM, intensityCd: 5, glowRadiusCm: 6 },
  fm_floor_lamp_arc: { offsetCm: { x: 0, y: 165, z: 0 }, colorHex: WARM, intensityCd: 5, glowRadiusCm: 6 },
  fm_floor_lamp_pleated: { offsetCm: { x: 0, y: 135, z: 0 }, colorHex: WARM, intensityCd: 5, glowRadiusCm: 6 },
  // Настольные лампы.
  fm_table_lamp_wood: { offsetCm: { x: 0, y: 38, z: 0 }, colorHex: WARM_SOFT, intensityCd: 2.5, glowRadiusCm: 4 },
  kenney_lampRoundTable: { offsetCm: { x: 0, y: 32, z: 0 }, colorHex: WARM_SOFT, intensityCd: 2.5, glowRadiusCm: 4 },
  kenney_lampSquareTable: { offsetCm: { x: 0, y: 28, z: 0 }, colorHex: WARM_SOFT, intensityCd: 2.5, glowRadiusCm: 4 },
  // Бра: свет чуть впереди стены.
  kenney_lampWall: { offsetCm: { x: 0, y: 6, z: 16 }, colorHex: WARM, intensityCd: 1, glowRadiusCm: 3 },
  // Люстры: свет у нижней части (y от основания люстры, висящей от потолка); у люстр шар свечения мал, лампочки светятся сами.
  own_chandelier_classic: { offsetCm: { x: 0, y: 30, z: 0 }, colorHex: WARM, intensityCd: 12, glowRadiusCm: 3, chandelier: true },
  own_chandelier_round: { offsetCm: { x: 0, y: 1, z: 0 }, colorHex: '#fff1dc', intensityCd: 12, glowRadiusCm: 4, chandelier: true },
  kenney_lampSquareCeiling: { offsetCm: { x: 0, y: 6, z: 0 }, colorHex: WARM, intensityCd: 10, glowRadiusCm: 5, chandelier: true },
}

/** Высота подвеса настенных предметов по умолчанию, см над полом (низ предмета); в интерфейсе меняется. */
export const WALL_MOUNT_HEIGHT_CM: Record<string, number> = {
  kenney_lampWall: 160,
  own_tv_wall: 100,
  own_picture: 130,
  own_mirror: 90,
  own_shelf_wall: 120,
  own_clock_wall: 180,
  fm_tv_wall: 20, // подвесная ТВ-стенка 175 см: нижний край в 20 см от пола, выше потолка не уйдёт (проверка высоты)
}

/** Стандартный потолочный светильник комнаты (D-11): он есть в каждой комнате, пока в ней нет люстры. */
export const CEILING_LIGHT: LightSpec = { offsetCm: { x: 0, y: 0, z: 0 }, colorHex: '#fff0d8', intensityCd: 10, glowRadiusCm: 7 }
/** Высота подвеса стандартного светильника под потолком, см. */
export const CEILING_LIGHT_DROP_CM = 25
