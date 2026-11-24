import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { validateFurniturePlacement, validatePlacement } from '../../src/domain/placement'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Настенные предметы (D-30): телевизор, картина, зеркало, полка, часы; высота подвеса меняется.
const apt = () => useApartmentProject.getState().history.present
const ed = () => useInteriorEditor.getState()
const items = (id: string) => Object.values(apt().furniture).filter((f) => f.catalogItemId === id)
const WALL_IDS = ['own_tv_wall', 'own_picture', 'own_mirror', 'own_shelf_wall', 'own_clock_wall']

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(buildApartment(templateById('1b')!))
  useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null, lightsOff: {} })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
  useInterior.getState().enter(Object.values(apt().rooms).find((r) => r.name === 'Комната')!.id)
})

describe('каталог настенных предметов', () => {
  it('телевизор, картина, зеркало, полка и часы — настенные, с высотой по умолчанию, помещающейся под потолок', () => {
    for (const id of WALL_IDS) {
      const i = CATALOG[id]
      expect(i, id).toBeDefined()
      expect(i.mount, id).toBe('wall')
      expect(i.mountHeightCm, id).toBeGreaterThan(0)
      expect(i.mountHeightCm! + i.heightCm, id).toBeLessThanOrEqual(220)
      expect(i.colliders[0].depthCm, id).toBeLessThan(25) // тонкий предмет, вплотную к стене
    }
  })
})

describe('добавление и высота подвеса', () => {
  it.each(WALL_IDS)('%s ставится на стену на высоте по умолчанию, проект проходит проверку', (id) => {
    ed().addAtFreeSpot(id)
    const f = items(id)[0]
    expect(f, `${id} не поставился: ${ed().message}`).toBeDefined()
    expect(f.elevationCm).toBe(CATALOG[id].mountHeightCm)
    expect(validateFurniturePlacement(CATALOG)(apt())).toEqual([])
  })

  it('высота меняется одним шагом истории и отменяется', () => {
    ed().addAtFreeSpot('own_picture')
    const f = items('own_picture')[0]
    ed().select(f.id)
    const before = apt().furniture[f.id].elevationCm
    ed().setElevation(150)
    expect(apt().furniture[f.id].elevationCm).toBe(150)
    expect(ed().message).toBeNull()
    useApartmentProject.getState().undo()
    expect(apt().furniture[f.id].elevationCm).toBe(before)
  })

  it('высота выше потолка и ниже пола отклоняется с причиной, предмет не меняется', () => {
    ed().addAtFreeSpot('own_picture')
    const f = items('own_picture')[0]
    ed().select(f.id)
    const max = apt().ceilingHeightCm - CATALOG.own_picture.heightCm
    ed().setElevation(max + 1)
    expect(ed().message).toMatch(/потол/)
    expect(apt().furniture[f.id].elevationCm).toBe(CATALOG.own_picture.mountHeightCm)
    ed().setElevation(-5)
    expect(ed().message).toMatch(/пола/)
    ed().setElevation(max) // ровно под потолок допустимо
    expect(apt().furniture[f.id].elevationCm).toBe(max)
    expect(ed().message).toBeNull()
  })

  it('нечисловая высота отклоняется, у напольного предмета высота не меняется', () => {
    ed().addAtFreeSpot('own_clock_wall')
    const clock = items('own_clock_wall')[0]
    ed().select(clock.id)
    ed().setElevation(Number.NaN)
    expect(ed().message).toMatch(/числом/)
    ed().addAtFreeSpot('kenney_bedDouble')
    const bed = items('kenney_bedDouble')[0]
    ed().select(bed.id)
    ed().setElevation(50)
    expect(ed().message).toMatch(/настенных/)
    expect(apt().furniture[bed.id].elevationCm).toBe(0)
  })

  it('перенос вдоль стены сохраняет выбранную высоту', () => {
    ed().addAtFreeSpot('own_mirror')
    const f = items('own_mirror')[0]
    ed().select(f.id)
    ed().setElevation(60)
    const cur = apt().furniture[f.id]
    ed().nudge(cur.angleDeg % 180 === 0 ? 10 : 0, cur.angleDeg % 180 === 0 ? 0 : 10)
    const after = apt().furniture[f.id]
    expect(after.elevationCm).toBe(60)
    expect(validateFurniturePlacement(CATALOG)(apt())).toEqual([])
  })

  it('перенос предмета проверяется на его высоте: у потолочной высоты не «проходит» по высоте бра', () => {
    ed().addAtFreeSpot('own_picture')
    const f = items('own_picture')[0]
    const max = apt().ceilingHeightCm - CATALOG.own_picture.heightCm
    const res = validatePlacement(apt(), CATALOG, { ...f, elevationCm: max + 10 })
    expect(res.valid).toBe(false)
    expect(res.code).toBe('bad-support')
  })
})

describe('потолок и настенные предметы', () => {
  it('снижение потолка, из-за которого предмет упирается в потолок, отклоняется проверкой проекта', () => {
    ed().addAtFreeSpot('own_clock_wall')
    const f = items('own_clock_wall')[0]
    ed().select(f.id)
    ed().setElevation(apt().ceilingHeightCm - CATALOG.own_clock_wall.heightCm) // впритык к потолку
    const lowered = { ...apt(), ceilingHeightCm: apt().ceilingHeightCm - 10 }
    const issues = validateFurniturePlacement(CATALOG)(lowered)
    expect(issues.length).toBeGreaterThan(0)
  })
})
