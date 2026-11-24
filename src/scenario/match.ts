import { apartmentNetAreaM2, apartmentOuterAreaM2 } from '../domain/derive'
import type { Apartment } from '../domain/types'
import { buildApartment, TEMPLATES, type LayoutTemplate } from './layouts'

export interface SchemeOption {
  template: LayoutTemplate
  apartment: Apartment
  /** Сумма чистых площадей помещений (без стен) — по ней идёт подбор. */
  netAreaM2: number
  /** Площадь по внешнему контуру (со стенами); показывается отдельной подписью. */
  outerAreaM2: number
}

const cache = new Map<string, SchemeOption>()

export function schemeOption(t: LayoutTemplate): SchemeOption {
  let o = cache.get(t.id)
  if (!o) {
    const apartment = buildApartment(t)
    o = { template: t, apartment, netAreaM2: apartmentNetAreaM2(apartment), outerAreaM2: apartmentOuterAreaM2(apartment) }
    cache.set(t.id, o)
  }
  return o
}

/** Диапазон чистой площади стартовых схем выбранной комнатности (после увеличения D-15), м²: подсказка под полем ввода. */
export function schemeAreaRange(roomCount: 1 | 2 | 3): { minM2: number; maxM2: number } {
  const areas = TEMPLATES.filter((t) => t.roomCount === roomCount).map((t) => schemeOption(t).netAreaM2)
  return { minM2: Math.min(...areas), maxM2: Math.max(...areas) }
}

export interface RankedScheme extends SchemeOption {
  /** Разница фактической площади схемы и введённой, м² (знак: схема больше → плюс). */
  diffM2: number
  closest: boolean
}

/** Три схемы выбранной комнатности, ближайшие по площади — первыми. Схемы не изменяют размеры под ввод. */
export function rankSchemes(roomCount: 1 | 2 | 3, targetM2: number): RankedScheme[] {
  const list = TEMPLATES.filter((t) => t.roomCount === roomCount).map((t) => {
    const o = schemeOption(t)
    return { ...o, diffM2: o.netAreaM2 - targetM2, closest: false }
  })
  list.sort((a, b) => Math.abs(a.diffM2) - Math.abs(b.diffM2) || a.template.id.localeCompare(b.template.id))
  if (list.length > 0) list[0].closest = true
  return list
}
