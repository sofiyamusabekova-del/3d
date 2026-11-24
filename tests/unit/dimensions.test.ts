import { describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { roomClearPolygon } from '../../src/domain/derive'
import { dimensionLines, nearestDoorCm } from '../../src/domain/dimensions'
import type { Apartment, FurnitureInstance } from '../../src/domain/types'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Размеры на плане (этап 3 доработок, D-32).
const apt0: Apartment = buildApartment(templateById('1b')!)
const room = Object.values(apt0.rooms).find((r) => r.name === 'Комната')!
const poly = roomClearPolygon(apt0, room)
const minX = Math.min(...poly.map((p) => p.x)), maxX = Math.max(...poly.map((p) => p.x))
const minZ = Math.min(...poly.map((p) => p.z)), maxZ = Math.max(...poly.map((p) => p.z))
const bed = CATALOG.kenney_bedDouble
const f = (id: string, x: number, z: number): FurnitureInstance => ({ id, catalogItemId: 'kenney_bedDouble', assetVersion: bed.version, roomId: room.id, xCm: x, zCm: z, elevationCm: 0, angleDeg: 0 })

describe('размеры на плане', () => {
  it('от кровати у центра четыре размера до стен; сумма с габаритом равна размеру комнаты', () => {
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
    const lines = dimensionLines(apt0, CATALOG, { itemId: 'kenney_bedDouble', xCm: cx, zCm: cz, angleDeg: 0, selfId: null, roomId: room.id })
    expect(lines).toHaveLength(4)
    expect(lines.every((l) => l.to === 'wall')).toBe(true)
    const horizontal = lines.filter((l) => Math.abs(l.z1 - l.z2) < 1e-6).map((l) => l.cm)
    expect(horizontal.reduce((a, b) => a + b, 0) + bed.widthCm).toBeCloseTo(maxX - minX, 0)
  })

  it('соседний предмет на пути луча даёт размер до предмета', () => {
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
    const apt: Apartment = { ...apt0, furniture: { b: f('b', cx + bed.widthCm + 40, cz) } }
    const lines = dimensionLines(apt, CATALOG, { itemId: 'kenney_bedDouble', xCm: cx, zCm: cz, angleDeg: 0, selfId: 'a', roomId: room.id })
    const right = lines.find((l) => l.to === 'item')!
    expect(right.cm).toBe(40)
  })

  it('предмет вплотную к стене не даёт нулевого размера; расстояние до двери считается', () => {
    const lines = dimensionLines(apt0, CATALOG, { itemId: 'kenney_bedDouble', xCm: minX + bed.widthCm / 2, zCm: (minZ + maxZ) / 2, angleDeg: 0, selfId: null, roomId: room.id })
    expect(lines.length).toBe(3)
    const d = nearestDoorCm(apt0, CATALOG, { itemId: 'kenney_bedDouble', xCm: minX + bed.widthCm / 2, zCm: (minZ + maxZ) / 2, angleDeg: 0, selfId: null, roomId: room.id })
    expect(d).not.toBeNull()
    expect(d!.cm).toBeGreaterThan(0)
  })
})
