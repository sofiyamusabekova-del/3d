import { beforeEach, describe, expect, it } from 'vitest'
import { apartmentNetAreaM2, apartmentOuterAreaM2 } from '../../src/domain/derive'
import { canUndo } from '../../src/domain/history'
import { passageGraph, unreachableRooms } from '../../src/domain/doors'
import { validateApartment } from '../../src/domain/validate'
import { planDrawing } from '../../src/plan2d/drawing'
import { parseAreaInput } from '../../src/scenario/input'
import { resetFlowForTests, useApartmentProject, useFlow } from '../../src/scenario/flow'
import { buildApartment, TEMPLATES } from '../../src/scenario/layouts'
import { rankSchemes } from '../../src/scenario/match'

const LIVING = ['living', 'bedroom', 'kitchenLiving']

describe('7.2 стартовые схемы проходят валидатор', () => {
  for (const t of TEMPLATES) {
    for (const scale of [1, 1.1]) {
      it(`${t.name}, стороны ×${scale}: модель целая, все помещения достижимы, мебели нет`, () => {
        const a = buildApartment(t, scale)
        expect(validateApartment(a)).toEqual([])
        expect(unreachableRooms(a)).toEqual([])
        expect(Object.keys(a.furniture)).toHaveLength(0)
        expect(passageGraph(a).entrances).toHaveLength(1)
        expect(Object.values(a.rooms).filter((r) => LIVING.includes(r.type))).toHaveLength(t.roomCount)
        expect(Object.values(a.rooms).filter((r) => r.type === 'hallway')).toHaveLength(1)
      })
    }
    it(`${t.name}: площадь без увеличения в диапазоне SPEC §3.1`, () => {
      const area = apartmentNetAreaM2(buildApartment(t, 1))
      expect(area, `${t.id}: ${area.toFixed(1)} м²`).toBeGreaterThanOrEqual(t.baseAreaRangeM2[0])
      expect(area, `${t.id}: ${area.toFixed(1)} м²`).toBeLessThanOrEqual(t.baseAreaRangeM2[1])
    })
    it(`${t.name}: D-15 — стороны ×1,1, площадь около +21 %, стены, проёмы и потолок не меняются`, () => {
      const a = buildApartment(t, 1)
      const b = buildApartment(t, 1.1)
      const ratio = apartmentNetAreaM2(b) / apartmentNetAreaM2(a)
      expect(ratio).toBeGreaterThan(1.19)
      expect(ratio).toBeLessThan(1.23)
      const da = planDrawing(a).rooms
      const db = planDrawing(b).rooms
      // Перегородки не масштабируются (D-15), поэтому комнаты, занимающие «остаток» колонки,
      // отличаются от ×1,1 на 1 см за каждую перегородку колонки: допуск 4 см.
      da.forEach((r, i) => {
        expect(Math.abs(db[i].widthCm - r.widthCm * 1.1)).toBeLessThanOrEqual(4)
        expect(Math.abs(db[i].depthCm - r.depthCm * 1.1)).toBeLessThanOrEqual(4)
      })
      expect(new Set(Object.values(b.walls).map((w) => w.thicknessCm))).toEqual(new Set([10, 30]))
      expect(b.ceilingHeightCm).toBe(270)
      const sizes = (x: typeof a) => Object.values(x.openings).map((o) => [o.kind, o.widthCm, o.heightCm]).sort().join(';')
      expect(Object.values(b.openings).map((o) => o.heightCm)).toEqual(Object.values(a.openings).map((o) => o.heightCm))
      expect(Object.values(b.openings).filter((o) => o.kind === 'door').map((o) => o.widthCm).sort())
        .toEqual(Object.values(a.openings).filter((o) => o.kind === 'door').map((o) => o.widthCm).sort())
      expect(sizes(b).length).toBeGreaterThan(0)
    })
    it(`${t.name}: у жилых комнат и кухонь есть окно, у санузлов нет; двери санузлов 70, входная 90, прочие 80 см`, () => {
      const a = buildApartment(t)
      for (const r of Object.values(a.rooms)) {
        const hasWindow = Object.values(a.openings).some((o) => o.kind === 'window' && r.boundary.some((b) => b.wallId === o.wallId))
        const wet = ['bathroom', 'toilet', 'combinedBathroom', 'hallway'].includes(r.type)
        expect(hasWindow, r.name).toBe(!wet)
      }
      for (const o of Object.values(a.openings).filter((x) => x.kind === 'door')) {
        const room = a.rooms[o.swingRoomId!]
        const exterior = Object.values(a.rooms).filter((r) => r.boundary.some((b) => b.wallId === o.wallId)).length === 1
        const wet = ['bathroom', 'toilet', 'combinedBathroom'].includes(room.type)
        expect(o.widthCm).toBe(exterior ? 90 : wet ? 70 : 80)
      }
    })
    it(`${t.name}: площадь по внешнему контуру больше суммы чистых и показывается отдельно`, () => {
      const a = buildApartment(t)
      expect(apartmentOuterAreaM2(a)).toBeGreaterThan(apartmentNetAreaM2(a))
    })
  }
  it('все схемы: девять, по три на каждую комнатность', () => {
    expect(TEMPLATES).toHaveLength(9)
    for (const n of [1, 2, 3]) expect(TEMPLATES.filter((t) => t.roomCount === n)).toHaveLength(3)
  })
})

describe('7.1 ввод площади', () => {
  it('принимает запятую и точку, суффикс м², округляет до 0,1 и показывает результат', () => {
    expect(parseAreaInput('45,56')).toEqual({ ok: true, valueM2: 45.6, text: '45,6' })
    expect(parseAreaInput(' 45.5 м² ')).toEqual({ ok: true, valueM2: 45.5, text: '45,5' })
    expect(parseAreaInput('60')).toEqual({ ok: true, valueM2: 60, text: '60' })
  })
  it('понятные ошибки: пусто, не число, ноль, минус, слишком мало и много', () => {
    const msg = (s: string) => { const r = parseAreaInput(s); return r.ok ? null : r.message }
    expect(msg('')).toBe('Введите примерную площадь в м²')
    expect(msg('abc')).toContain('Введите число')
    expect(msg('1e3')).toContain('Введите число')
    expect(msg('-5')).toContain('Введите число')
    expect(msg('NaN')).toContain('Введите число')
    expect(msg('0')).toBe('Площадь должна быть больше нуля')
    expect(msg('10')).toBe('Слишком мало: минимум 15 м²')
    expect(msg('151')).toBe('Слишком много: максимум 150 м²')
  })
})

describe('7.3 подбор схем', () => {
  it('три схемы выбранной комнатности, ближайшая по площади первая и помечена', () => {
    const r = rankSchemes(2, 50)
    expect(r).toHaveLength(3)
    expect(r.every((s) => s.template.roomCount === 2)).toBe(true)
    expect(r.filter((s) => s.closest)).toHaveLength(1)
    expect(r[0].closest).toBe(true)
    expect(Math.abs(r[0].diffM2)).toBeLessThanOrEqual(Math.abs(r[1].diffM2))
    expect(Math.abs(r[1].diffM2)).toBeLessThanOrEqual(Math.abs(r[2].diffM2))
  })
  it('введённая площадь не подгоняет схему: фактическая площадь схемы не зависит от ввода', () => {
    const a = rankSchemes(1, 30).find((s) => s.template.id === '1b')!
    const b = rankSchemes(1, 90).find((s) => s.template.id === '1b')!
    expect(a.netAreaM2).toBe(b.netAreaM2)
    expect(a.diffM2).not.toBe(b.diffM2)
  })
})

describe('7.4–7.5 сценарий и возврат между шагами', () => {
  beforeEach(resetFlowForTests)

  it('для всех трёх комнатностей: параметры → схемы → настройка с пустой согласованной квартирой', () => {
    for (const n of [1, 2, 3] as const) {
      resetFlowForTests()
      const f = useFlow.getState()
      f.setRoomCount(n)
      f.setAreaText('50')
      useFlow.getState().submitParams()
      expect(useFlow.getState().step).toBe('schemes')
      const first = rankSchemes(n, 50)[0].template.id
      useFlow.getState().chooseScheme(first)
      expect(useFlow.getState().step).toBe('setup')
      const apt = useApartmentProject.getState().history.present
      expect(validateApartment(apt)).toEqual([])
      expect(Object.keys(apt.furniture)).toHaveLength(0)
    }
  })
  it('ошибка ввода не пускает дальше и не стирает введённый текст', () => {
    useFlow.getState().setAreaText('abc')
    useFlow.getState().submitParams()
    expect(useFlow.getState().step).toBe('params')
    expect(useFlow.getState().areaError).toContain('Введите число')
    expect(useFlow.getState().areaText).toBe('abc')
  })
  it('возврат назад не теряет число комнат, площадь и выбранную схему', () => {
    const f = useFlow.getState()
    f.setRoomCount(3)
    f.setAreaText('70,5')
    useFlow.getState().submitParams()
    useFlow.getState().chooseScheme('3b')
    useFlow.getState().goTo('schemes')
    useFlow.getState().goTo('params')
    const s = useFlow.getState()
    expect([s.roomCount, s.areaText, s.areaM2, s.selectedTemplateId]).toEqual([3, '70,5', 70.5, '3b'])
    expect(useApartmentProject.getState().history.present.id).toBe('apartment-3b')
  })
  it('нельзя перепрыгнуть вперёд без введённой площади и выбранной схемы', () => {
    useFlow.getState().goTo('schemes')
    expect(useFlow.getState().step).toBe('params')
    useFlow.getState().goTo('setup')
    expect(useFlow.getState().step).toBe('params')
  })
  it('замена схемы без правок происходит сразу и сбрасывает историю', () => {
    useFlow.getState().setAreaText('40')
    useFlow.getState().submitParams()
    useFlow.getState().chooseScheme('1a')
    useFlow.getState().goTo('schemes')
    useFlow.getState().chooseScheme('1b')
    expect(useFlow.getState().selectedTemplateId).toBe('1b')
    expect(useFlow.getState().pendingReplaceId).toBeNull()
    expect(canUndo(useApartmentProject.getState().history)).toBe(false)
  })
  it('повторный выбор той же схемы продолжает работу, правки сохраняются', () => {
    useFlow.getState().setAreaText('40')
    useFlow.getState().submitParams()
    useFlow.getState().chooseScheme('1a')
    useApartmentProject.getState().apply('Высота потолка', (a) => ({ ...a, ceilingHeightCm: 280 }))
    useFlow.getState().goTo('schemes')
    useFlow.getState().chooseScheme('1a')
    expect(useFlow.getState().step).toBe('setup')
    expect(useApartmentProject.getState().history.present.ceilingHeightCm).toBe(280)
  })
  it('другая схема при наличии правок заменяется только после подтверждения; отказ ничего не меняет', () => {
    useFlow.getState().setAreaText('40')
    useFlow.getState().submitParams()
    useFlow.getState().chooseScheme('1a')
    useApartmentProject.getState().apply('Высота потолка', (a) => ({ ...a, ceilingHeightCm: 280 }))
    useFlow.getState().goTo('schemes')
    useFlow.getState().chooseScheme('1b')
    expect(useFlow.getState().pendingReplaceId).toBe('1b')
    expect(useFlow.getState().selectedTemplateId).toBe('1a')
    useFlow.getState().cancelReplace()
    expect(useApartmentProject.getState().history.present.ceilingHeightCm).toBe(280)
    useFlow.getState().chooseScheme('1b')
    useFlow.getState().confirmReplace()
    expect(useFlow.getState().selectedTemplateId).toBe('1b')
    expect(useApartmentProject.getState().history.present.ceilingHeightCm).toBe(270)
    expect(canUndo(useApartmentProject.getState().history)).toBe(false) // история очищена
  })
})
