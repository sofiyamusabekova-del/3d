import { beforeEach, describe, expect, it } from 'vitest'
import { TECH_CATALOG } from '../../src/catalog/techCatalog'
import { roomClearPolygon } from '../../src/domain/derive'
import { roomsOfWall } from '../../src/domain/doors'
import { proposeWallMove, wallInfo } from '../../src/domain/geometryEdit'
import { validatePlacement } from '../../src/domain/placement'
import type { Apartment, FurnitureInstance } from '../../src/domain/types'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { roomCenter } from '../../src/scene3d/roomGeometry'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { buildApartment, templateById } from '../../src/scenario/layouts'

const apt = () => useApartmentProject.getState().history.present
const rooms = () => Object.values(apt().rooms)

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(buildApartment(templateById('1b')!))
  useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
  useInterior.getState().enter(rooms().find((r) => r.name === 'Комната')!.id)
})

describe('11.2 общий редактор плана и 3D', () => {
  it('предмет добавляется в активную комнату, допустим и выбран', () => {
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const f = Object.values(apt().furniture)[0]
    expect(f.roomId).toBe(useInterior.getState().activeRoomId)
    expect(useInteriorEditor.getState().selectedId).toBe(f.id)
    expect(validatePlacement(apt(), TECH_CATALOG, { id: f.id, catalogItemId: f.catalogItemId, roomId: f.roomId, xCm: f.xCm, zCm: f.zCm, angleDeg: f.angleDeg }).valid).toBe(true)
  })

  it('перенос из плана и из 3D дают одинаковые координаты', () => {
    const e = useInteriorEditor.getState()
    e.addAtFreeSpot('sofa_02')
    const f = Object.values(apt().furniture)[0]
    for (const view of ['plan', '3d'] as const) {
      const target = { x: f.xCm + 20, z: f.zCm + 15 }
      useInteriorEditor.getState().beginDrag({ id: f.id }, { x: f.xCm, z: f.zCm }, view)
      useInteriorEditor.getState().moveDrag(target, false)
      useInteriorEditor.getState().endDrag()
      const now = apt().furniture[f.id]
      expect(now.xCm).toBe(Math.round((f.xCm + 20) / 5) * 5)
      expect(now.zCm).toBe(Math.round((f.zCm + 15) / 5) * 5)
      useApartmentProject.getState().undo()
    }
  })

  it('поворот меняет угол один раз для обоих представлений; недопустимый поворот отклоняется', () => {
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const id = Object.keys(apt().furniture)[0]
    const c = roomCenter(apt(), useInterior.getState().activeRoomId!)
    useInteriorEditor.getState().beginDrag({ id }, { x: apt().furniture[id].xCm, z: apt().furniture[id].zCm }, 'plan')
    useInteriorEditor.getState().moveDrag({ x: c.x, z: c.z }, false)
    useInteriorEditor.getState().endDrag()
    useInteriorEditor.getState().rotate(15)
    expect(apt().furniture[id].angleDeg).toBe(15)
  })

  it('недопустимое отпускание не меняет проект', () => {
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const f = Object.values(apt().furniture)[0]
    const before = JSON.stringify(apt())
    useInteriorEditor.getState().beginDrag({ id: f.id }, { x: f.xCm, z: f.zCm }, 'plan')
    useInteriorEditor.getState().moveDrag({ x: -500, z: -500 }, true)
    expect(useInteriorEditor.getState().draft!.result.valid).toBe(false)
    useInteriorEditor.getState().endDrag()
    expect(JSON.stringify(apt())).toBe(before)
    expect(useInteriorEditor.getState().message).toBeTruthy()
  })

  it('смена комнаты сбрасывает выбор предмета и незавершённый перенос', () => {
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const f = Object.values(apt().furniture)[0]
    useInteriorEditor.getState().beginDrag({ id: f.id }, { x: f.xCm, z: f.zCm }, '3d')
    useInterior.getState().enter(rooms().find((r) => r.name === 'Кухня')!.id)
    expect(useInteriorEditor.getState().selectedId).toBeNull()
    expect(useInteriorEditor.getState().draft).toBeNull()
  })

  it('выбор проёма снимает выбор предмета и наоборот', () => {
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const open = Object.values(apt().openings).find((o) => roomsOfWall(apt(), o.wallId).includes(useInterior.getState().activeRoomId!))!
    useInterior.getState().select(open.id)
    expect(useInteriorEditor.getState().selectedId).toBeNull()
    const f = Object.values(apt().furniture)[0]
    useInteriorEditor.getState().select(f.id)
    expect(useInterior.getState().selectedOpeningId).toBeNull()
  })

  it('идентификаторы новых предметов не пересекаются с существующими', () => {
    for (let i = 0; i < 3; i++) useInteriorEditor.getState().addAtFreeSpot('dining_chair_02')
    const ids = Object.keys(apt().furniture)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(3)
  })
})

describe('11.3 перестройка после изменения геометрии', () => {
  const sofa = (roomId: string, x: number, z: number): FurnitureInstance => ({ id: 'f1', catalogItemId: 'sofa_02', assetVersion: TECH_CATALOG.sofa_02.version, roomId, xCm: x, zCm: z, elevationCm: 0, angleDeg: 0 })

  it('сдвиг стены с мебелью: проект хранит предмет один раз, в нужной комнате', () => {
    const a = apt()
    const living = rooms().find((r) => r.name === 'Комната')!
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const f = Object.values(apt().furniture)[0]
    const wall = living.boundary.map((b) => a.walls[b.wallId]).find((w) => {
      const info = wallInfo(a, w.id)
      return info.line.axis === 'x' && !info.line.exterior
    })!
    const p = proposeWallMove(apt(), wall.id, 20, { catalog: TECH_CATALOG })
    if (p.ok) {
      expect(useApartmentProject.getState().apply('Сдвиг', () => p.candidate!).ok).toBe(true)
      expect(Object.keys(apt().furniture)).toEqual([f.id])
      expect(apt().furniture[f.id].roomId).toBe(living.id)
    }
  })

  it('конфликт мебели в скрытой комнате блокирует сдвиг с названием комнаты и предмета (AC-09)', () => {
    const kitchen = rooms().find((r) => r.name === 'Кухня')!
    const living = rooms().find((r) => r.name === 'Комната')!
    useInterior.getState().enter(kitchen.id)
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const sofaId = Object.keys(apt().furniture)[0]
    expect(apt().furniture[sofaId].roomId).toBe(kitchen.id)
    // Диван вплотную к левой стене кухни (она общая с комнатой).
    const minX = Math.min(...roomClearPolygon(apt(), kitchen).map((q) => q.x))
    const sf = apt().furniture[sofaId]
    useInteriorEditor.getState().beginDrag({ id: sofaId }, { x: sf.xCm, z: sf.zCm }, 'plan')
    useInteriorEditor.getState().moveDrag({ x: minX + 91.5, z: sf.zCm }, true)
    useInteriorEditor.getState().endDrag()
    expect(apt().furniture[sofaId].xCm).toBeGreaterThanOrEqual(minX + 91)
    expect(apt().furniture[sofaId].xCm).toBeLessThanOrEqual(minX + 93)
    // Работаем из другой комнаты: кухня скрыта, но проверка её мебели обязана сработать.
    useInterior.getState().enter(living.id)
    const shared = kitchen.boundary.map((b) => apt().walls[b.wallId]).find((w) => roomsOfWall(apt(), w.id).includes(living.id))!
    const k = wallInfo(apt(), shared.id).rooms.find((r) => r.roomId === kitchen.id)!
    const before = JSON.stringify(apt())
    const delta = -20 * k.sign // кухня становится уже на 20 см
    const p = proposeWallMove(apt(), shared.id, delta, { catalog: TECH_CATALOG })
    expect(p.ok).toBe(false)
    expect(p.issues[0].message).toContain('«Кухня»')
    expect(p.issues[0].message).toContain('«Диван»')
    // Та же правка через общую команду проекта тоже отклоняется, проект не меняется.
    const r = useApartmentProject.getState().apply('Сдвиг', (cur) => proposeWallMove(cur, shared.id, delta).candidate ?? cur)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(apt())).toBe(before)
  })
  it('проект с мебелью отклоняет некорректную мебель общей командой', () => {
    const living = rooms().find((r) => r.name === 'Комната')!
    const r = useApartmentProject.getState().apply('test', (cur: Apartment) => ({ ...cur, furniture: { f1: sofa(living.id, -1000, -1000) } }))
    expect(r.ok).toBe(false)
    expect(Object.keys(apt().furniture)).toHaveLength(0)
  })
})
