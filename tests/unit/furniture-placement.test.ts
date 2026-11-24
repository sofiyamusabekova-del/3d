import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { validatePlacement } from '../../src/domain/placement'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { roomCenter } from '../../src/scene3d/roomGeometry'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 14: размещение из каталога, поворот ручкой и стрелки, отмена переноса (SPEC D-10, AC-06–AC-08, AC-16).
const apt = () => useApartmentProject.getState().history.present
const ed = () => useInteriorEditor.getState()
const rooms = () => Object.values(apt().rooms)
const roomId = () => useInterior.getState().activeRoomId!

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(buildApartment(templateById('1b')!))
  useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
  useInterior.getState().enter(rooms().find((r) => r.name === 'Комната')!.id)
})

describe('14.1–14.2 перенос из каталога', () => {
  it('допустимое отпускание из каталога добавляет предмет один раз, в активную комнату', () => {
    const c = roomCenter(apt(), roomId())
    ed().beginDrag({ catalogItemId: 'sofa_02' }, { x: -1e5, z: -1e5 }, 'catalog')
    expect(ed().draft?.result.valid).toBe(false) // пока указатель не над комнатой
    ed().moveDrag({ x: c.x, z: c.z }, false)
    expect(ed().draft?.result.valid).toBe(true)
    ed().endDrag()
    const items = Object.values(apt().furniture)
    expect(items).toHaveLength(1)
    expect(items[0].roomId).toBe(roomId())
    expect(ed().draft).toBeNull()
    expect(ed().selectedId).toBe(items[0].id)
  })

  it('точка захвата сохраняется: при переносе существующего предмета он не прыгает к указателю', () => {
    ed().addAtFreeSpot('sofa_02')
    const f = Object.values(apt().furniture)[0]
    ed().beginDrag({ id: f.id }, { x: f.xCm + 20, z: f.zCm + 10 }, 'plan')
    ed().moveDrag({ x: f.xCm + 20, z: f.zCm + 10 }, true)
    expect(ed().draft?.xCm).toBe(f.xCm)
    expect(ed().draft?.zCm).toBe(f.zCm)
  })

  it('недопустимое отпускание из каталога ничего не добавляет и объясняет причину (AC-08)', () => {
    ed().beginDrag({ catalogItemId: 'sofa_02' }, { x: -1e5, z: -1e5 }, 'catalog')
    ed().moveDrag({ x: -500, z: -500 }, true)
    ed().endDrag()
    expect(Object.keys(apt().furniture)).toHaveLength(0)
    expect(ed().message).toBeTruthy()
    expect(ed().draft).toBeNull()
  })

  it('отмена переноса (Esc) не меняет проект и не пишет в историю', () => {
    const c = roomCenter(apt(), roomId())
    const before = JSON.stringify(apt())
    const undoDepth = useApartmentProject.getState().history.past.length
    ed().beginDrag({ catalogItemId: 'sofa_02' }, { x: c.x, z: c.z }, 'catalog')
    ed().moveDrag({ x: c.x + 10, z: c.z }, false)
    ed().cancelDrag()
    expect(JSON.stringify(apt())).toBe(before)
    expect(useApartmentProject.getState().history.past.length).toBe(undoDepth)
  })

  it('один результат проверки в плане и в 3D для одних и тех же координат (14.7)', () => {
    const c = roomCenter(apt(), roomId())
    const outcomes = (['plan', '3d', 'catalog'] as const).map((view) => {
      ed().beginDrag({ catalogItemId: 'sofa_02' }, { x: c.x, z: c.z }, view)
      const r = ed().draft!.result
      ed().cancelDrag()
      return r
    })
    expect(outcomes[1]).toEqual(outcomes[0])
    expect(outcomes[2]).toEqual(outcomes[0])
    const direct = validatePlacement(apt(), CATALOG, { id: null, catalogItemId: 'sofa_02', roomId: roomId(), xCm: c.x, zCm: c.z, angleDeg: 0 })
    expect(outcomes[0]).toEqual(direct)
  })
})

/** Диван в центре комнаты: при повороте угол не упирается в стену. */
function centredSofa() {
  ed().addAtFreeSpot('sofa_02')
  const f = Object.values(apt().furniture)[0]
  const c = roomCenter(apt(), roomId())
  ed().beginDrag({ id: f.id }, { x: f.xCm, z: f.zCm }, 'plan')
  ed().moveDrag({ x: c.x, z: c.z }, false)
  ed().endDrag()
  return apt().furniture[f.id]
}

describe('14.4 поворот', () => {
  it('ручка: угол привязывается к 15°, Alt даёт свободный угол, положение не меняется', () => {
    const f = centredSofa()
    ed().beginRotate(f.id, 'plan')
    ed().rotateTo(37, false)
    expect(ed().draft?.angleDeg).toBe(30)
    ed().rotateTo(37, true)
    expect(ed().draft?.angleDeg).toBe(37)
    ed().rotateTo(-10, false)
    expect(ed().draft?.angleDeg).toBe(345)
    ed().moveDrag({ x: 0, z: 0 }, false) // в режиме поворота перенос игнорируется
    expect(ed().draft?.xCm).toBe(f.xCm)
    ed().endDrag()
    expect(apt().furniture[f.id]).toMatchObject({ xCm: f.xCm, zCm: f.zCm, angleDeg: 345 })
  })

  it('поворот ручкой — один шаг истории; отмена возвращает прежний угол', () => {
    const f = centredSofa()
    const depth = useApartmentProject.getState().history.past.length
    ed().beginRotate(f.id, 'plan')
    ed().rotateTo(90, false)
    ed().rotateTo(45, false)
    ed().endDrag()
    expect(useApartmentProject.getState().history.past.length).toBe(depth + 1)
    useApartmentProject.getState().undo()
    expect(apt().furniture[f.id].angleDeg).toBe(0)
  })

  it('поворот клавишей R на 15° и Shift+R на −15°', () => {
    const f = centredSofa()
    ed().rotate(15)
    expect(apt().furniture[f.id].angleDeg).toBe(15)
    ed().rotate(-15)
    ed().rotate(-15)
    expect(apt().furniture[f.id].angleDeg).toBe(345)
  })
})

describe('D-10 стрелки', () => {
  it('стрелка сдвигает на 1 см, с Shift на 10 см; недопустимый сдвиг отклоняется с причиной', () => {
    ed().addAtFreeSpot('sofa_02')
    const f = Object.values(apt().furniture)[0]
    ed().nudge(1, 0)
    expect(apt().furniture[f.id].xCm).toBe(f.xCm + 1)
    ed().nudge(0, 10)
    expect(apt().furniture[f.id].zCm).toBe(f.zCm + 10)
    const before = JSON.stringify(apt())
    ed().nudge(-5000, 0)
    expect(JSON.stringify(apt())).toBe(before)
    expect(ed().message).toBeTruthy()
  })

  it('без выбранного предмета ничего не происходит', () => {
    const before = JSON.stringify(apt())
    ed().nudge(1, 1)
    expect(JSON.stringify(apt())).toBe(before)
  })
})
