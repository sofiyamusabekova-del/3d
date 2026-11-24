import { describe, expect, it } from 'vitest'
import { TECH_CATALOG } from '../../src/catalog/techCatalog'
import { doorTarget, doorZones, roomsOfWall } from '../../src/domain/doors'
import { canUndo } from '../../src/domain/history'
import { OPENING_LIMITS, offsetFromRef, openingInfo, proposeOpeningChange } from '../../src/domain/openingEdit'
import { validatePlacement } from '../../src/domain/placement'
import { createProjectStore } from '../../src/domain/store'
import type { Apartment, FurnitureInstance, Opening } from '../../src/domain/types'
import { validateApartment } from '../../src/domain/validate'
import { buildApartment, templateById } from '../../src/scenario/layouts'

const apt1b = () => buildApartment(templateById('1b')!)
const openings = (a: Apartment, kind: 'door' | 'window') => Object.values(a.openings).filter((o) => o.kind === kind)
const sharedDoor = (a: Apartment) => openings(a, 'door').find((o) => roomsOfWall(a, o.wallId).length === 2)!
const entrance = (a: Apartment) => openings(a, 'door').find((o) => roomsOfWall(a, o.wallId).length === 1)!
const window1 = (a: Apartment) => openings(a, 'window')[0]
const plain = (a: Apartment) => JSON.stringify(a)

describe('9.1 положение и размеры проёма', () => {
  it('отступ считается от угла по чистой стене: отступы и ширина дают свободную длину', () => {
    const a = apt1b()
    for (const o of Object.values(a.openings)) {
      const i = openingInfo(a, o.id)
      expect(i.fromRefCm + o.widthCm + i.fromOtherCm).toBeCloseTo(i.clearSpanCm, 6)
      expect(i.fromRefCm).toBeGreaterThanOrEqual(0)
      expect(i.fromOtherCm).toBeGreaterThanOrEqual(0)
    }
  })

  it('сдвиг на число сантиметров меняет отступ ровно на него и сохраняет ширину', () => {
    const a = apt1b()
    const o = window1(a)
    const i = openingInfo(a, o.id)
    const p = proposeOpeningChange(a, o.id, { fromRefCm: i.fromRefCm + 10 })
    expect(p.issues).toEqual([])
    const j = openingInfo(p.candidate!, o.id)
    expect(j.fromRefCm).toBeCloseTo(i.fromRefCm + 10, 6)
    expect(j.fromOtherCm).toBeCloseTo(i.fromOtherCm - 10, 6)
    expect(p.candidate!.openings[o.id].widthCm).toBe(o.widthCm)
    expect(p.candidate!.openings[o.id].wallId).toBe(o.wallId) // перенос на другую стену не предлагается (D-04)
    expect(offsetFromRef(a, o, i.fromRefCm)).toBeCloseTo(o.offsetCm, 6)
  })

  it('ширина и высота меняются; расширение идёт от опорного угла в сторону свободного места', () => {
    const a = apt1b()
    const o = window1(a)
    const i = openingInfo(a, o.id)
    const p = proposeOpeningChange(a, o.id, { widthCm: o.widthCm + 20, heightCm: o.heightCm - 10 })
    expect(p.issues).toEqual([])
    const c = p.candidate!.openings[o.id]
    expect(c.widthCm).toBe(o.widthCm + 20)
    expect(c.heightCm).toBe(o.heightCm - 10)
    expect(openingInfo(p.candidate!, o.id).fromRefCm).toBeCloseTo(i.fromRefCm, 6)
  })

  it('пределы D-21: размеры вне диапазона отклоняются с названием проёма', () => {
    const a = apt1b()
    const d = entrance(a)
    const p = proposeOpeningChange(a, d.id, { widthCm: OPENING_LIMITS.door.width[1] + 1 })
    expect(p.ok).toBe(false)
    expect(p.issues[0].message).toMatch(/Дверь/)
    expect(p.issues[0].message).toContain('ширина')
    expect(proposeOpeningChange(a, d.id, { heightCm: 30 }).ok).toBe(false)
    expect(proposeOpeningChange(a, d.id, { widthCm: Number.NaN }).ok).toBe(false)
  })
})

describe('9.2 общий дверной проём (AC-04)', () => {
  it('общая дверь одна; при сдвиге зоны меняются в обеих комнатах, переход остаётся верным', () => {
    const a = apt1b()
    const d = sharedDoor(a)
    const [r1, r2] = roomsOfWall(a, d.wallId)
    const count = Object.keys(a.openings).length
    const i = openingInfo(a, d.id)
    const target = Math.min(i.fromRefCm + 15, i.fromRefCm + i.fromOtherCm)
    const p = proposeOpeningChange(a, d.id, { fromRefCm: target })
    expect(p.issues).toEqual([])
    const c = p.candidate!
    expect(Object.keys(c.openings)).toHaveLength(count)
    for (const r of [r1, r2]) {
      expect(JSON.stringify(doorZones(c, c.openings[d.id], r))).not.toBe(JSON.stringify(doorZones(a, d, r)))
    }
    expect(doorTarget(c, d.id, r1)).toBe(r2)
    expect(doorTarget(c, d.id, r2)).toBe(r1)
    expect(validateApartment(c)).toEqual([])
  })
})

describe('9.3 границы и пересечения (AC-10)', () => {
  it('проём не заходит в угол и не выходит за стену', () => {
    const a = apt1b()
    const o = window1(a)
    const i = openingInfo(a, o.id)
    for (const from of [-5, i.fromRefCm + i.fromOtherCm + 5]) {
      const p = proposeOpeningChange(a, o.id, { fromRefCm: from })
      expect(p.ok, String(from)).toBe(false)
      expect(p.candidate).toBeNull()
      expect(p.issues[0].message).toContain('не помещается в стену')
      expect(p.issues[0].message).toMatch(/Окно/)
    }
    // Ровно до угла допустимо.
    expect(proposeOpeningChange(a, o.id, { fromRefCm: 0 }).ok).toBe(true)
    expect(proposeOpeningChange(a, o.id, { fromRefCm: i.fromRefCm + i.fromOtherCm }).ok).toBe(true)
  })

  it('верх проёма выше потолка блокирует изменение', () => {
    const a = apt1b()
    const o = window1(a)
    const p = proposeOpeningChange({ ...a, ceilingHeightCm: 220 }, o.id, { heightCm: 140 })
    expect(p.ok).toBe(false)
    expect(p.issues[0].message).toContain('выше потолка')
  })

  it('пересечение с соседним проёмом на той же стене блокируется', () => {
    const a = apt1b()
    const o = window1(a)
    const i = openingInfo(a, o.id)
    // Второе окно на той же стене, поставленное на край и затем сдвигаемое на первое.
    const second: Opening = { ...o, id: 'w-extra', widthCm: 40, offsetCm: openingInfo(a, o.id).fromRefCm > 60 ? 0 : o.offsetCm + o.widthCm + 5 }
    const base: Apartment = { ...a, openings: { ...a.openings, [second.id]: second } }
    const overlapping = proposeOpeningChange(base, second.id, { fromRefCm: i.fromRefCm })
    expect(overlapping.ok).toBe(false)
    expect(overlapping.issues.some((x) => x.code === 'opening-overlap')).toBe(true)
    expect(overlapping.issues[0].message).toContain('пересекается')
  })

  it('отказ не меняет исходную квартиру', () => {
    const a = apt1b()
    const snap = plain(a)
    proposeOpeningChange(a, window1(a).id, { fromRefCm: -50 })
    proposeOpeningChange(a, window1(a).id, { widthCm: 9999 })
    expect(plain(a)).toBe(snap)
  })
})

describe('9.4 допустимые операции (D-04)', () => {
  it('предлагаются только положение, ширина, высота и (у двери) петли с открыванием', () => {
    const a = apt1b()
    const w = window1(a)
    const d = sharedDoor(a)
    const other = Object.values(a.walls).find((x) => x.id !== w.wallId)!
    // Перенос на другую стену и смена вида отсутствуют в API: патч не содержит wallId/kind, поэтому они не меняются.
    const p = proposeOpeningChange(a, w.id, { fromRefCm: 5, ...({ wallId: other.id, kind: 'door' } as object) })
    expect(p.candidate!.openings[w.id].wallId).toBe(w.wallId)
    expect(p.candidate!.openings[w.id].kind).toBe('window')
    // Петли и открывание у окна отклоняются.
    expect(proposeOpeningChange(a, w.id, { hinge: 'end' }).ok).toBe(false)
    expect(proposeOpeningChange(a, d.id, { hinge: 'end' }).ok).toBe(true)
  })
})

describe('9.5 петли и открывание', () => {
  it('переключение петель и комнаты открывания меняет зоны створки', () => {
    const a = apt1b()
    const d = sharedDoor(a)
    const [r1, r2] = roomsOfWall(a, d.wallId)
    const swing = d.swingRoomId!
    const hinged = proposeOpeningChange(a, d.id, { hinge: d.hinge === 'end' ? 'start' : 'end' })
    expect(hinged.ok).toBe(true)
    expect(hinged.candidate!.openings[d.id].hinge).not.toBe(d.hinge)
    expect(JSON.stringify(doorZones(hinged.candidate!, hinged.candidate!.openings[d.id], swing))).not.toBe(JSON.stringify(doorZones(a, d, swing)))
    const flipTo = swing === r1 ? r2 : r1
    const flipped = proposeOpeningChange(a, d.id, { swingRoomId: flipTo })
    expect(flipped.ok).toBe(true)
    expect(flipped.candidate!.openings[d.id].swingRoomId).toBe(flipTo)
    expect(doorZones(flipped.candidate!, flipped.candidate!.openings[d.id], flipTo).length).toBe(2)
    expect(doorZones(flipped.candidate!, flipped.candidate!.openings[d.id], swing).length).toBe(1)
    // Чужая комната отклоняется.
    const stranger = Object.keys(a.rooms).find((id) => id !== r1 && id !== r2)!
    expect(proposeOpeningChange(a, d.id, { swingRoomId: stranger }).ok).toBe(false)
  })

  it('мебель в новой зоне двери блокирует переключение с названием предмета', () => {
    const a = apt1b()
    const d = sharedDoor(a)
    const roomId = d.swingRoomId!
    const item = TECH_CATALOG.sofa_02
    const flip: 'start' | 'end' = d.hinge === 'end' ? 'start' : 'end'
    let found: FurnitureInstance | null = null
    const poly = doorZones(a, d, roomId).flat()
    const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
    outer: for (let x = Math.min(...xs) - 120; x <= Math.max(...xs) + 120; x += 10) {
      for (let z = Math.min(...zs) - 120; z <= Math.max(...zs) + 120; z += 10) {
        for (const angleDeg of [0, 90]) {
          const f: FurnitureInstance = { id: 'f1', catalogItemId: item.id, assetVersion: item.version, roomId, xCm: x, zCm: z, elevationCm: 0, angleDeg }
          if (!validatePlacement(a, TECH_CATALOG, f).valid) continue
          const withF: Apartment = { ...a, furniture: { f1: f } }
          const p = proposeOpeningChange(withF, d.id, { hinge: flip }, { catalog: TECH_CATALOG })
          if (!p.ok && p.issues.some((i) => i.message.includes('зоне двери'))) { found = f; break outer }
        }
      }
    }
    expect(found, 'нужна позиция, где диван допустим сейчас и мешает после переключения').not.toBeNull()
    const withF: Apartment = { ...a, furniture: { f1: found! } }
    const p = proposeOpeningChange(withF, d.id, { hinge: flip }, { catalog: TECH_CATALOG })
    expect(p.issues[0].message).toContain(`«${item.name}»`)
    expect(p.candidate).toBeNull()
  })
})

describe('применение через общую команду проекта', () => {
  it('изменение — один шаг истории, отмена возвращает прежнее состояние', () => {
    const a = apt1b()
    const store = createProjectStore(a)
    const o = window1(a)
    const p = proposeOpeningChange(a, o.id, { fromRefCm: openingInfo(a, o.id).fromRefCm + 10 })
    const candidate = p.candidate!
    expect(store.getState().apply('Изменение проёма', () => candidate).ok).toBe(true)
    expect(plain(store.getState().history.present)).not.toBe(plain(a))
    store.getState().undo()
    expect(plain(store.getState().history.present)).toBe(plain(a))
    expect(canUndo(store.getState().history)).toBe(false)
  })
})
