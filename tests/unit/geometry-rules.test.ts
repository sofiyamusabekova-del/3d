import { describe, expect, it } from 'vitest'
import { doorTarget, openingFrame, passageGraph, roomsOfWall, unreachableRooms } from '../../src/domain/doors'
import { roomClearPolygon, apartmentNetAreaM2 } from '../../src/domain/derive'
import { validateGeometry } from '../../src/domain/rules'
import { validateApartment } from '../../src/domain/validate'
import type { Apartment, Opening } from '../../src/domain/types'
import { isConvex, selfIntersects } from '../../src/geometry/polygon'
import { twoRoomApartment } from './fixtures'

const codes = (a: Apartment) => validateApartment(a).map((i) => i.code)
const clone = (a: Apartment): Apartment => structuredClone(a)
const door = (id: string, wallId: string, offsetCm: number, swingRoomId: string): Opening => ({
  id, kind: 'door', wallId, offsetCm, widthCm: 80, heightCm: 205, sillCm: 0, hinge: 'start', swingRoomId,
})

describe('5.1 контуры и помещения', () => {
  it('допустимая квартира не даёт замечаний', () => {
    expect(validateApartment(twoRoomApartment())).toEqual([])
  })
  it('самопересечение («бабочка») находится, прямоугольник — нет', () => {
    expect(selfIntersects([{ x: 0, z: 0 }, { x: 100, z: 100 }, { x: 100, z: 0 }, { x: 0, z: 100 }])).toBe(true)
    expect(selfIntersects([{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 }])).toBe(false)
  })
  it('вершина на чужом ребре — тоже самопересечение', () => {
    expect(selfIntersects([{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 50, z: 0 }, { x: 50, z: 80 }])).toBe(true)
  })
  it('Г-образная комната не выпуклая (D-01), прямоугольник выпуклый', () => {
    const L = [{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 100 }, { x: 100, z: 100 }, { x: 100, z: 200 }, { x: 0, z: 200 }]
    expect(isConvex(L)).toBe(false)
    expect(isConvex([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }])).toBe(true)
    expect(isConvex([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }])).toBe(false) // вырожденный
  })
  it('самопересекающаяся граница комнаты сообщается с названием комнаты', () => {
    const a = clone(twoRoomApartment())
    // Меняем местами две вершины общей стены: контур комнаты А становится «бабочкой».
    const { v2, v5 } = a.vertices
    a.vertices.v2 = { ...v2, zCm: v5.zCm }
    a.vertices.v5 = { ...v5, zCm: v2.zCm }
    const issues = validateGeometry(a)
    expect(issues.some((i) => i.code === 'self-intersection' && i.message.includes('Комната А'))).toBe(true)
  })
  it('комната, наложенная на другую, запрещена и называется по имени', () => {
    const a = clone(twoRoomApartment())
    const v = (id: string, xCm: number, zCm: number) => { a.vertices[id] = { id, xCm, zCm } }
    v('c1', 100, 100); v('c2', 300, 100); v('c3', 300, 200); v('c4', 100, 200)
    const w = (id: string, s: string, e: string) => { a.walls[id] = { id, startVertexId: s, endVertexId: e, thicknessCm: 10 } }
    w('c12', 'c1', 'c2'); w('c23', 'c2', 'c3'); w('c34', 'c3', 'c4'); w('c41', 'c4', 'c1')
    a.rooms.C = { id: 'C', type: 'bedroom', name: 'Комната В', boundary: ['c12', 'c23', 'c34', 'c41'].map((wallId) => ({ wallId, reversed: false })) }
    const issues = validateApartment(a)
    expect(issues.map((i) => i.code)).toContain('rooms-overlap')
    expect(issues.find((i) => i.code === 'rooms-overlap')!.message).toMatch(/Комната А.*Комната В|Комната В.*Комната А/)
  })
  it('соседние комнаты, касающиеся только перегородкой, не накладываются', () => {
    expect(codes(twoRoomApartment())).not.toContain('rooms-overlap')
  })
})

describe('5.2 общая стена, толщина, двойная стена', () => {
  it('сдвиг перегородки меняет обе комнаты, площадь сохраняется, щели и двойной стены нет', () => {
    const a = clone(twoRoomApartment())
    a.vertices.v2 = { ...a.vertices.v2, xCm: 435 }
    a.vertices.v5 = { ...a.vertices.v5, xCm: 435 }
    expect(validateApartment(a)).toEqual([])
    const A = roomClearPolygon(a, a.rooms.A)
    const B = roomClearPolygon(a, a.rooms.B)
    const maxA = Math.max(...A.map((p) => p.x))
    const minB = Math.min(...B.map((p) => p.x))
    expect(maxA).toBeCloseTo(430, 6)
    expect(minB - maxA).toBeCloseTo(10, 6) // ровно толщина перегородки
    expect(apartmentNetAreaM2(a)).toBeCloseTo(18, 6)
    expect(Object.keys(a.walls)).toHaveLength(7) // новой стены не появилось
  })
  it('дубль перегородки поверх старой и стена со смещением меньше толщины — двойная стена', () => {
    const a = clone(twoRoomApartment())
    a.walls.dup = { id: 'dup', startVertexId: 'v2', endVertexId: 'v5', thicknessCm: 10 }
    expect(codes(a)).toContain('double-wall')
    const b = clone(twoRoomApartment())
    b.vertices.s1 = { id: 's1', xCm: 410, zCm: 50 }
    b.vertices.s2 = { id: 's2', xCm: 410, zCm: 250 }
    b.walls.near = { id: 'near', startVertexId: 's1', endVertexId: 's2', thicknessCm: 10 }
    expect(codes(b)).toContain('double-wall') // ось на 5 см от оси перегородки
  })
  it('стены встык на одной линии и стена вплотную по толщине — допустимы', () => {
    const a = clone(twoRoomApartment())
    expect(codes(a)).not.toContain('double-wall') // wBotA и wBotB лежат на одной линии
    a.vertices.s1 = { id: 's1', xCm: 415, zCm: 50 }
    a.vertices.s2 = { id: 's2', xCm: 415, zCm: 250 }
    a.walls.touch = { id: 'touch', startVertexId: 's1', endVertexId: 's2', thicknessCm: 10 }
    expect(codes(a)).not.toContain('double-wall') // расстояние осей 10 = (10+10)/2
  })
})

describe('5.3 проёмы и граф проходов', () => {
  it('AC-10: проём не выходит за стену и не пересекает другой проём', () => {
    const a = clone(twoRoomApartment())
    a.openings.far = { ...door('far', 'wShared', 300, 'A') }
    expect(codes(a)).toContain('opening-out-of-wall')
    const b = clone(twoRoomApartment())
    b.openings.d2 = door('d2', 'wShared', 150, 'A') // 150–230 пересекает 100–180
    expect(codes(b)).toContain('opening-overlap')
    const c = clone(twoRoomApartment())
    c.openings.d2 = door('d2', 'wShared', 180, 'A') // встык допустим
    expect(codes(c)).not.toContain('opening-overlap')
  })
  it('проём выше потолка и дверь без петель или с чужой комнатой открывания запрещены', () => {
    const a = clone(twoRoomApartment())
    a.openings.door1 = { ...a.openings.door1, heightCm: 300 }
    expect(codes(a)).toContain('opening-too-tall')
    const b = clone(twoRoomApartment())
    b.openings.door1 = { ...b.openings.door1, hinge: undefined }
    expect(codes(b)).toContain('door-no-hinge')
    const c = clone(twoRoomApartment())
    c.openings.door1 = { ...c.openings.door1, swingRoomId: 'nowhere' }
    expect(codes(c)).toContain('door-bad-swing')
  })
  it('AC-04: общая дверь — одна сущность, видна с двух сторон, двигается согласованно и ведёт в другую комнату', () => {
    const a = twoRoomApartment()
    expect(roomsOfWall(a, 'wShared').sort()).toEqual(['A', 'B'])
    expect(Object.values(a.openings).filter((o) => o.wallId === 'wShared')).toHaveLength(1)
    expect(doorTarget(a, 'door1', 'A')).toBe('B')
    expect(doorTarget(a, 'door1', 'B')).toBe('A')
    const fa = openingFrame(a, a.openings.door1, 'A')
    const fb = openingFrame(a, a.openings.door1, 'B')
    expect([fa.p0.x, fb.p0.x]).toEqual([400, 410]) // стороны перегородки
    expect([fa.p0.z, fa.p1.z, fb.p0.z, fb.p1.z]).toEqual([85, 165, 85, 165])
    const moved = clone(a)
    moved.openings.door1.offsetCm = 120
    expect(validateApartment(moved)).toEqual([])
    const ma = openingFrame(moved, moved.openings.door1, 'A')
    const mb = openingFrame(moved, moved.openings.door1, 'B')
    expect([ma.p0.z, ma.p1.z]).toEqual([105, 185])
    expect([mb.p0.z, mb.p1.z]).toEqual([105, 185])
    expect(fa.nIn.x).toBeCloseTo(-1, 9)
    expect(fb.nIn.x).toBeCloseTo(1, 9)
  })
  it('граф проходов: вход, разрыв связи и недостижимая комната', () => {
    const a = clone(twoRoomApartment())
    expect(unreachableRooms(a).sort()).toEqual(['A', 'B']) // входной двери нет
    a.openings.entry = door('entry', 'wBotB', 50, 'B')
    expect(validateApartment(a)).toEqual([])
    expect(passageGraph(a).entrances).toEqual(['B'])
    expect(passageGraph(a).edges).toEqual([['A', 'B', 'door1']])
    expect(unreachableRooms(a)).toEqual([])
    delete a.openings.door1 // разрыв связи
    expect(unreachableRooms(a)).toEqual(['A'])
    expect(doorTarget(a, 'entry', 'B')).toBeNull() // дверь наружу
  })
})
