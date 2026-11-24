import type { MaterialDefinition } from '../domain/types'

/**
 * Материалы отделки стен (SPEC §13, D-24). Краска — цвет без текстуры (образцы собственные);
 * обои — бесплатные текстуры тканей Poly Haven (CC0), физический размер повтора взят из
 * каталога Poly Haven (мм → см). Реестр не меняется проектом: проект хранит только id.
 */

const paint = (id: string, name: string, colorHex: string): MaterialDefinition => ({
  id, kind: 'paint', name, colorHex, swatchHex: colorHex,
})

export const PAINTS: MaterialDefinition[] = [
  paint('paint_white', 'Белый', '#f2f1ec'),
  paint('paint_warm_white', 'Тёплый белый', '#ece3d2'),
  paint('paint_light_gray', 'Светло-серый', '#c9ccd1'),
  paint('paint_graphite', 'Графит', '#4a4e57'),
  paint('paint_beige', 'Бежевый', '#d2bb98'),
  paint('paint_sand', 'Песочный', '#c4a574'),
  paint('paint_sage', 'Шалфей', '#a5b59a'),
  paint('paint_olive', 'Оливковый', '#7d8059'),
  paint('paint_sky', 'Небесный', '#a9c4d8'),
  paint('paint_navy', 'Тёмно-синий', '#2f4560'),
  paint('paint_terracotta', 'Терракота', '#b8684b'),
  paint('paint_rose', 'Пыльная роза', '#d4a59f'),
  // Лофт: бетон, кирпич, чёрный металл.
  paint('paint_concrete', 'Бетон', '#8e9094'),
  paint('paint_brick', 'Кирпич', '#8a4a3a'),
  paint('paint_black', 'Чёрный', '#25272b'),
]

const wallpaper = (id: string, name: string, swatchHex: string, tileWidthCm: number, tileHeightCm: number): MaterialDefinition => ({
  id, kind: 'wallpaper', name, swatchHex,
  textureUrl: `/textures/wallpaper/${id}/${id}_diff_1k.webp`,
  thumbUrl: `/textures/wallpaper/${id}/${id}_thumb.webp`,
  normalUrl: `/textures/wallpaper/${id}/${id}_nor_gl_1k.webp`,
  tileSizeCm: { widthCm: tileWidthCm, heightCm: tileHeightCm },
  source: { url: `https://polyhaven.com/a/${id}`, author: 'colormass, Rico Cilliers', license: 'CC0 1.0', retrievedAt: '2026-11-15' },
})

export const WALLPAPERS: MaterialDefinition[] = [
  // Средний цвет образца измерен по diff_1k.jpg (сжатие до одного пикселя).
  wallpaper('rough_linen', 'Лён голубой', '#90aacd', 27.1, 27.1),
  wallpaper('quatrefoil_jacquard_fabric', 'Жаккард бордовый', '#93021f', 28.0, 28.4),
  wallpaper('gingham_check', 'Клетка зелёная', '#7c9388', 28.4, 29.7),
  wallpaper('poly_wool_herringbone', 'Ёлочка серая', '#797671', 27.0, 27.6),
]

export const MATERIALS: Record<string, MaterialDefinition> = Object.fromEntries([...PAINTS, ...WALLPAPERS].map((m) => [m.id, m]))

/** Цвет стены без отделки. */
export const DEFAULT_WALL_HEX = '#d8dae0'
