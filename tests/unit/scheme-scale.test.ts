import { describe, expect, it } from 'vitest'
import { apartmentNetAreaM2, roomClearPolygon } from '../../src/domain/derive'
import { validateApartment } from '../../src/domain/validate'
import { buildApartment, CEILING_CM, DOOR_WIDTHS, INNER_WALL_CM, OUTER_WALL_CM, SIDE_SCALE, TEMPLATES, templateById } from '../../src/scenario/layouts'
import { rankSchemes, schemeAreaRange } from '../../src/scenario/match'

// Этап 22 (SPEC D-15): стартовые схемы больше, стороны комнат ×1,1, площадь около +21 %; стены, проёмы и потолок прежние.
describe('22.1 увеличение схем в 1,1 раза по каждой стороне', () => {
  it('масштаб сторон 1,1, площадь каждой из девяти схем выросла на 20–22 % и осталась в диапазоне исходной схемы после ×1', () => {
    expect(SIDE_SCALE).toBe(1.1)
    expect(TEMPLATES).toHaveLength(9)
    for (const t of TEMPLATES) {
      const base = apartmentNetAreaM2(buildApartment(t, 1))
      const big = apartmentNetAreaM2(buildApartment(t))
      expect(big / base, t.id).toBeGreaterThan(1.2)
      expect(big / base, t.id).toBeLessThan(1.22)
      expect(base, `${t.id} до увеличения`).toBeGreaterThanOrEqual(t.baseAreaRangeM2[0])
      expect(base, `${t.id} до увеличения`).toBeLessThanOrEqual(t.baseAreaRangeM2[1])
    }
  })

  it('размеры «Комнаты» схемы 1Б: 380 × 560 → 418 × 616 см чистыми', () => {
    const a = buildApartment(templateById('1b')!)
    const room = Object.values(a.rooms).find((r) => r.name === 'Комната')!
    const p = roomClearPolygon(a, room)
    const xs = p.map((q) => q.x), zs = p.map((q) => q.z)
    expect(Math.round(Math.max(...xs) - Math.min(...xs))).toBe(418)
    expect(Math.round(Math.max(...zs) - Math.min(...zs))).toBe(616)
  })

  it('толщина стен, ширина дверей, высота потолка и размеры окон не масштабируются; все схемы проходят проверку квартиры', () => {
    for (const t of TEMPLATES) {
      const a = buildApartment(t)
      expect(validateApartment(a), t.id).toEqual([])
      expect(a.ceilingHeightCm).toBe(CEILING_CM)
      expect(CEILING_CM).toBe(270)
      const thick = new Set(Object.values(a.walls).map((w) => w.thicknessCm))
      expect([...thick].sort((x, y) => x - y), t.id).toEqual([INNER_WALL_CM, OUTER_WALL_CM])
      const widths = Object.values(a.openings).filter((o) => o.kind === 'door').map((o) => o.widthCm)
      for (const w of widths) expect([DOOR_WIDTHS.interior, DOOR_WIDTHS.bath, DOOR_WIDTHS.entrance], `${t.id} дверь ${w}`).toContain(w)
      for (const o of Object.values(a.openings).filter((x) => x.kind === 'window')) {
        expect(o.heightCm, t.id).toBe(140)
        expect(o.sillCm, t.id).toBe(90)
        expect(o.widthCm, t.id).toBeGreaterThanOrEqual(90)
        expect(o.widthCm, t.id).toBeLessThanOrEqual(180)
      }
    }
  })
})

describe('22.2 подбор схем по введённой площади', () => {
  it('для 36, 52 и 72 м² первой идёт самая близкая схема своей комнатности', () => {
    const first = (n: 1 | 2 | 3, m2: number) => rankSchemes(n, m2)[0]
    expect(first(1, 36).template.id).toBe('1a') // студия 36,1 м²
    expect(first(2, 52).template.id).toBe('2a') // 52,6 м²
    expect(first(3, 72).template.id).toBe('3a') // самая маленькая из трёх схем (80,1 м²): меньше схем нет
    for (const [n, m] of [[1, 36], [2, 52], [3, 72]] as const) {
      const r = rankSchemes(n, m)
      expect(r).toHaveLength(3)
      expect(r.filter((x) => x.closest)).toHaveLength(1)
      expect(Math.abs(r[0].diffM2)).toBeLessThanOrEqual(Math.abs(r[1].diffM2))
      expect(Math.abs(r[1].diffM2)).toBeLessThanOrEqual(Math.abs(r[2].diffM2))
    }
  })

  it('крайние площади дают крайние схемы, ранжирование идёт по новым площадям', () => {
    expect(rankSchemes(1, 20)[0].template.id).toBe('1a')
    expect(rankSchemes(1, 60)[0].template.id).toBe('1v')
    expect(rankSchemes(3, 120)[0].template.id).toBe('3v')
    for (const r of rankSchemes(2, 55)) expect(r.netAreaM2).toBeCloseTo(apartmentNetAreaM2(r.apartment), 6)
  })

  it('диапазон подсказки под полем ввода — по фактическим площадям схем и растёт с числом комнат', () => {
    const r1 = schemeAreaRange(1), r2 = schemeAreaRange(2), r3 = schemeAreaRange(3)
    expect(r1.minM2).toBeCloseTo(36.1, 0)
    expect(r1.maxM2).toBeCloseTo(48.6, 0)
    expect(r2.minM2).toBeCloseTo(52.6, 0)
    expect(r2.maxM2).toBeCloseTo(67.6, 0)
    expect(r3.minM2).toBeCloseTo(80.1, 0)
    expect(r3.maxM2).toBeCloseTo(89, 0)
    expect(r2.minM2).toBeGreaterThan(r1.minM2)
    expect(r3.minM2).toBeGreaterThan(r2.minM2)
  })
})
