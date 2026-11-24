import { describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { shoppingCsv, shoppingList, shoppingText } from '../../src/domain/shopping'
import type { Apartment, FurnitureInstance } from '../../src/domain/types'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Список покупок (этап 5 доработок, D-34).
const base: Apartment = buildApartment(templateById('1b')!)
const [r1, r2] = Object.values(base.rooms)
const f = (id: string, catalogItemId: string, roomId: string): [string, FurnitureInstance] => [id, { id, catalogItemId, assetVersion: '1', roomId, xCm: 0, zCm: 0, elevationCm: 0, angleDeg: 0 }]
const apt: Apartment = { ...base, furniture: Object.fromEntries([
  f('a', 'kenney_bedDouble', r1.id), f('b', 'kenney_bedDouble', r2.id), f('c', 'own_picture', r1.id), f('d', 'fm_tv_wall', r1.id), f('e', 'unknown_item', r1.id),
]) }

describe('список покупок', () => {
  it('группирует по предметам, считает количество и комнаты, пропускает неизвестное', () => {
    const rows = shoppingList(apt, CATALOG)
    expect(rows.map((r) => r.itemId).sort()).toEqual(['fm_tv_wall', 'kenney_bedDouble', 'own_picture'])
    const bed = rows.find((r) => r.itemId === 'kenney_bedDouble')!
    expect(bed.count).toBe(2)
    expect(bed.rooms).toHaveLength(2)
    expect(bed.widthCm).toBe(Math.round(CATALOG.kenney_bedDouble.widthCm))
    expect(rows.find((r) => r.itemId === 'fm_tv_wall')!.sourceUrl).toMatch(/^https:\/\/furnimesh\.com\//)
    expect(rows.find((r) => r.itemId === 'own_picture')!.sourceUrl).toBe('') // собственная модель: страницы нет
  })

  it('CSV: заголовок, разделитель «;», кавычки при необходимости, итог', () => {
    const rows = shoppingList(apt, CATALOG)
    const lines = shoppingCsv(rows).split('\r\n')
    expect(lines[0]).toBe('Предмет;Категория;Количество;Ширина, см;Глубина, см;Высота, см;Комнаты;Источник')
    expect(lines).toHaveLength(rows.length + 2)
    expect(lines.at(-1)).toMatch(/^Итого;;4;/)
    expect(shoppingCsv([{ ...rows[0], name: 'А;Б "В"' }])).toContain('"А;Б ""В"""')
  })

  it('текст для буфера обмена и пустой проект', () => {
    expect(shoppingText(shoppingList(apt, CATALOG))).toMatch(/2 × Кровать двуспальная \(\d+ × \d+ × \d+ см\)/)
    expect(shoppingList(base, CATALOG)).toEqual([])
  })
})
