import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { FURNISH_SETS, furnishSetFor, STYLE_SETS, type FurnishStyle } from '../../src/catalog/sets'
import { analyzeClearance } from '../../src/domain/clearance'
import { validateFurniturePlacement } from '../../src/domain/placement'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Готовые наборы мебели (этап 4 доработок, D-33).
const apt = () => useApartmentProject.getState().history.present
const ed = () => useInteriorEditor.getState()

describe('состав наборов', () => {
  it('все предметы наборов есть в каталоге, ссылки on/near указывают на более ранние предметы', () => {
    for (const [type, set] of [...Object.entries(FURNISH_SETS), ...Object.values(STYLE_SETS).flatMap((m) => Object.entries(m))]) {
      set!.entries.forEach((e, i) => {
        expect(CATALOG[e.id], `${type}: ${e.id}`).toBeDefined()
        if (e.ref !== undefined) expect(e.ref, `${type}[${i}]`).toBeLessThan(i)
        if (e.place === 'on') expect(CATALOG[e.id].mount, `${type}[${i}]`).toBe('surface')
      })
    }
  })

  it('лофт: для комнат без своего лофт-набора берётся обычный', () => {
    expect(furnishSetFor('bathroom', 'loft')).toBe(FURNISH_SETS.bathroom)
    expect(furnishSetFor('living', 'loft')).toBe(STYLE_SETS.loft.living)
    expect(furnishSetFor('living', 'classic')).toBe(FURNISH_SETS.living)
  })
})

describe('расстановка набора в комнате', () => {
  const styles: FurnishStyle[] = ['loft', 'hightech', 'scandi', 'minimal']
  const cases: Array<readonly ['1b', string, FurnishStyle]> = [['1b', 'Комната', 'classic'], ['1b', 'Кухня', 'classic'], ['1b', 'Санузел', 'classic'], ...styles.flatMap((s) => [['1b', 'Комната', s], ['1b', 'Кухня', s]] as const)]
  for (const [tpl, roomName, style] of cases) {
    it(`${roomName} (${style}): набор одной командой, проект проходит проверку, проходы без замечаний`, () => {
      resetFlowForTests()
      useApartmentProject.getState().reset(buildApartment(templateById(tpl)!))
      useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null, lightsOff: {} })
      useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
      const room = Object.values(apt().rooms).find((r) => r.name === roomName)!
      useInterior.getState().enter(room.id)
      const set = furnishSetFor(room.type, style)!
      const before = Object.keys(apt().furniture).length
      ed().furnishRoom(set.entries)
      const n = Object.keys(apt().furniture).length - before
      expect(n, ed().message ?? '').toBeGreaterThanOrEqual(Math.ceil(set.entries.length / 2))
      expect(validateFurniturePlacement(CATALOG)(apt())).toEqual([])
      expect(analyzeClearance(apt(), CATALOG, room.id).filter((i) => i.kind !== 'narrow')).toEqual([])
      useApartmentProject.getState().undo() // один шаг на весь набор
      expect(Object.keys(apt().furniture).length).toBe(before)
    })
  }
})
