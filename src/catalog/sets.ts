import type { RoomType } from '../domain/types'

/**
 * Готовые наборы мебели по типу помещения (этап 4 доработок, SPEC D-33). Расставляет `domain/furnish.ts`.
 * place: 'wall' — к стене задней стороной (настенные предметы — на стену), 'center' — ближе к середине комнаты (или к
 * предмету `near`), 'on' — на предмет `on` (индекс в наборе), для настольных предметов.
 */
export interface SetEntry {
  id: string
  place: 'wall' | 'center' | 'on'
  /** Для 'on': индекс опоры в этом же наборе. Для 'center': необязательный индекс предмета, рядом с которым ставить. */
  ref?: number
}

const LIVING: SetEntry[] = [
  { id: 'sofa_02', place: 'wall' },
  { id: 'modern_coffee_table_01', place: 'center', ref: 0 },
  { id: 'kenney_cabinetTelevision', place: 'wall' },
  { id: 'kenney_televisionModern', place: 'on', ref: 2 },
  { id: 'ArmChair_01', place: 'wall' },
  { id: 'kenney_lampRoundFloor', place: 'wall' },
  { id: 'own_picture', place: 'wall' },
  { id: 'potted_plant_04', place: 'wall' },
]

const KITCHEN: SetEntry[] = [
  { id: 'kenney_kitchenFridge', place: 'wall' },
  { id: 'kenney_kitchenSink', place: 'wall' },
  { id: 'kenney_kitchenStove', place: 'wall' },
  { id: 'kenney_kitchenCabinet', place: 'wall' },
  { id: 'wooden_table_02', place: 'center' },
  { id: 'dining_chair_02', place: 'center', ref: 4 },
  { id: 'dining_chair_02', place: 'center', ref: 4 },
  { id: 'own_clock_wall', place: 'wall' },
]

const BEDROOM: SetEntry[] = [
  { id: 'kenney_bedDouble', place: 'wall' },
  { id: 'painted_wooden_nightstand', place: 'wall' },
  { id: 'kenney_lampSquareTable', place: 'on', ref: 1 },
  { id: 'kenney_bookcaseClosedDoors', place: 'wall' },
  { id: 'drawer_cabinet', place: 'wall' },
  { id: 'own_picture', place: 'wall' },
  { id: 'own_mirror', place: 'wall' },
]

const BATH: SetEntry[] = [
  { id: 'kenney_bathtub', place: 'wall' },
  { id: 'kenney_bathroomSink', place: 'wall' },
  { id: 'kenney_toilet', place: 'wall' },
  { id: 'kenney_washer', place: 'wall' },
  { id: 'own_mirror', place: 'wall' },
]

const TOILET: SetEntry[] = [
  { id: 'kenney_toilet', place: 'wall' },
  { id: 'kenney_bathroomSink', place: 'wall' },
  { id: 'own_mirror', place: 'wall' },
]

const HALL: SetEntry[] = [
  { id: 'kenney_coatRackStanding', place: 'wall' },
  { id: 'ClassicConsole_01', place: 'wall' },
  { id: 'painted_wooden_bench', place: 'wall' },
  { id: 'own_mirror', place: 'wall' },
]

// Набор «Лофт»: тёмное дерево, металл, открытые стеллажи, дуговые торшеры, барные стулья. Только предметы каталога.
const LOFT_LIVING: SetEntry[] = [
  { id: 'sofa_02', place: 'wall' },
  { id: 'modern_coffee_table_01', place: 'center', ref: 0 },
  { id: 'fm_tv_stand_walnut', place: 'wall' },
  { id: 'kenney_televisionModern', place: 'on', ref: 2 },
  { id: 'Shelf_01', place: 'wall' },
  { id: 'fm_floor_lamp_arc', place: 'wall' },
  { id: 'kenney_speaker', place: 'wall' },
  { id: 'fm_planter_fluted', place: 'wall' },
  { id: 'own_shelf_wall', place: 'wall' },
  { id: 'own_clock_wall', place: 'wall' },
]

const LOFT_KITCHEN: SetEntry[] = [
  { id: 'kenney_kitchenFridge', place: 'wall' },
  { id: 'kenney_kitchenSink', place: 'wall' },
  { id: 'kenney_kitchenStove', place: 'wall' },
  { id: 'kenney_kitchenCabinet', place: 'wall' },
  { id: 'wooden_table_02', place: 'center' },
  { id: 'bar_chair_round_01', place: 'center', ref: 4 },
  { id: 'bar_chair_round_01', place: 'center', ref: 4 },
  { id: 'own_shelf_wall', place: 'wall' },
]

const LOFT_BEDROOM: SetEntry[] = [
  { id: 'fm_bed_lowprofile', place: 'wall' },
  { id: 'painted_wooden_nightstand', place: 'wall' },
  { id: 'fm_table_lamp_wood', place: 'on', ref: 1 },
  { id: 'fm_wardrobe_wood', place: 'wall' },
  { id: 'Shelf_01', place: 'wall' },
  { id: 'own_mirror', place: 'wall' },
  { id: 'fm_plant_peperomia', place: 'on', ref: 4 },
]

const LOFT_HALL: SetEntry[] = [
  { id: 'kenney_coatRackStanding', place: 'wall' },
  { id: 'painted_wooden_shelves', place: 'wall' },
  { id: 'wooden_stool_01', place: 'wall' },
  { id: 'own_mirror', place: 'wall' },
]

export const LOFT_SETS: Partial<Record<RoomType, { name: string; entries: SetEntry[] }>> = {
  living: { name: 'Лофт, гостиная: диван, ореховая ТВ-тумба, стеллаж, дуговой торшер', entries: LOFT_LIVING },
  kitchenLiving: { name: 'Лофт, кухня-гостиная: диван, ТВ-тумба, кухонные модули, стол с барными стульями', entries: [...LOFT_LIVING.slice(0, 4), ...LOFT_KITCHEN.slice(0, 7).map((e) => (e.ref === undefined ? e : { ...e, ref: e.ref + 4 }))] },
  kitchen: { name: 'Лофт, кухня: модули, стол с барными стульями, полка', entries: LOFT_KITCHEN },
  bedroom: { name: 'Лофт, спальня: низкая кровать, шкаф, стеллаж', entries: LOFT_BEDROOM },
  hallway: { name: 'Лофт, прихожая: вешалка, этажерка, табурет', entries: LOFT_HALL },
}

type SetMap = Partial<Record<RoomType, { name: string; entries: SetEntry[] }>>
/** Кухня-гостиная: первые 4 предмета гостиной и кухонная часть (без последнего предмета), ссылки сдвинуты. */
const livingKitchen = (living: SetEntry[], kitchen: SetEntry[]): SetEntry[] => [
  ...living.slice(0, 4),
  ...kitchen.slice(0, 7).map((e) => (e.ref === undefined ? e : { ...e, ref: e.ref + 4 })),
]
const KITCHEN_UNITS: SetEntry[] = [
  { id: 'kenney_kitchenFridge', place: 'wall' },
  { id: 'kenney_kitchenSink', place: 'wall' },
  { id: 'kenney_kitchenStove', place: 'wall' },
  { id: 'kenney_kitchenCabinet', place: 'wall' },
]
const kitchenWith = (table: string, chair: string, extra: string): SetEntry[] => [
  ...KITCHEN_UNITS,
  { id: table, place: 'center' },
  { id: chair, place: 'center', ref: 4 },
  { id: chair, place: 'center', ref: 4 },
  { id: extra, place: 'wall' },
]

// Хай-тек: тёмная техника, подвесная ТВ-стенка, прямые линии, дуговой и квадратный свет, стеклянно-металлический вид.
const HT_LIVING: SetEntry[] = [
  { id: 'sofa_02', place: 'wall' },
  { id: 'modern_coffee_table_01', place: 'center', ref: 0 },
  { id: 'fm_tv_wall', place: 'wall' },
  { id: 'kenney_speaker', place: 'wall' },
  { id: 'kenney_lampSquareFloor', place: 'wall' },
  { id: 'fm_floor_lamp_arc', place: 'wall' },
  { id: 'kenney_bookcaseClosedDoors', place: 'wall' },
]
const HT_KITCHEN = kitchenWith('wooden_table_02', 'bar_chair_round_01', 'kenney_kitchenMicrowave')
const HT_BEDROOM: SetEntry[] = [
  { id: 'fm_bed_lowprofile', place: 'wall' },
  { id: 'kenney_cabinetBed', place: 'wall' },
  { id: 'kenney_lampSquareTable', place: 'on', ref: 1 },
  { id: 'fm_wardrobe_wood', place: 'wall' },
  { id: 'fm_desk_oak', place: 'wall' },
  { id: 'kenney_computerScreen', place: 'on', ref: 4 },
  { id: 'kenney_laptop', place: 'on', ref: 4 },
]

// Скандинавский: светлое дерево, мягкие формы, растения, плетёные корзины.
const SC_LIVING: SetEntry[] = [
  { id: 'Sofa_01', place: 'wall' },
  { id: 'side_table_01', place: 'center', ref: 0 },
  { id: 'fm_tv_stand_light', place: 'wall' },
  { id: 'kenney_televisionModern', place: 'on', ref: 2 },
  { id: 'ArmChair_01', place: 'wall' },
  { id: 'fm_floor_lamp_pleated', place: 'wall' },
  { id: 'fm_planter_fluted', place: 'wall' },
  { id: 'fm_basket_seagrass', place: 'wall' },
  { id: 'own_picture', place: 'wall' },
]
const SC_KITCHEN = kitchenWith('round_wooden_table_02', 'painted_wooden_chair_01', 'own_shelf_wall')
const SC_BEDROOM: SetEntry[] = [
  { id: 'fm_bed_lowprofile', place: 'wall' },
  { id: 'painted_wooden_nightstand', place: 'wall' },
  { id: 'fm_table_lamp_wood', place: 'on', ref: 1 },
  { id: 'drawer_cabinet', place: 'wall' },
  { id: 'fm_basket_seagrass', place: 'wall' },
  { id: 'fm_plant_peperomia', place: 'on', ref: 3 },
  { id: 'own_picture', place: 'wall' },
]
const SC_HALL: SetEntry[] = [
  { id: 'kenney_coatRackStanding', place: 'wall' },
  { id: 'painted_wooden_bench', place: 'wall' },
  { id: 'wicker_basket_01', place: 'wall' },
  { id: 'own_mirror', place: 'wall' },
]

// Минимализм: самый малый набор, пустые стены, один акцент.
const MIN_LIVING: SetEntry[] = [
  { id: 'sofa_02', place: 'wall' },
  { id: 'modern_coffee_table_01', place: 'center', ref: 0 },
  { id: 'fm_tv_stand_light', place: 'wall' },
  { id: 'kenney_televisionModern', place: 'on', ref: 2 },
  { id: 'fm_floor_lamp_arc', place: 'wall' },
]
const MIN_KITCHEN = kitchenWith('wooden_table_02', 'dining_chair_02', 'own_clock_wall').slice(0, 7)
const MIN_BEDROOM: SetEntry[] = [
  { id: 'fm_bed_lowprofile', place: 'wall' },
  { id: 'kenney_cabinetBed', place: 'wall' },
  { id: 'kenney_lampSquareTable', place: 'on', ref: 1 },
  { id: 'fm_wardrobe_wood', place: 'wall' },
]
const MIN_HALL: SetEntry[] = [
  { id: 'kenney_coatRackStanding', place: 'wall' },
  { id: 'own_mirror', place: 'wall' },
]

export type FurnishStyle = 'classic' | 'loft' | 'hightech' | 'scandi' | 'minimal'
export const FURNISH_STYLE_NAMES: Record<FurnishStyle, string> = { classic: 'Обычный', loft: 'Лофт', hightech: 'Хай-тек', scandi: 'Скандинавский', minimal: 'Минимализм' }

/** Наборы нового стиля поверх лофта; ванные и туалет везде берутся из обычных наборов. */
export const STYLE_SETS: Record<Exclude<FurnishStyle, 'classic'>, SetMap> = {
  loft: LOFT_SETS,
  hightech: {
    living: { name: 'Хай-тек, гостиная: диван, подвесная ТВ-стенка, колонка, торшеры', entries: HT_LIVING },
    kitchenLiving: { name: 'Хай-тек, кухня-гостиная', entries: livingKitchen(HT_LIVING, HT_KITCHEN) },
    kitchen: { name: 'Хай-тек, кухня: модули, стол, барные стулья, микроволновка', entries: HT_KITCHEN },
    bedroom: { name: 'Хай-тек, спальня: низкая кровать, шкаф, стол с монитором', entries: HT_BEDROOM },
  },
  scandi: {
    living: { name: 'Скандинавский, гостиная: светлая ТВ-тумба, диван, кресло, растения', entries: SC_LIVING },
    kitchenLiving: { name: 'Скандинавский, кухня-гостиная', entries: livingKitchen(SC_LIVING, SC_KITCHEN) },
    kitchen: { name: 'Скандинавский, кухня: модули, круглый стол, деревянные стулья', entries: SC_KITCHEN },
    bedroom: { name: 'Скандинавский, спальня: низкая кровать, комод, корзина, растение', entries: SC_BEDROOM },
    hallway: { name: 'Скандинавский, прихожая: вешалка, скамья, корзина', entries: SC_HALL },
  },
  minimal: {
    living: { name: 'Минимализм, гостиная: диван, столик, ТВ-тумба, торшер', entries: MIN_LIVING },
    kitchenLiving: { name: 'Минимализм, кухня-гостиная', entries: livingKitchen(MIN_LIVING, MIN_KITCHEN) },
    kitchen: { name: 'Минимализм, кухня: модули, стол, стулья', entries: MIN_KITCHEN },
    bedroom: { name: 'Минимализм, спальня: кровать, тумба, шкаф', entries: MIN_BEDROOM },
    hallway: { name: 'Минимализм, прихожая: вешалка, зеркало', entries: MIN_HALL },
  },
}

export const FURNISH_SETS: Partial<Record<RoomType, { name: string; entries: SetEntry[] }>> = {
  living: { name: 'Гостиная: диван, столик, ТВ, кресло', entries: LIVING },
  kitchenLiving: { name: 'Кухня-гостиная: диван, ТВ, кухонные модули, стол', entries: [...LIVING.slice(0, 4), ...KITCHEN.slice(0, 7).map((e) => (e.ref === undefined ? e : { ...e, ref: e.ref + 4 }))] },
  kitchen: { name: 'Кухня: холодильник, мойка, плита, стол со стульями', entries: KITCHEN },
  bedroom: { name: 'Спальня: кровать, тумбочка, шкаф, комод', entries: BEDROOM },
  bathroom: { name: 'Ванная: ванна, раковина, унитаз, стиральная машина', entries: BATH },
  combinedBathroom: { name: 'Санузел: ванна, раковина, унитаз', entries: BATH.slice(0, 3).concat(BATH.slice(4)) },
  toilet: { name: 'Туалет: унитаз, раковина', entries: TOILET },
  hallway: { name: 'Прихожая: вешалка, консоль, скамья', entries: HALL },
}

/** Набор для комнаты в выбранном стиле; у ванных и туалета лофт совпадает с обычным набором (сантехника одна). */
export const furnishSetFor = (type: RoomType, style: FurnishStyle) => (style === 'classic' ? FURNISH_SETS[type] : STYLE_SETS[style][type] ?? FURNISH_SETS[type])
