import { describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { analyzeClearance } from '../../src/domain/clearance'
import { roomClearPolygon } from '../../src/domain/derive'
import type { Apartment, FurnitureInstance } from '../../src/domain/types'
import { buildApartment, templateById } from '../../src/scenario/layouts'

// Проверка проходов (этап 2 доработок, D-31): узкие щели, загороженная дверь, отрезанная часть комнаты.
const apt0: Apartment = buildApartment(templateById('1b')!)
const room = Object.values(apt0.rooms).find((r) => r.name === 'Комната')!
const poly = roomClearPolygon(apt0, room)
const minX = Math.min(...poly.map((p) => p.x)), maxX = Math.max(...poly.map((p) => p.x))
const minZ = Math.min(...poly.map((p) => p.z)), maxZ = Math.max(...poly.map((p) => p.z))
const ITEM = 'kenney_bedDouble'
const bed = CATALOG[ITEM]

const put = (list: Array<{ x: number; z: number; a?: number }>): Apartment => ({
  ...apt0,
  furniture: Object.fromEntries(list.map((p, i) => {
    const f: FurnitureInstance = { id: `t${i}`, catalogItemId: ITEM, assetVersion: bed.version, roomId: room.id, xCm: p.x, zCm: p.z, elevationCm: 0, angleDeg: p.a ?? 0 }
    return [f.id, f]
  })),
})

describe('проверка проходов', () => {
  it('пустая комната и одна кровать посреди комнаты без замечаний о щелях', () => {
    expect(analyzeClearance(apt0, CATALOG, room.id)).toEqual([])
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
    expect(analyzeClearance(put([{ x: cx, z: cz }]), CATALOG, room.id).filter((i) => i.kind === 'narrow')).toEqual([])
  })

  it('две кровати с зазором 40 см — узкий проход; 20 см (щель) и 70 см — нет', () => {
    const cz = (minZ + maxZ) / 2
    const cx = (minX + maxX) / 2
    const pair = (gap: number) => put([{ x: cx - bed.widthCm / 2 - gap / 2, z: cz }, { x: cx + bed.widthCm / 2 + gap / 2, z: cz }])
    const narrow = (gap: number) => analyzeClearance(pair(gap), CATALOG, room.id).filter((i) => i.kind === 'narrow' && i.ids.length === 2)
    const r = narrow(40)
    expect(r.length).toBe(1)
    expect(r[0].gapCm).toBe(40)
    expect(r[0].message).toMatch(/Узкий проход 40 см/)
    expect(r[0].xCm).toBeCloseTo(cx, 0)
    expect(narrow(20)).toEqual([])
    expect(narrow(70)).toEqual([])
  })

  it('кровать у стены с зазором 40 см до другой стены — узкий проход между предметом и стеной', () => {
    const cz = (minZ + maxZ) / 2
    const r = analyzeClearance(put([{ x: minX + bed.widthCm / 2 + 40, z: cz }]), CATALOG, room.id).filter((i) => i.kind === 'narrow')
    expect(r.some((x) => x.gapCm === 40 && /стеной/.test(x.message))).toBe(true)
  })

  it('сплошной барьер из кроватей от стены до стены отрезает часть комнаты или загораживает дверь', () => {
    const cz = (minZ + maxZ) / 2
    const n = Math.ceil((maxX - minX) / bed.widthCm)
    const row = Array.from({ length: n }, (_, k) => ({ x: minX + bed.widthCm / 2 + (k * ((maxX - minX) - bed.widthCm)) / Math.max(1, n - 1), z: cz }))
    const kinds = analyzeClearance(put(row), CATALOG, room.id).map((i) => i.kind)
    expect(kinds.some((k) => k === 'cut-off' || k === 'door-blocked')).toBe(true)
  })

  it('ковёр и настольные предметы не считаются преградой', () => {
    const f = (id: string, catalogItemId: string, x: number, z: number): [string, FurnitureInstance] => [id, { id, catalogItemId, assetVersion: '1', roomId: room.id, xCm: x, zCm: z, elevationCm: 0, angleDeg: 0 }]
    const apt: Apartment = { ...apt0, furniture: Object.fromEntries([f('a', 'kenney_lampRoundTable', (minX + maxX) / 2, (minZ + maxZ) / 2)]) }
    expect(analyzeClearance(apt, CATALOG, room.id)).toEqual([])
  })
})
