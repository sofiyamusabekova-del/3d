import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CATALOG_ITEMS } from '../../src/catalog/catalog'
import { parseAreaInput, parseCmInput } from '../../src/scenario/input'
import { CatalogPanel } from '../../src/ui/CatalogPanel'

// Задача 18.1 (AC-13): некорректные и дробные числа, пустой каталог, длинные названия.

describe('18.1: ввод сантиметров (стена 80–1200 см)', () => {
  const cases: Array<[string, number | RegExp]> = [
    ['420', 420],
    [' 420 ', 420],
    ['420 см', 420],
    ['420СМ', 420],
    ['420,4', 420],
    ['420.5', 421],
    ['420,6', 421],
    ['', /Введите длину/],
    ['   ', /Введите длину/],
    ['-5', /введите число/],
    ['+420', /введите число/],
    ['1e3', /введите число/],
    ['0x1A', /введите число/],
    ['Infinity', /введите число/],
    ['NaN', /введите число/],
    ['420.4.5', /введите число/],
    ['4 20', /введите число/],
    ['420,5,1', /введите число/],
    ['４２０', /введите число/], // полноширинные цифры не считаются числом
    ['сорок', /введите число/],
    ['79,4', /минимум 80/],
    ['79,5', 80],
    ['1200,4', 1200],
    ['1200,5', /максимум 1200/],
    ['99999999999999999999999', /максимум 1200/],
  ]
  for (const [raw, want] of cases) {
    it(JSON.stringify(raw), () => {
      const r = parseCmInput(raw, 80, 1200, 'длину')
      if (typeof want === 'number') expect(r).toEqual({ ok: true, valueCm: want, text: String(want) })
      else { expect(r.ok).toBe(false); if (!r.ok) expect(r.message).toMatch(want) }
    })
  }
})

describe('18.1: ввод площади (15–150 м²)', () => {
  const cases: Array<[string, number | RegExp]> = [
    ['45', 45],
    ['45,55', 45.6],
    ['45.54', 45.5],
    ['45 м²', 45],
    ['45м2', 45],
    ['45 кв. м', 45],
    ['0', /больше нуля/],
    ['0,04', /больше нуля/],
    ['14,94', /минимум 15/],
    ['14,95', 15],
    ['150,04', 150],
    ['150,05', /максимум 150/],
    ['-45', /Введите число/],
    ['1e2', /Введите число/],
    ['', /Введите примерную/],
    ['1'.repeat(400), /максимум 150/],
  ]
  for (const [raw, want] of cases) {
    it(JSON.stringify(raw.length > 30 ? `${raw.slice(0, 10)}… (${raw.length})` : raw), () => {
      const r = parseAreaInput(raw)
      if (typeof want === 'number') { expect(r.ok).toBe(true); if (r.ok) expect(r.valueM2).toBe(want) }
      else { expect(r.ok).toBe(false); if (!r.ok) expect(r.message).toMatch(want) }
    })
  }
})

describe('18.1: каталог', () => {
  it('пустой каталог: понятное сообщение, нет карточек', () => {
    const html = renderToStaticMarkup(createElement(CatalogPanel, { roomType: 'living', onAdd: () => {}, items: [] }))
    expect(html).toContain('data-testid="catalog-empty"')
    expect(html).toContain('нет предметов')
    expect(html).toContain('Показано 0 из 0')
    expect(html).not.toContain('data-testid="card-')
  })

  it('предмет с очень длинным названием отображается без ошибок, название не обрезается в данных', () => {
    const long = { ...CATALOG_ITEMS[0], id: 'long', name: 'Очень'.repeat(60) + 'длинноеназваниебезпробелов'.repeat(4) }
    const html = renderToStaticMarkup(createElement(CatalogPanel, { roomType: long.roomTypes?.[0] ?? 'living', onAdd: () => {}, items: [long] }))
    expect(html).toContain(long.name)
  })

  it('все названия каталога в разумных пределах длины (вёрстка карточки рассчитана на них)', () => {
    const longest = Math.max(...CATALOG_ITEMS.map((i) => i.name.length))
    expect(longest).toBeLessThanOrEqual(40)
  })
})
