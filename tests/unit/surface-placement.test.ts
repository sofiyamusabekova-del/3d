import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { validatePlacement } from '../../src/domain/placement'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { buildApartment, templateById } from '../../src/scenario/layouts'
import { roomCenter } from '../../src/scene3d/roomGeometry'

// Настольная техника: ставится на поверхность стола или тумбы и едет вместе с ней.
const apt = () => useApartmentProject.getState().history.present
const ed = () => useInteriorEditor.getState()
const roomId = () => useInterior.getState().activeRoomId!
const TABLE = 'kenney_cabinetTelevision'
const furnitureOf = (catalogItemId: string) => Object.values(apt().furniture).filter((f) => f.catalogItemId === catalogItemId)

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(buildApartment(templateById('1b')!))
  useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
  useInterior.getState().enter(Object.values(apt().rooms).find((r) => r.name === 'Комната')!.id)
})

describe('настольные предметы', () => {
  it('в каталоге есть ноутбук, монитор, радиоприёмник, тостер и микроволновка, все настольные', () => {
    for (const id of ['kenney_laptop', 'kenney_computerScreen', 'kenney_radio', 'kenney_toaster', 'kenney_kitchenMicrowave', 'kenney_televisionModern']) {
      expect(CATALOG[id]?.mount, id).toBe('surface')
    }
  })

  it('на пустом полу ставить нельзя, причина названа', () => {
    const c = roomCenter(apt(), roomId())
    const r = validatePlacement(apt(), CATALOG, { id: null, catalogItemId: 'kenney_laptop', roomId: roomId(), xCm: c.x, zCm: c.z, angleDeg: 0 })
    expect(r.valid).toBe(false)
    expect(r.code).toBe('bad-support')
    ed().addAtFreeSpot('kenney_laptop')
    expect(furnitureOf('kenney_laptop')).toHaveLength(0)
    expect(ed().message).toContain('стол или тумбу')
  })

  it('на тумбе предмет получает высоту её поверхности', () => {
    ed().addAtFreeSpot(TABLE)
    const table = furnitureOf(TABLE)[0]
    ed().addAtFreeSpot('kenney_laptop')
    const laptop = furnitureOf('kenney_laptop')[0]
    expect(laptop).toBeDefined()
    expect(laptop.elevationCm).toBeCloseTo(CATALOG[TABLE].heightCm, 1)
    expect(Math.abs(laptop.xCm - table.xCm)).toBeLessThanOrEqual(CATALOG[TABLE].widthCm / 2)
  })

  it('два предмета не делят одно место на столе', () => {
    ed().addAtFreeSpot(TABLE)
    const t = furnitureOf(TABLE)[0]
    ed().addAtFreeSpot('kenney_laptop')
    const l = furnitureOf('kenney_laptop')[0]
    const r = validatePlacement(apt(), CATALOG, { id: null, catalogItemId: 'kenney_radio', roomId: roomId(), xCm: l.xCm, zCm: l.zCm, angleDeg: 0 })
    expect(r.valid).toBe(false)
    expect(r.code).toBe('overlap')
    expect(t.id).not.toBe(l.id)
  })

  it('предмет, вылезающий за край стола, не принимается', () => {
    ed().addAtFreeSpot(TABLE)
    const t = furnitureOf(TABLE)[0]
    const r = validatePlacement(apt(), CATALOG, {
      id: null, catalogItemId: 'kenney_computerScreen', roomId: roomId(), xCm: t.xCm + CATALOG[TABLE].widthCm / 2, zCm: t.zCm, angleDeg: 0,
    })
    expect(r.valid).toBe(false)
    expect(r.code).toBe('bad-support')
  })

  it('перенос и поворот опоры берут предмет с собой, удаление опоры удаляет и его', () => {
    ed().addAtFreeSpot(TABLE)
    const t0 = furnitureOf(TABLE)[0]
    ed().addAtFreeSpot('kenney_laptop')
    const l0 = furnitureOf('kenney_laptop')[0]

    ed().select(t0.id)
    ed().nudge(10, 0)
    expect(ed().message).toBeNull()
    const t1 = furnitureOf(TABLE)[0]
    const l1 = furnitureOf('kenney_laptop')[0]
    expect(t1.xCm - t0.xCm).toBeCloseTo(10)
    expect(l1.xCm - l0.xCm).toBeCloseTo(10)
    expect(l1.elevationCm).toBeCloseTo(l0.elevationCm)

    ed().rotate(180) // на 180° занимаемое место то же, стена не мешает
    expect(ed().message).toBeNull()
    const t2 = furnitureOf(TABLE)[0]
    const l2 = furnitureOf('kenney_laptop')[0]
    expect(t2.angleDeg).toBe(180)
    expect(l2.angleDeg).toBe(180)
    // Расстояние от ноутбука до центра тумбы при повороте не меняется.
    expect(Math.hypot(l2.xCm - t2.xCm, l2.zCm - t2.zCm)).toBeCloseTo(Math.hypot(l1.xCm - t1.xCm, l1.zCm - t1.zCm), 3)

    ed().removeSelected()
    expect(Object.keys(apt().furniture)).toHaveLength(0)
  })
})
