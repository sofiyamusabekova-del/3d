import * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { hashString, snapshotKey, takeSnapshot, verifyTraceScene, type ShotCamera } from '../../src/render/snapshot'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Этап 17.1, 17.4: контракт снимка и признак неактуальности (SPEC §13, D-09, AC-15).
const apt = () => useApartmentProject.getState().history.present
const cam: ShotCamera = { position: [1, 2, 3], quaternion: [0, 0, 0, 1], fov: 45, near: 0.05, far: 100 }
const roomId = () => useInterior.getState().activeRoomId!

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(buildApartment(templateById('1b')!))
  useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
  useInterior.getState().enter(Object.values(apt().rooms).find((r) => r.name === 'Комната')!.id)
})

describe('ключ снимка', () => {
  it('одинаковое состояние даёт одинаковый ключ, детерминированно', () => {
    expect(snapshotKey(apt(), roomId(), cam)).toBe(snapshotKey(apt(), roomId(), cam))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('меняется при добавлении, переносе и удалении предмета, отделке и высоте потолка', () => {
    const k0 = snapshotKey(apt(), roomId(), cam)
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const k1 = snapshotKey(apt(), roomId(), cam)
    expect(k1).not.toBe(k0)
    useInteriorEditor.getState().nudge(5, 0)
    const k2 = snapshotKey(apt(), roomId(), cam)
    expect(k2).not.toBe(k1)
    useInteriorEditor.getState().removeSelected()
    expect(snapshotKey(apt(), roomId(), cam)).not.toBe(k2)
    expect(snapshotKey({ ...apt(), ceilingHeightCm: 300 }, roomId(), cam)).not.toBe(k0)
  })

  it('отмена возвращает прежний ключ: состояние то же', () => {
    const k0 = snapshotKey(apt(), roomId(), cam)
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    useApartmentProject.getState().undo()
    expect(snapshotKey(apt(), roomId(), cam)).toBe(k0)
  })

  it('меняется при смене комнаты и камеры; дрожание ниже 1e-4 не считается изменением', () => {
    const k0 = snapshotKey(apt(), roomId(), cam)
    const other = Object.values(apt().rooms).find((r) => r.id !== roomId())!.id
    expect(snapshotKey(apt(), other, cam)).not.toBe(k0)
    expect(snapshotKey(apt(), roomId(), { ...cam, position: [1.5, 2, 3] })).not.toBe(k0)
    expect(snapshotKey(apt(), roomId(), { ...cam, fov: 50 })).not.toBe(k0)
    expect(snapshotKey(apt(), roomId(), { ...cam, position: [1.00001, 2, 3] })).toBe(k0)
  })
})

describe('описание снимка', () => {
  it('содержит только предметы своей комнаты, число проёмов и отделок', () => {
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const snap = takeSnapshot(apt(), roomId(), cam, { width: 960, height: 540 })
    expect(snap.furniture).toHaveLength(1)
    expect(snap.furniture[0]).toMatchObject({ catalogItemId: 'sofa_02' })
    expect(snap.openings).toBeGreaterThan(0)
    expect(snap.roomName).toBe('Комната')
    const kitchen = Object.values(apt().rooms).find((r) => r.name === 'Кухня')!.id
    expect(takeSnapshot(apt(), kitchen, cam, { width: 10, height: 10 }).furniture).toHaveLength(0)
  })

  it('неизвестная комната — ошибка, а не пустой снимок', () => {
    expect(() => takeSnapshot(apt(), 'нет такой', cam, { width: 10, height: 10 })).toThrow()
  })
})

describe('соответствие сцены трассировки проекту', () => {
  const sceneWith = (items: Array<{ id: string; xCm: number; zCm: number; mesh?: boolean }>) => {
    const s = new THREE.Scene()
    for (const it of items) {
      const g = new THREE.Group()
      g.name = `furniture-${it.id}`
      g.position.set(it.xCm / 100, 0, it.zCm / 100)
      if (it.mesh !== false) g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
      s.add(g)
    }
    return s
  }

  it('сцена, совпадающая с проектом, проходит проверку', () => {
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const snap = takeSnapshot(apt(), roomId(), cam, { width: 10, height: 10 })
    const f = snap.furniture[0]
    expect(verifyTraceScene(sceneWith([{ id: f.id, xCm: f.xCm, zCm: f.zCm }]), snap)).toEqual([])
  })

  it('находит отсутствующий, сдвинутый, пустой и лишний предмет', () => {
    useInteriorEditor.getState().addAtFreeSpot('sofa_02')
    const snap = takeSnapshot(apt(), roomId(), cam, { width: 10, height: 10 })
    const f = snap.furniture[0]
    expect(verifyTraceScene(sceneWith([]), snap)[0]).toContain('отсутствует')
    expect(verifyTraceScene(sceneWith([{ id: f.id, xCm: f.xCm + 5, zCm: f.zCm }]), snap)[0]).toContain('сдвинут')
    expect(verifyTraceScene(sceneWith([{ id: f.id, xCm: f.xCm, zCm: f.zCm, mesh: false }]), snap)[0]).toContain('нет геометрии')
    expect(verifyTraceScene(sceneWith([{ id: f.id, xCm: f.xCm, zCm: f.zCm }, { id: 'лишний', xCm: 0, zCm: 0 }]), snap)[0]).toContain('лишний')
  })
})
