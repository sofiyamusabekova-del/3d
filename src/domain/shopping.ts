import type { Catalog } from './placement'
import type { Apartment } from './types'

/** Список покупок (этап 5 доработок, SPEC D-34): мебель квартиры, сгруппированная по предметам каталога. */
export interface ShoppingRow {
  itemId: string
  name: string
  category: string
  count: number
  widthCm: number
  depthCm: number
  heightCm: number
  /** Комнаты, где стоит предмет (названия, без повторов, по алфавиту). */
  rooms: string[]
  /** Страница модели (источник); у собственных моделей проекта — пусто. */
  sourceUrl: string
}

export function shoppingList(apt: Apartment, catalog: Catalog): ShoppingRow[] {
  const rows = new Map<string, ShoppingRow>()
  for (const f of Object.values(apt.furniture)) {
    const item = catalog[f.catalogItemId]
    if (!item) continue
    const room = apt.rooms[f.roomId]?.name ?? ''
    const row = rows.get(item.id) ?? {
      itemId: item.id, name: item.name, category: item.category, count: 0,
      widthCm: Math.round(item.widthCm), depthCm: Math.round(item.depthCm), heightCm: Math.round(item.heightCm),
      rooms: [], sourceUrl: /^https?:/.test(item.license.source) ? item.license.source : '',
    }
    row.count++
    if (room && !row.rooms.includes(room)) row.rooms.push(room)
    rows.set(item.id, row)
  }
  return [...rows.values()]
    .map((r) => ({ ...r, rooms: r.rooms.sort((a, b) => a.localeCompare(b, 'ru')) }))
    .sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru'))
}

const cell = (v: string | number) => {
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV для Excel: разделитель «;», первая строка — заголовки, в конце строка «Итого». */
export function shoppingCsv(rows: ShoppingRow[]): string {
  const head = ['Предмет', 'Категория', 'Количество', 'Ширина, см', 'Глубина, см', 'Высота, см', 'Комнаты', 'Источник']
  const lines = [head, ...rows.map((r) => [r.name, r.category, r.count, r.widthCm, r.depthCm, r.heightCm, r.rooms.join(', '), r.sourceUrl])]
  lines.push(['Итого', '', rows.reduce((n, r) => n + r.count, 0), '', '', '', '', ''])
  return lines.map((l) => l.map(cell).join(';')).join('\r\n')
}

/** Короткий текст для буфера обмена: «2 × Кровать двуспальная (170 × 200 × 67 см)». */
export function shoppingText(rows: ShoppingRow[]): string {
  return rows.map((r) => `${r.count} × ${r.name} (${r.widthCm} × ${r.depthCm} × ${r.heightCm} см)`).join('\n')
}
