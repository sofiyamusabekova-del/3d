import { beforeEach, describe, expect, it } from 'vitest'
import { BOARD_CM, BOARD_ROWS, FLOOR_KINDS, FLOORS, floorColorOf, floorSwatchHex, isKnownFloor } from '../../src/catalog/floors'
import { setFloorCoveringCommand, validateFloorCoverings } from '../../src/domain/floors'
import { validateApartment } from '../../src/domain/validate'
import { planDrawing } from '../../src/plan2d/drawing'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { buildApartment, templateById } from '../../src/scenario/layouts'
import { LAMINATE_ROWS } from '../../src/scene3d/floorTexture'

// Этап 23 (SPEC D-16): покрытие пола комнаты: данные, история отмены, целостность, физический масштаб.
const apt = () => useApartmentProject.getState().history.present
const rooms = () => Object.values(apt().rooms)

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(buildApartment(templateById('1b')!))
})

describe('23.1 данные и история', () => {
  it('три вида покрытия, у каждого по три цвета; цвета и id уникальны', () => {
    expect(FLOOR_KINDS).toEqual(['laminate', 'linoleum', 'carpet'])
    const ids = new Set<string>()
    for (const k of FLOOR_KINDS) {
      expect(FLOORS[k].colors, k).toHaveLength(3)
      for (const c of FLOORS[k].colors) {
        expect(c.hex, c.id).toMatch(/^#[0-9a-f]{6}$/)
        expect(ids.has(c.id), `дубликат ${c.id}`).toBe(false)
        ids.add(c.id)
      }
    }
  })

  it('покрытие назначается комнате отдельным шагом истории и снимается; другие комнаты не меняются', () => {
    const [a, b] = rooms()
    expect(apt().floorCoverings).toEqual({})
    const past = useApartmentProject.getState().history.past.length
    expect(useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(a.id, { kind: 'laminate', colorId: 'oak_light' })).ok).toBe(true)
    expect(apt().floorCoverings[a.id]).toEqual({ kind: 'laminate', colorId: 'oak_light' })
    expect(apt().floorCoverings[b.id]).toBeUndefined()
    expect(useApartmentProject.getState().history.past.length).toBe(past + 1)
    // Смена на другой вид и цвет — ещё один шаг, снять — третий.
    useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(a.id, { kind: 'carpet', colorId: 'carpet_blue' }))
    useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(b.id, { kind: 'linoleum', colorId: 'lino_gray' }))
    expect(apt().floorCoverings).toEqual({ [a.id]: { kind: 'carpet', colorId: 'carpet_blue' }, [b.id]: { kind: 'linoleum', colorId: 'lino_gray' } })
    useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(a.id, null))
    expect(apt().floorCoverings[a.id]).toBeUndefined()
    expect(apt().floorCoverings[b.id]).toBeDefined()
  })

  it('отмена и повтор возвращают покрытие целиком', () => {
    const [a] = rooms()
    const set = (c: { kind: 'laminate' | 'linoleum' | 'carpet'; colorId: string } | null) => useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(a.id, c))
    set({ kind: 'laminate', colorId: 'walnut_dark' })
    set({ kind: 'linoleum', colorId: 'lino_beige' })
    useApartmentProject.getState().undo()
    expect(apt().floorCoverings[a.id]).toEqual({ kind: 'laminate', colorId: 'walnut_dark' })
    useApartmentProject.getState().undo()
    expect(apt().floorCoverings[a.id]).toBeUndefined()
    useApartmentProject.getState().redo()
    useApartmentProject.getState().redo()
    expect(apt().floorCoverings[a.id]).toEqual({ kind: 'linoleum', colorId: 'lino_beige' })
  })

  it('неизвестная комната и неизвестные вид и цвет отклоняются проверкой, проект не меняется', () => {
    const before = JSON.stringify(apt())
    expect(() => setFloorCoveringCommand('нет-такой', { kind: 'carpet', colorId: 'carpet_gray' })(apt())).toThrow()
    const [a] = rooms()
    const bad1 = useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(a.id, { kind: 'laminate', colorId: 'нет-цвета' }))
    expect(bad1.ok).toBe(false)
    const bad2 = useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(a.id, { kind: 'parquet' as never, colorId: 'oak_light' }))
    expect(bad2.ok).toBe(false)
    expect(JSON.stringify(apt())).toBe(before)
  })

  it('проверка целостности: ссылка на несуществующую комнату и неизвестное покрытие дают причину', () => {
    const [a] = rooms()
    const good = { ...apt(), floorCoverings: { [a.id]: { kind: 'laminate' as const, colorId: 'oak_light' } } }
    expect(validateFloorCoverings(isKnownFloor)(good)).toEqual([])
    expect(validateApartment(good)).toEqual([])
    const orphan = { ...apt(), floorCoverings: { ghost: { kind: 'laminate' as const, colorId: 'oak_light' } } }
    expect(validateApartment(orphan).some((i) => i.code === 'missing-ref')).toBe(true)
    const unknown = { ...apt(), floorCoverings: { [a.id]: { kind: 'carpet' as const, colorId: 'oak_light' } } }
    const issues = validateFloorCoverings(isKnownFloor)(unknown)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain(a.name)
  })

  it('покрытие не мешает размещению мебели и не попадает в проверку геометрии', () => {
    const [a] = rooms()
    useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(a.id, { kind: 'carpet', colorId: 'carpet_gray' }))
    expect(validateApartment(apt())).toEqual([])
  })
})

describe('23.2 физический масштаб и цвет на плане', () => {
  it('ламинат: доски 19 × 120 см, четыре ряда в образце 120 × 76 см со смещением швов', () => {
    expect(BOARD_CM).toEqual({ widthCm: 19, lengthCm: 120 })
    expect(BOARD_ROWS).toBe(4)
    expect(FLOORS.laminate.tileCm).toEqual({ widthCm: 120, heightCm: 76 })
    expect(LAMINATE_ROWS).toHaveLength(4)
    const seams = LAMINATE_ROWS.map((r) => r.seamCm)
    expect(new Set(seams).size).toBe(4) // швы соседних рядов не совпадают
    for (let i = 0; i < 4; i++) {
      const next = seams[(i + 1) % 4]
      expect(Math.abs(seams[i] - next), `ряды ${i} и ${(i + 1) % 4}`).toBeGreaterThan(15)
    }
    for (const s of seams) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(120) }
  })

  it('образцы линолеума и ковролина заданы в см: повторов на метр из размера', () => {
    expect(FLOORS.linoleum.tileCm).toEqual({ widthCm: 100, heightCm: 100 })
    expect(FLOORS.carpet.tileCm).toEqual({ widthCm: 50, heightCm: 50 })
    expect(FLOORS.carpet.roughness).toBe(1)
    expect(FLOORS.laminate.roughness).toBeLessThan(FLOORS.carpet.roughness)
  })

  it('на плане комната закрашена цветом покрытия, остальные прежним цветом', () => {
    const [a, b] = rooms()
    useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(a.id, { kind: 'laminate', colorId: 'walnut_dark' }))
    const d = planDrawing(apt())
    expect(d.rooms.find((r) => r.id === a.id)!.floorHex).toBe(floorSwatchHex({ kind: 'laminate', colorId: 'walnut_dark' }))
    expect(d.rooms.find((r) => r.id === b.id)!.floorHex).toBeNull()
    expect(floorColorOf({ kind: 'laminate', colorId: 'walnut_dark' })?.name).toBe('Орех тёмный')
    expect(floorSwatchHex(undefined)).toBeNull()
  })
})
