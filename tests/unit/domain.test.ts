import { describe, expect, it } from 'vitest'
import { apartmentNetAreaM2, apartmentOuterAreaM2, roomClearPolygon, roomNetAreaM2 } from '../../src/domain/derive'
import { applyChange, canRedo, canUndo, createHistory, redo, undo } from '../../src/domain/history'
import { createProjectStore, selectApartment, selectCanUndo } from '../../src/domain/store'
import { surfaceKey, type Apartment } from '../../src/domain/types'
import { validateApartment } from '../../src/domain/validate'
import { cm2ToM2, cmToScene, fitScale, m2ToCm2, sceneToCm } from '../../src/geometry/units'
import { offsetPolygon, signedArea } from '../../src/geometry/polygon'
import { twoRoomApartment } from './fixtures'

const width = (pts: { x: number }[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
const depth = (pts: { z: number }[]) => Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z))

describe('3.1 общая модель: перегородка не дублируется', () => {
  const apt = twoRoomApartment()
  it('общая стена одна и входит в границы обеих комнат в противоположных направлениях', () => {
    expect(Object.keys(apt.walls).filter((id) => id === 'wShared')).toHaveLength(1)
    const a = apt.rooms.A.boundary.find((r) => r.wallId === 'wShared')!
    const b = apt.rooms.B.boundary.find((r) => r.wallId === 'wShared')!
    expect(a.reversed).not.toBe(b.reversed)
  })
  it('чистовые размеры комнат соответствуют заданным', () => {
    const A = roomClearPolygon(apt, apt.rooms.A)
    const B = roomClearPolygon(apt, apt.rooms.B)
    expect([width(A), depth(A)].map((n) => Math.round(n * 100) / 100)).toEqual([400, 300])
    expect([width(B), depth(B)].map((n) => Math.round(n * 100) / 100)).toEqual([200, 300])
  })
  it('исходная квартира проходит проверку целостности', () => {
    expect(validateApartment(apt)).toEqual([])
  })
})

describe('3.3 единицы', () => {
  it('см ↔ сцена и см² ↔ м²', () => {
    expect(cmToScene(100)).toBe(1)
    expect(sceneToCm(cmToScene(95))).toBeCloseTo(95, 10)
    expect(cm2ToM2(m2ToCm2(12.5))).toBeCloseTo(12.5, 10)
    expect(cm2ToM2(120_000)).toBe(12)
  })
  it('предмет 100 см = 1 единица сцены; уже нормализованная модель не масштабируется повторно', () => {
    expect(cmToScene(100)).toBe(1)
    expect(fitScale(1, 100)).toBe(1)
    expect(fitScale(0.5, 100)).toBe(2) // модель вдвое меньше нужной — один раз ×2
    expect(() => fitScale(0, 100)).toThrow()
  })
})

describe('3.4 чистая площадь и площадь по внешнему контуру', () => {
  const apt = twoRoomApartment()
  it('сумма чистых площадей: 12,0 + 6,0 = 18,0 м²', () => {
    expect(roomNetAreaM2(apt, apt.rooms.A)).toBeCloseTo(12, 6)
    expect(roomNetAreaM2(apt, apt.rooms.B)).toBeCloseTo(6, 6)
    expect(apartmentNetAreaM2(apt)).toBeCloseTo(18, 6)
  })
  it('площадь по внешнему контуру больше из-за стен: 670×360 см = 24,12 м²', () => {
    expect(apartmentOuterAreaM2(apt)).toBeCloseTo(24.12, 6)
    expect(apartmentOuterAreaM2(apt)).toBeGreaterThan(apartmentNetAreaM2(apt))
  })
})

describe('геометрия многоугольников', () => {
  it('смещение внутрь работает для обеих ориентаций обхода', () => {
    const ccw = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 50 }, { x: 0, z: 50 }]
    const cw = [...ccw].reverse()
    expect(Math.abs(signedArea(offsetPolygon(ccw, [5, 5, 5, 5])))).toBeCloseTo(90 * 40, 6)
    expect(Math.abs(signedArea(offsetPolygon(cw, [5, 5, 5, 5])))).toBeCloseTo(90 * 40, 6)
  })
})

describe('валидатор целостности', () => {
  const mutate = (f: (a: Apartment) => void) => {
    const a = structuredClone(twoRoomApartment())
    f(a)
    return validateApartment(a).map((i) => i.code)
  }
  it('находит разрыв границы, битую ссылку, NaN и проём за стеной', () => {
    expect(mutate((a) => { a.rooms.A.boundary.pop() })).toContain('open-boundary')
    expect(mutate((a) => { a.rooms.A.boundary.length = 2 })).toContain('bad-boundary')
    expect(mutate((a) => { a.rooms.A.boundary[1] = { wallId: 'wRight', reversed: false } })).toContain('open-boundary')
    expect(mutate((a) => { a.walls.wLeft.startVertexId = 'nope' })).toContain('missing-ref')
    expect(mutate((a) => { a.vertices.v1.xCm = NaN })).toContain('bad-number')
    expect(mutate((a) => { a.walls.wLeft.thicknessCm = 0 })).toContain('bad-number')
    expect(mutate((a) => { a.openings.door1.offsetCm = 290 })).toContain('opening-out-of-wall')
    expect(mutate((a) => { a.rooms.B.boundary[3].reversed = false })).toContain('wall-same-direction')
    expect(mutate((a) => { a.surfaceMaterials[surfaceKey('wLeft', 'B')] = 'paint-1' })).toContain('bad-surface')
  })
})

describe('3.5 атомарное применение и 3.6 история', () => {
  const setCeiling = (cm: number) => (a: Apartment): Apartment => ({ ...a, ceilingHeightCm: cm })
  it('невалидный кандидат не меняет действующую квартиру', () => {
    const h = createHistory(twoRoomApartment())
    const r = applyChange(h, 'потолок', setCeiling(-5))
    expect(r.ok).toBe(false)
    expect(r.history).toBe(h)
    expect(r.history.present).toBe(h.present)
    expect(canUndo(r.history)).toBe(false)
  })
  it('исключение в построении кандидата тоже откатывается без изменений', () => {
    const h = createHistory(twoRoomApartment())
    const r = applyChange(h, 'ошибка', () => { throw new Error('сбой') })
    expect(r.ok).toBe(false)
    expect(r.history).toBe(h)
  })
  it('отмена и повтор восстанавливают состояние целиком, один шаг = одно изменение', () => {
    let h = createHistory(twoRoomApartment())
    const base = h.present
    const set = (label: string, f: (a: Apartment) => Apartment) => {
      const r = applyChange(h, label, f)
      expect(r.ok).toBe(true)
      h = r.history
    }
    set('потолок', setCeiling(300))
    set('пол', (a) => ({ ...a, floorCoverings: { ...a.floorCoverings, A: { kind: 'laminate', colorId: 'oak' } } }))
    set('отделка', (a) => ({ ...a, surfaceMaterials: { ...a.surfaceMaterials, [surfaceKey('wLeft', 'A')]: 'paint-1' } }))
    expect(h.past).toHaveLength(3)
    const final = h.present
    h = undo(h); h = undo(h); h = undo(h)
    expect(h.present).toBe(base)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(true)
    h = redo(h); h = redo(h); h = redo(h)
    expect(h.present).toBe(final)
    expect(h.present.floorCoverings.A.kind).toBe('laminate')
  })
  it('новое изменение после отмены очищает «повтор»; пустое изменение в историю не пишется', () => {
    let h = createHistory(twoRoomApartment())
    h = applyChange(h, 'a', setCeiling(280)).history
    h = undo(h)
    expect(canRedo(h)).toBe(true)
    h = applyChange(h, 'b', setCeiling(290)).history
    expect(canRedo(h)).toBe(false)
    const same = applyChange(h, 'ничего', (a) => a)
    expect(same.history).toBe(h)
  })
  it('хранилище: общий вход apply, отмена и повтор', () => {
    const store = createProjectStore(twoRoomApartment())
    const bad = store.getState().apply('плохо', (a) => ({ ...a, ceilingHeightCm: NaN }))
    expect(bad.ok).toBe(false)
    expect(selectApartment(store.getState()).ceilingHeightCm).toBe(270)
    store.getState().apply('потолок', (a) => ({ ...a, ceilingHeightCm: 300 }))
    expect(selectApartment(store.getState()).ceilingHeightCm).toBe(300)
    expect(selectCanUndo(store.getState())).toBe(true)
    store.getState().undo()
    expect(selectApartment(store.getState()).ceilingHeightCm).toBe(270)
    store.getState().redo()
    expect(selectApartment(store.getState()).ceilingHeightCm).toBe(300)
    store.getState().reset(twoRoomApartment())
    expect(selectCanUndo(store.getState())).toBe(false)
  })
})
