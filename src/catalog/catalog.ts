import type { Catalog } from '../domain/placement'
import type { CatalogItem, RoomType } from '../domain/types'
import generated from './catalog.generated.json'
import { LIGHT_SPECS, WALL_MOUNT_HEIGHT_CM } from './lights'

/**
 * Рабочий каталог мебели (SPEC §12, D-25). Карточки строятся из `catalog.generated.json`, который
 * пишет конвейер `scripts/catalog/` по подготовленным GLB: габариты измерены по геометрии модели,
 * начало координат — центр основания. Перечень и решения по карточкам — scripts/catalog/items.mjs.
 */

interface GeneratedItem {
  name: string
  category: string
  roomTypes: RoomType[]
  mount: 'floor' | 'wall' | 'surface' | 'ceiling'
  source: string
  url: string
  authors: string[]
  license: string
  /** Условия указания авторства; нет поля — CC0, указание не требуется. */
  attribution?: string
  retrievedAt: string
  widthCm: number
  depthCm: number
  heightCm: number
  srcBytes: number
  glbBytes: number
  /** Kenney: масштаб по осям x, y, z, с которым модель приведена к реальным размерам (docs/ASSETS.md). */
  scale?: number[]
}

/** Версия ассета в проекте: смена файлов модели должна менять версию (SPEC §6). */
export const CATALOG_VERSION = 'glb-2026-11-15'

const toItem = (id: string, g: GeneratedItem): CatalogItem => ({
  id,
  version: CATALOG_VERSION,
  name: g.name,
  category: g.category,
  roomTypes: g.roomTypes,
  widthCm: g.widthCm,
  depthCm: g.depthCm,
  heightCm: g.heightCm,
  mount: g.mount,
  ...(WALL_MOUNT_HEIGHT_CM[id] !== undefined ? { mountHeightCm: WALL_MOUNT_HEIGHT_CM[id] } : {}),
  ...(LIGHT_SPECS[id] ? { light: LIGHT_SPECS[id] } : {}),
  layer: 'item',
  modelUrl: `/catalog/${id}/${id}.glb`,
  previewUrl: `/catalog/${id}/preview.webp`,
  // Коллайдер — объём по габариту модели в локальных осях (центр основания); сложные формы упрощены коробкой.
  colliders: [{ xCm: 0, zCm: 0, widthCm: g.widthCm, depthCm: g.depthCm, yMinCm: 0, yMaxCm: g.heightCm }],
  materialIds: [],
  license: {
    source: g.url,
    author: g.authors.join(', '),
    license: g.license,
    attribution: g.attribution ?? 'Не требуется (CC0)',
    retrievedAt: g.retrievedAt,
  },
})

export const CATALOG_ITEMS: CatalogItem[] = Object.entries(generated.items as Record<string, GeneratedItem>).map(([id, g]) => toItem(id, g))
export const CATALOG: Catalog = Object.fromEntries(CATALOG_ITEMS.map((i) => [i.id, i]))

export const ROOM_LABELS: Record<RoomType, string> = {
  living: 'Гостиная',
  bedroom: 'Спальня',
  kitchen: 'Кухня',
  kitchenLiving: 'Кухня-гостиная',
  bathroom: 'Ванная',
  toilet: 'Туалет',
  combinedBathroom: 'Совмещённый санузел',
  hallway: 'Прихожая',
}

/** Предметы, подходящие для типа помещения. */
export const itemsForRoom = (type: RoomType, items: CatalogItem[] = CATALOG_ITEMS): CatalogItem[] => items.filter((i) => i.roomTypes.includes(type))

export const categoriesOf = (items: CatalogItem[]): string[] => [...new Set(items.map((i) => i.category))].sort((a, b) => a.localeCompare(b, 'ru'))
