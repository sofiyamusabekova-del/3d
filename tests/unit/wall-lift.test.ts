import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Перенос настенного предмета по высоте (Shift + перетаскивание в 3D), этап 1 доработок D-30.
const apt = () => useApartmentProject.getState().history.present
const ed = () => useInteriorEditor.getState()

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(buildApartment(templateById('1b')!))
  useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null, lightsOff: {} })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
  useInterior.getState().enter(Object.values(apt().rooms).find((r) => r.name === 'Комната')!.id)
  ed().addAtFreeSpot('own_picture')
})

const pic = () => Object.values(apt().furniture).find((f) => f.catalogItemId === 'own_picture')!
const centreY = (f: { elevationCm: number }) => f.elevationCm + CATALOG.own_picture.heightCm / 2

describe('перенос настенного предмета по высоте', () => {
  it('указатель на стене задаёт высоту с шагом 5 см, отпускание применяет её одним шагом истории', () => {
    const f = pic()
    ed().beginLift(f.id, centreY(f)) // схватили за центр
    expect(ed().draft?.mode).toBe('lift')
    ed().liftTo(centreY(f) + 23, false) // выше на 23 см → 130 + 23 = 153 → шаг 5 = 155
    expect(ed().draft?.elevationCm).toBe(155)
    expect(ed().draft?.result.valid).toBe(true)
    ed().endDrag()
    expect(pic().elevationCm).toBe(155)
    useApartmentProject.getState().undo()
    expect(pic().elevationCm).toBe(130)
  })

  it('Alt даёт шаг 1 см', () => {
    const f = pic()
    ed().beginLift(f.id, centreY(f))
    ed().liftTo(centreY(f) + 23, true)
    expect(ed().draft?.elevationCm).toBe(153)
  })

  it('выше потолка черновик красный, предмет остаётся на месте', () => {
    const f = pic()
    ed().beginLift(f.id, centreY(f))
    ed().liftTo(centreY(f) + 500, false)
    expect(ed().draft?.result.valid).toBe(false)
    ed().endDrag()
    expect(pic().elevationCm).toBe(130)
    expect(ed().message).toMatch(/потол/)
  })

  it('ТВ-стенка FurniMesh подвесная: на стене на высоте 20 см, выше потолка не поднимается', () => {
    ed().addAtFreeSpot('fm_tv_wall')
    const w = Object.values(apt().furniture).find((x) => x.catalogItemId === 'fm_tv_wall')
    expect(w, ed().message ?? '').toBeDefined()
    expect(CATALOG.fm_tv_wall.mount).toBe('wall')
    expect(w!.elevationCm).toBe(20)
    ed().select(w!.id)
    ed().setElevation(apt().ceilingHeightCm - CATALOG.fm_tv_wall.heightCm + 10)
    expect(ed().message).toMatch(/потол/)
  })

  it('напольный предмет по высоте не тянется', () => {
    ed().addAtFreeSpot('kenney_bedDouble')
    const bed = Object.values(apt().furniture).find((x) => x.catalogItemId === 'kenney_bedDouble')!
    ed().beginLift(bed.id, 50)
    expect(ed().draft).toBeNull()
  })
})
