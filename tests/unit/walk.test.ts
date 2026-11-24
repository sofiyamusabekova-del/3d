import { describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { roomClearPolygon } from '../../src/domain/derive'
import { openingFrame } from '../../src/domain/doors'
import { addFurnitureCommand } from '../../src/domain/placement'
import type { Apartment } from '../../src/domain/types'
import { EYE_HEIGHT_CM, PLAYER_RADIUS_CM, forwardOf, isFree, rightOf, roomAt, startPosition, stepWalk, walkObstacles } from '../../src/domain/walk'
import { pointsInsideConvex } from '../../src/geometry/placement'
import { buildApartment, templateById } from '../../src/scenario/layouts'
import { MAX_ACTIVE_LIGHTS, nearestLights, type Emitter } from '../../src/scene3d/roomLights'

// Этап 24 (SPEC D-17): движение от первого лица, столкновения со стенами и мебелью, проёмы проходимы.
const apt = () => buildApartment(templateById('1b')!)
const room = (a: Apartment, name: string) => Object.values(a.rooms).find((r) => r.name === name)!
const withSofa = (a: Apartment, x: number, z: number): Apartment => addFurnitureCommand({ id: 'sofa', catalogItemId: 'sofa_02', assetVersion: '1', roomId: room(a, 'Комната').id, xCm: x, zCm: z, elevationCm: 0, angleDeg: 0 })(a)

/** Идёт по прямой, шагами по кадру (как в сцене), возвращает конечное положение. */
function walk(a: Apartment, from: { x: number; z: number }, dir: { x: number; z: number }, distance: number, obstacles = walkObstacles(a, CATALOG), dt = 1 / 60) {
  let p = { ...from }
  const step = 140 * dt
  for (let walked = 0; walked < distance; walked += step) p = stepWalk(p, { x: dir.x * step, z: dir.z * step }, obstacles)
  return p
}

describe('24.4 свет по близости к игроку', () => {
  const em = (key: string, x: number, z: number): Emitter => ({ key, kind: key === 'main' ? 'ceiling' : 'lamp', xCm: x, yCm: 150, zCm: z, colorHex: '#ffffff', intensityCd: 5, glowRadiusCm: 5 })
  it('главный источник первым, остальные по расстоянию до игрока, не больше предела', () => {
    const all = [em('main', 500, 500), ...Array.from({ length: 9 }, (_, i) => em(`l${i}`, i * 100, 0))]
    const near = nearestLights(all, { x: 0, z: 0 })
    expect(near).toHaveLength(MAX_ACTIVE_LIGHTS)
    expect(near[0].key).toBe('main')
    expect(near.slice(1).map((e) => e.key)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4'])
    // Игрок у другого конца: набор меняется на ближайшие к нему.
    const far = nearestLights(all, { x: 800, z: 0 })
    expect(far.slice(1).map((e) => e.key)).toEqual(['l8', 'l7', 'l6', 'l5', 'l4'])
    expect(nearestLights([], { x: 0, z: 0 })).toEqual([])
    expect(nearestLights(all.slice(0, 3), { x: 0, z: 0 })).toHaveLength(3)
  })
})

describe('24.3 движение и столкновения', () => {
  it('константы: глаза на 160 см, радиус тела 25 см; направления вперёд и вправо ортогональны', () => {
    expect(EYE_HEIGHT_CM).toBe(160)
    expect(PLAYER_RADIUS_CM).toBe(25)
    for (const yaw of [0, 0.7, 2, -1.3]) {
      const f = forwardOf(yaw), r = rightOf(yaw)
      expect(Math.hypot(f.x, f.z)).toBeCloseTo(1, 9)
      expect(f.x * r.x + f.z * r.z).toBeCloseTo(0, 9)
    }
    expect(forwardOf(0)).toEqual({ x: -0, z: -1 }) // yaw 0 смотрит на север (−z), как камера three.js
  })

  it('внешние стены не пускают: из любой комнаты в любую сторону не выйти за контур квартиры', () => {
    const a = apt()
    const obstacles = walkObstacles(a, CATALOG)
    const xs = Object.values(a.vertices).map((v) => v.xCm), zs = Object.values(a.vertices).map((v) => v.zCm)
    const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
    for (const r of Object.values(a.rooms)) {
      const start = startPosition(a, r.id, obstacles)
      for (const dir of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 0.7, z: 0.7 }]) {
        const end = walk(a, start, dir, 3000, obstacles)
        expect(end.x, `${r.name} ${JSON.stringify(dir)}`).toBeGreaterThan(box.minX)
        expect(end.x).toBeLessThan(box.maxX)
        expect(end.z).toBeGreaterThan(box.minZ)
        expect(end.z).toBeLessThan(box.maxZ)
      }
    }
  })

  it('внутренняя дверь проходима: из прихожей в комнату через проём, лицом к двери', () => {
    const a = apt()
    const obstacles = walkObstacles(a, CATALOG)
    const hall = room(a, 'Прихожая'), living = room(a, 'Комната')
    const door = Object.values(a.openings).find((o) => o.kind === 'door' && a.rooms[living.id] && roomClearPolygon(a, living) && o.wallId && Object.values(a.rooms).filter((r) => r.boundary.some((b) => b.wallId === o.wallId)).map((r) => r.id).sort().join() === [hall.id, living.id].sort().join())!
    expect(door).toBeDefined()
    const f = openingFrame(a, door, hall.id)
    const mid = { x: (f.p0.x + f.p1.x) / 2, z: (f.p0.z + f.p1.z) / 2 }
    const start = { x: mid.x + f.nIn.x * 80, z: mid.z + f.nIn.z * 80 }
    expect(roomAt(a, start)).toBe(hall.id)
    const end = walk(a, start, { x: -f.nIn.x, z: -f.nIn.z }, 300, obstacles)
    expect(roomAt(a, end), 'пришли в комнату за дверью').toBe(living.id)
  })

  it('окно не проходимо: идём в окно — остаёмся в комнате у стены', () => {
    const a = apt()
    const obstacles = walkObstacles(a, CATALOG)
    const living = room(a, 'Комната')
    const win = Object.values(a.openings).find((o) => o.kind === 'window' && living.boundary.some((b) => b.wallId === o.wallId))!
    const f = openingFrame(a, win, living.id)
    const mid = { x: (f.p0.x + f.p1.x) / 2, z: (f.p0.z + f.p1.z) / 2 }
    const start = { x: mid.x + f.nIn.x * 100, z: mid.z + f.nIn.z * 100 }
    const end = walk(a, start, { x: -f.nIn.x, z: -f.nIn.z }, 400, obstacles)
    expect(roomAt(a, end)).toBe(living.id)
    const distToWall = (end.x - mid.x) * f.nIn.x + (end.z - mid.z) * f.nIn.z
    expect(distToWall).toBeGreaterThanOrEqual(PLAYER_RADIUS_CM - 0.5)
  })

  it('входная дверь закрыта: наружу не выйти', () => {
    const a = apt()
    const obstacles = walkObstacles(a, CATALOG)
    const hall = room(a, 'Прихожая')
    const entrance = Object.values(a.openings).find((o) => o.kind === 'door' && Object.values(a.rooms).filter((r) => r.boundary.some((b) => b.wallId === o.wallId)).length === 1)!
    const f = openingFrame(a, entrance, hall.id)
    const mid = { x: (f.p0.x + f.p1.x) / 2, z: (f.p0.z + f.p1.z) / 2 }
    const start = { x: mid.x + f.nIn.x * 80, z: mid.z + f.nIn.z * 80 }
    const end = walk(a, start, { x: -f.nIn.x, z: -f.nIn.z }, 500, obstacles)
    expect(roomAt(a, end)).toBe(hall.id)
  })

  it('мебель не проходится: диван посреди комнаты обходится скольжением, сквозь него не пройти', () => {
    const base = apt()
    const living = room(base, 'Комната')
    const poly = roomClearPolygon(base, living)
    const cx = (Math.min(...poly.map((p) => p.x)) + Math.max(...poly.map((p) => p.x))) / 2
    const cz = (Math.min(...poly.map((p) => p.z)) + Math.max(...poly.map((p) => p.z))) / 2
    const a = withSofa(base, cx, cz)
    const obstacles = walkObstacles(a, CATALOG)
    const sofa = obstacles.filter((o) => o.kind === 'furniture')
    expect(sofa).toHaveLength(1)
    const w = CATALOG.sofa_02.widthCm
    const start = { x: cx - w / 2 - 120, z: cz }
    const end = walk(a, start, { x: 1, z: 0 }, 400, obstacles)
    // Упёрся в диван слева: центр не дальше края дивана минус радиус тела.
    expect(end.x).toBeLessThanOrEqual(cx - w / 2 - PLAYER_RADIUS_CM + 1)
    expect(isFree(end, obstacles)).toBe(true)
    // Под углом: скользит вдоль дивана, продвигаясь по z.
    const slid = walk(a, start, { x: 0.7, z: 0.7 }, 300, obstacles)
    expect(slid.z).toBeGreaterThan(start.z + 100)
    expect(isFree(slid, obstacles)).toBe(true)
  })

  it('люстра под потолком, настольный предмет на столе и ковёр не мешают телу игрока там, где они не на уровне тела', () => {
    const base = apt()
    const living = room(base, 'Комната')
    const a = addFurnitureCommand({ id: 'ch', catalogItemId: 'own_chandelier_classic', assetVersion: '1', roomId: living.id, xCm: 200, zCm: 200, elevationCm: 199, angleDeg: 0 })(base)
    expect(walkObstacles(a, CATALOG).filter((o) => o.kind === 'furniture')).toHaveLength(0) // люстра выше роста
  })

  it('быстрый шаг не туннелирует: большой сдвиг за один вызов не проходит сквозь стену', () => {
    const a = apt()
    const obstacles = walkObstacles(a, CATALOG)
    const living = room(a, 'Комната')
    const start = startPosition(a, living.id, obstacles)
    const poly = roomClearPolygon(a, living)
    const end = stepWalk(start, { x: -5000, z: 0 }, obstacles)
    expect(pointsInsideConvex([end], poly, 1)).toBe(true)
  })

  it('начальное положение свободно и внутри комнаты для всех комнат всех схем', () => {
    for (const id of ['1a', '1b', '1v', '2a', '2b', '2v', '3a', '3b', '3v']) {
      const a = buildApartment(templateById(id)!)
      const obstacles = walkObstacles(a, CATALOG)
      for (const r of Object.values(a.rooms)) {
        const p = startPosition(a, r.id, obstacles)
        expect(roomAt(a, p), `${id} ${r.name}`).toBe(r.id)
        expect(isFree(p, obstacles), `${id} ${r.name}`).toBe(true)
      }
    }
  })

  it('комната под игроком определяется по контуру; в проёме и вне квартиры — null', () => {
    const a = apt()
    const living = room(a, 'Комната')
    const poly = roomClearPolygon(a, living)
    const c = { x: (Math.min(...poly.map((p) => p.x)) + Math.max(...poly.map((p) => p.x))) / 2, z: (Math.min(...poly.map((p) => p.z)) + Math.max(...poly.map((p) => p.z))) / 2 }
    expect(roomAt(a, c)).toBe(living.id)
    expect(roomAt(a, { x: -5000, z: -5000 })).toBeNull()
  })
})
