import type { CatalogItem } from '../domain/types'

/**
 * ТЕХНИЧЕСКИЙ каталог этапа 4: четыре модели для проверки алгоритмов.
 * Это не утверждённый ассортимент (SPEC D-07). Источники и лицензии — docs/ASSETS.md.
 * Габариты — измеренные по модели размеры в см; начало координат — центр основания.
 */
const PH = (id: string, author: string) => ({
  source: `https://polyhaven.com/a/${id}`,
  author,
  license: 'CC0 1.0',
  attribution: 'Не требуется (CC0)',
  retrievedAt: '2026-11-15',
})

const box = (w: number, d: number, h: number) => [{ xCm: 0, zCm: 0, widthCm: w, depthCm: d, yMinCm: 0, yMaxCm: h }]

const item = (
  id: string,
  name: string,
  category: string,
  roomTypes: CatalogItem['roomTypes'],
  w: number,
  d: number,
  h: number,
  author: string,
): CatalogItem => ({
  id,
  version: '1k-2026-11-15',
  name,
  category,
  roomTypes,
  widthCm: w,
  depthCm: d,
  heightCm: h,
  mount: 'floor',
  layer: 'item',
  modelUrl: `/models/${id}/${id}.gltf`,
  previewUrl: '',
  colliders: box(w, d, h),
  materialIds: [],
  license: PH(id, author),
})

export const TECH_CATALOG_ITEMS: CatalogItem[] = [
  item('sofa_02', 'Диван', 'Мягкая мебель', ['living'], 181, 82, 71, 'Kirill Sannikov'),
  item('modern_coffee_table_01', 'Журнальный столик', 'Столы', ['living'], 60, 120, 39, 'Amin'),
  item('dining_chair_02', 'Стул', 'Стулья', ['kitchen', 'living'], 43, 58, 97, 'James Ray Cock'),
  item('modern_wooden_cabinet', 'Тумба', 'Хранение', ['living', 'hallway'], 244, 52, 68, 'Patrik Pangerl'),
]

export const TECH_CATALOG = Object.fromEntries(TECH_CATALOG_ITEMS.map((i) => [i.id, i]))
