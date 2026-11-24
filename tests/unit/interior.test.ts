import { beforeEach, describe, expect, it } from 'vitest'
import { doorTarget, roomsOfWall } from '../../src/domain/doors'
import { openingInfo, proposeOpeningChange } from '../../src/domain/openingEdit'
import type { Apartment, FurnitureInstance } from '../../src/domain/types'
import { initialView, isFaceHidden, panelArea, roomCenter, roomFaces, wallPanels } from '../../src/scene3d/roomGeometry'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { startRoomId, useInterior } from '../../src/scenario/interior'
import { buildApartment, templateById } from '../../src/scenario/layouts'

const apt1b = () => buildApartment(templateById('1b')!)
const doorsOf = (a: Apartment) => Object.values(a.openings).filter((o) => o.kind === 'door')
const load = (a: Apartment) => useApartmentProject.getState().reset(a)

describe('10.1 / 10.2 геометрия комнаты и отверстия', () => {
  it('куски стены плюс отверстия дают всю стену без пропусков и наложений', () => {
    const a = apt1b()
    for (const room of Object.values(a.rooms)) {
      const { faces, heightCm } = roomFaces(a, room.id)
      expect(faces).toHaveLength(room.boundary.length)
      for (const f of faces) {
        const holes = f.holes.reduce((s, h) => s + panelArea(h), 0)
        const panels = f.panels.reduce((s, p) => s + panelArea(p), 0)
        expect(panels + holes, `${room.name}/${f.wallId}`).toBeCloseTo(f.lengthCm * heightCm, 4)
      }
    }
  })

  it('окно даёт кусок под подоконником и над окном, дверь — только над собой', () => {
    const p = wallPanels(300, 270, [{ s0: 100, s1: 200, y0: 90, y1: 230 }])
    expect(p).toHaveLength(4)
    const d = wallPanels(300, 270, [{ s0: 100, s1: 200, y0: 0, y1: 205 }])
    expect(d).toHaveLength(3)
    expect(d.every((x) => x.y1 > x.y0 && x.s1 > x.s0)).toBe(true)
    // Проём у самого края стены не создаёт пустых кусков.
    expect(wallPanels(300, 270, [{ s0: 0, s1: 100, y0: 0, y1: 205 }]).every((x) => x.s1 - x.s0 > 0)).toBe(true)
  })

  it('общая дверь даёт отверстие в обеих комнатах; соседние комнаты в геометрию не попадают', () => {
    const a = apt1b()
    const shared = doorsOf(a).find((o) => roomsOfWall(a, o.wallId).length === 2)!
    const [r1, r2] = roomsOfWall(a, shared.wallId)
    for (const r of [r1, r2]) {
      const f = roomFaces(a, r).faces.find((x) => x.holes.some((h) => h.openingId === shared.id))!
      const h = f.holes.find((x) => x.openingId === shared.id)!
      expect(h.s1 - h.s0).toBeCloseTo(shared.widthCm, 4)
      expect(h.y1 - h.y0).toBeCloseTo(shared.heightCm, 4)
    }
    // Геометрия комнаты лежит внутри её чистового контура: ни одной точки чужой комнаты.
    const { floor } = roomFaces(a, r1)
    const other = roomFaces(a, r2).floor
    const inside = (p: { x: number; z: number }, poly: typeof floor) => {
      const xs = poly.map((q) => q.x), zs = poly.map((q) => q.z)
      return p.x > Math.min(...xs) + 0.01 && p.x < Math.max(...xs) - 0.01 && p.z > Math.min(...zs) + 0.01 && p.z < Math.max(...zs) - 0.01
    }
    expect(floor.some((p) => inside(p, other))).toBe(false)
  })

  it('отверстие остаётся корректным после перемещения проёма', () => {
    const a = apt1b()
    const w = Object.values(a.openings).find((o) => o.kind === 'window')!
    const room = roomsOfWall(a, w.wallId)[0]
    const before = roomFaces(a, room).faces.flatMap((f) => f.holes).find((h) => h.openingId === w.id)!
    const p = proposeOpeningChange(a, w.id, { fromRefCm: openingInfo(a, w.id).fromRefCm + 12 })
    const c = p.candidate!
    const faces = roomFaces(c, room)
    const after = faces.faces.flatMap((f) => f.holes).find((h) => h.openingId === w.id)!
    expect(Math.abs(after.s0 - before.s0)).toBeCloseTo(12, 4)
    expect(after.s1 - after.s0).toBeCloseTo(before.s1 - before.s0, 6)
    for (const f of faces.faces) {
      const total = f.panels.reduce((s, q) => s + panelArea(q), 0) + f.holes.reduce((s, q) => s + panelArea(q), 0)
      expect(total).toBeCloseTo(f.lengthCm * faces.heightCm, 4)
    }
  })
})

describe('10.3 камера и скрытие стен', () => {
  it('начальный вид: камера над комнатой с противоположной от двери стороны, дверная стена видна', () => {
    const a = apt1b()
    for (const room of Object.values(a.rooms)) {
      const door = doorsOf(a).find((d) => roomsOfWall(a, d.wallId).includes(room.id))!
      const v = initialView(a, room.id, door.id)
      const c = roomCenter(a, room.id)
      const face = roomFaces(a, room.id).faces.find((f) => f.holes.some((h) => h.openingId === door.id))!
      expect(v.position[1]).toBeGreaterThan(a.ceilingHeightCm - 1)
      expect(isFaceHidden(face, { x: v.position[0], z: v.position[2] }), room.name).toBe(false)
      // Камера по другую сторону центра от двери.
      const doorSide = (face.a.x - c.x) * face.nIn.x + (face.a.z - c.z) * face.nIn.z
      const camSide = (v.position[0] - c.x) * face.nIn.x + (v.position[2] - c.z) * face.nIn.z
      expect(Math.sign(camSide)).toBe(Math.sign(-doorSide) || 1)
    }
  })

  it('стена скрыта, когда камера снаружи её плоскости', () => {
    const a = apt1b()
    const room = Object.values(a.rooms)[0]
    const { faces } = roomFaces(a, room.id)
    const f = faces[0]
    const mid = { x: (f.a.x + f.b.x) / 2, z: (f.a.z + f.b.z) / 2 }
    expect(isFaceHidden(f, { x: mid.x + f.nIn.x * 100, z: mid.z + f.nIn.z * 100 })).toBe(false)
    expect(isFaceHidden(f, { x: mid.x - f.nIn.x * 100, z: mid.z - f.nIn.z * 100 })).toBe(true)
  })
})

describe('10.4 – 10.6 навигация, выбор, сохранение состояния', () => {
  beforeEach(() => {
    resetFlowForTests()
    load(apt1b())
    useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null })
  })

  it('старт — комната с входной дверью', () => {
    const a = useApartmentProject.getState().history.present
    useInterior.getState().sync()
    expect(useInterior.getState().activeRoomId).toBe(startRoomId(a))
    const entrance = doorsOf(a).find((d) => roomsOfWall(a, d.wallId).length === 1)!
    expect(roomsOfWall(a, entrance.wallId)[0]).toBe(startRoomId(a))
  })

  it('переход туда и обратно по всем внутренним дверям; вход открывает комнату у той же двери', () => {
    const a = useApartmentProject.getState().history.present
    const inner = doorsOf(a).filter((d) => roomsOfWall(a, d.wallId).length === 2)
    expect(inner.length).toBeGreaterThanOrEqual(2)
    for (const d of inner) {
      const [r1, r2] = roomsOfWall(a, d.wallId)
      const s = useInterior.getState()
      s.enter(r1)
      s.goThroughDoor(d.id)
      expect(useInterior.getState().activeRoomId).toBe(r2)
      expect(useInterior.getState().enteredVia).toBe(d.id)
      expect(doorTarget(a, d.id, r2)).toBe(r1)
      useInterior.getState().goThroughDoor(d.id)
      expect(useInterior.getState().activeRoomId).toBe(r1)
    }
  })

  it('входная дверь не создаёт комнату: остаётся та же комната, дверь выбрана, есть сообщение', () => {
    const a = useApartmentProject.getState().history.present
    const entrance = doorsOf(a).find((d) => roomsOfWall(a, d.wallId).length === 1)!
    const room = roomsOfWall(a, entrance.wallId)[0]
    useInterior.getState().enter(room)
    useInterior.getState().goThroughDoor(entrance.id)
    const s = useInterior.getState()
    expect(s.activeRoomId).toBe(room)
    expect(s.selectedOpeningId).toBe(entrance.id)
    expect(s.notice).toContain('наружу')
  })

  it('выбор сбрасывается при смене комнаты и не принимает чужие проёмы', () => {
    const a = useApartmentProject.getState().history.present
    const win = Object.values(a.openings).find((o) => o.kind === 'window')!
    const [wr] = roomsOfWall(a, win.wallId)
    const inner = doorsOf(a).find((d) => roomsOfWall(a, d.wallId).length === 2 && roomsOfWall(a, d.wallId).includes(wr))
    useInterior.getState().enter(wr)
    useInterior.getState().select(win.id)
    expect(useInterior.getState().selectedOpeningId).toBe(win.id)
    if (inner) useInterior.getState().goThroughDoor(inner.id)
    else useInterior.getState().enter(Object.keys(a.rooms).find((r) => r !== wr)!)
    expect(useInterior.getState().selectedOpeningId).toBeNull()
    // Дверь чужой комнаты не активна: переход возможен только из текущей.
    const far = doorsOf(a).find((d) => !roomsOfWall(a, d.wallId).includes(useInterior.getState().activeRoomId!))
    if (far) {
      const before = useInterior.getState().activeRoomId
      useInterior.getState().goThroughDoor(far.id)
      expect(useInterior.getState().activeRoomId).toBe(before)
    }
  })

  it('AC-05: мебель и отделка не меняются при переходах', () => {
    const a = apt1b()
    const [roomA, roomB] = Object.keys(a.rooms)
    const f = (id: string, roomId: string): FurnitureInstance => ({ id, catalogItemId: 'sofa_02', assetVersion: '1', roomId, xCm: 100, zCm: 100, elevationCm: 0, angleDeg: 0 })
    const withStuff: Apartment = {
      ...a,
      furniture: { f1: f('f1', roomA), f2: f('f2', roomB) },
      floorCoverings: { [roomA]: { kind: 'laminate', colorId: 'oak' } },
    }
    load(withStuff)
    const snapshot = JSON.stringify(useApartmentProject.getState().history.present)
    const inner = doorsOf(withStuff).filter((d) => roomsOfWall(withStuff, d.wallId).length === 2)
    useInterior.getState().enter(roomA)
    for (let i = 0; i < 6; i++) for (const d of inner) { useInterior.getState().goThroughDoor(d.id) }
    expect(JSON.stringify(useApartmentProject.getState().history.present)).toBe(snapshot)
    expect(Object.keys(useApartmentProject.getState().history.present.furniture)).toHaveLength(2)
  })
})
