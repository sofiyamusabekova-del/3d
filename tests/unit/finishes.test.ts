import { existsSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { MATERIALS, PAINTS, WALLPAPERS } from '../../src/catalog/materials'
import { proposeWallMove, wallInfo } from '../../src/domain/geometryEdit'
import { neighbourRooms, roomSides, setSideFinishCommand, sideLabel, sideMaterialId, textureRepeats } from '../../src/domain/finishes'
import { roomsOfWall } from '../../src/domain/doors'
import { surfaceKey, type Apartment } from '../../src/domain/types'
import { validateApartment } from '../../src/domain/validate'
import { roomFaces } from '../../src/scene3d/roomGeometry'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { buildApartment, templateById } from '../../src/scenario/layouts'

const apt1b = () => buildApartment(templateById('1b')!)
const room = (a: Apartment, name: string) => Object.values(a.rooms).find((r) => r.name === name)!
const cur = () => useApartmentProject.getState().history.present

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(apt1b())
})

describe('12.1 стороны стен и поверхности', () => {
  it('стороны комнаты покрывают все её стены без пропусков; длины складываются', () => {
    const a = apt1b()
    for (const r of Object.values(a.rooms)) {
      const sides = roomSides(a, r.id)
      expect(sides.flatMap((s) => s.wallIds).sort()).toEqual(r.boundary.map((b) => b.wallId).sort())
      expect(sides).toHaveLength(4) // комнаты прямоугольные
      for (const s of sides) {
        const first = s.wallIds[0]
        expect(s.startCm[first]).toBe(0)
        expect(sideLabel(s)).toMatch(/стена$/)
      }
    }
  })

  it('стена, разделённая перегородкой, — одна сторона из нескольких участков', () => {
    const a = apt1b()
    const living = room(a, 'Комната')
    const multi = roomSides(a, living.id).find((s) => s.wallIds.length > 1)
    expect(multi, 'у комнаты схемы 1Б есть сторона из нескольких участков').toBeDefined()
    const total = multi!.wallIds.reduce((s, w) => s + faceLength(a, living.id, w), 0)
    expect(multi!.lengthCm).toBeCloseTo(total, 6)
  })

  it('соседние комнаты за стеной стороны определяются', () => {
    const a = apt1b()
    const living = room(a, 'Комната')
    const shared = roomSides(a, living.id).find((s) => neighbourRooms(a, s).length > 0)!
    expect(neighbourRooms(a, shared).every((id) => id !== living.id)).toBe(true)
  })
})

function faceLength(a: Apartment, roomId: string, wallId: string) {
  const f = roomFaces(a, roomId).faces.find((x) => x.wallId === wallId)!
  return f.lengthCm
}

describe('12.3 назначение отделки (AC-11)', () => {
  it('покраска стороны общей стены не меняет соседнюю комнату', () => {
    const a = cur()
    const living = room(a, 'Комната')
    const side = roomSides(a, living.id).find((s) => neighbourRooms(a, s).length > 0)!
    const other = neighbourRooms(a, side)[0]
    const r = useApartmentProject.getState().apply('Отделка', setSideFinishCommand(living.id, side.wallIds, 'paint_sage'))
    expect(r.ok).toBe(true)
    const after = cur()
    for (const w of side.wallIds) {
      expect(after.surfaceMaterials[surfaceKey(w, living.id)]).toBe('paint_sage')
      for (const roomId of roomsOfWall(a, w).filter((x) => x !== living.id)) expect(after.surfaceMaterials[surfaceKey(w, roomId)]).toBeUndefined()
    }
    // Все стороны соседней комнаты остаются без отделки.
    for (const s of roomSides(after, other)) expect(sideMaterialId(after, s)).toBeNull()
    // Стороны этой же комнаты, кроме выбранной, тоже не тронуты.
    expect(roomSides(after, living.id).filter((s) => sideMaterialId(after, s) !== null)).toHaveLength(1)
  })

  it('обе стороны одной перегородки красятся независимо', () => {
    const a = cur()
    const living = room(a, 'Комната')
    const side = roomSides(a, living.id).find((s) => neighbourRooms(a, s).length > 0)!
    const other = neighbourRooms(a, side)[0]
    const otherSide = roomSides(a, other).find((s) => s.wallIds.some((w) => side.wallIds.includes(w)))!
    useApartmentProject.getState().apply('Отделка', setSideFinishCommand(living.id, side.wallIds, 'paint_terracotta'))
    useApartmentProject.getState().apply('Отделка', setSideFinishCommand(other, otherSide.wallIds, 'rough_linen'))
    const after = cur()
    expect(sideMaterialId(after, roomSides(after, living.id).find((s) => s.index === side.index)!)).toBe('paint_terracotta')
    expect(sideMaterialId(after, roomSides(after, other).find((s) => s.index === otherSide.index)!)).toBe('rough_linen')
  })

  it('отделку можно снять и отменить; каждое действие — один шаг истории', () => {
    const a = cur()
    const living = room(a, 'Комната')
    const side = roomSides(a, living.id)[0]
    const before = JSON.stringify(cur())
    useApartmentProject.getState().apply('Отделка', setSideFinishCommand(living.id, side.wallIds, 'paint_navy'))
    useApartmentProject.getState().apply('Отделка', setSideFinishCommand(living.id, side.wallIds, null))
    expect(Object.keys(cur().surfaceMaterials)).toHaveLength(0)
    useApartmentProject.getState().undo()
    expect(sideMaterialId(cur(), roomSides(cur(), living.id)[0])).toBe('paint_navy')
    useApartmentProject.getState().undo()
    expect(JSON.stringify(cur())).toBe(before)
  })

  it('неизвестный материал отклоняется проектом без изменений', () => {
    const a = cur()
    const living = room(a, 'Комната')
    const before = JSON.stringify(a)
    const r = useApartmentProject.getState().apply('Отделка', setSideFinishCommand(living.id, roomSides(a, living.id)[0].wallIds, 'no_such_material'))
    expect(r.ok).toBe(false)
    expect(JSON.stringify(cur())).toBe(before)
  })
})

describe('12.4 физический масштаб текстуры', () => {
  it('повторы выводятся из размеров в см', () => {
    expect(textureRepeats(270, 270, { widthCm: 27, heightCm: 27 })).toEqual({ across: 10, up: 10 })
    const t = WALLPAPERS[0].tileSizeCm!
    expect(textureRepeats(540, 270, t).across).toBeCloseTo(2 * textureRepeats(270, 270, t).across, 9)
  })

  it('координата u непрерывна вдоль всей стороны и равна расстоянию в см от её начала', () => {
    const a = apt1b()
    const living = room(a, 'Комната')
    const faces = roomFaces(a, living.id).faces
    for (const side of roomSides(a, living.id)) {
      const parts = faces.filter((f) => f.sideIndex === side.index).sort((p, q) => p.sideStartCm - q.sideStartCm)
      let cursor = 0
      for (const f of parts) {
        expect(f.sideStartCm).toBeCloseTo(cursor, 6)
        cursor += f.lengthCm
      }
      expect(cursor).toBeCloseTo(side.lengthCm, 6)
    }
  })

  it('после удлинения стены рисунок не растягивается: u точки на прежнем расстоянии от начала не меняется, повторов больше', () => {
    const a = cur()
    const living = room(a, 'Комната')
    // Верхняя или нижняя сторона комнаты: её длину меняет сдвиг боковой общей стены.
    const side = roomSides(a, living.id).find((s) => Math.abs(s.dir.x) > 0.9)!
    const wallOfSide = roomSides(a, living.id).find((s) => Math.abs(s.dir.z) > 0.9 && neighbourRooms(a, s).length > 0)!
    const w = wallInfo(a, wallOfSide.wallIds[0])
    const mine = w.rooms.find((r) => r.roomId === living.id)!
    const p = proposeWallMove(a, wallOfSide.wallIds[0], 30 * mine.sign)
    expect(p.ok).toBe(true)
    const b = p.candidate!
    const sideAfter = roomSides(b, living.id).find((s) => s.index === side.index)!
    expect(sideAfter.lengthCm).toBeCloseTo(side.lengthCm + 30, 6)
    const tile = WALLPAPERS[0].tileSizeCm!
    expect(textureRepeats(sideAfter.lengthCm, 270, tile).across).toBeGreaterThan(textureRepeats(side.lengthCm, 270, tile).across)
    // u задан в см от начала стороны: первая панель начинается с 0 до и после.
    const uStart = (apt: Apartment) => Math.min(...roomFaces(apt, living.id).faces.filter((f) => f.sideIndex === side.index).map((f) => f.sideStartCm))
    expect(uStart(b)).toBe(uStart(a))
  })
})

describe('12.5 отделка при изменениях геометрии и переходах', () => {
  it('допустимый сдвиг стены сохраняет отделку и проект остаётся корректным', () => {
    const a = cur()
    const living = room(a, 'Комната')
    const sides = roomSides(a, living.id)
    for (const [i, s] of sides.entries()) useApartmentProject.getState().apply('Отделка', setSideFinishCommand(living.id, s.wallIds, PAINTS[i].id))
    const painted = { ...cur().surfaceMaterials }
    const wallSide = sides.find((s) => Math.abs(s.dir.z) > 0.9 && neighbourRooms(a, s).length > 0)!
    const mine = wallInfo(a, wallSide.wallIds[0]).rooms.find((r) => r.roomId === living.id)!
    const p = proposeWallMove(cur(), wallSide.wallIds[0], 20 * mine.sign)
    expect(p.ok).toBe(true)
    expect(useApartmentProject.getState().apply('Сдвиг', () => p.candidate!).ok).toBe(true)
    expect(cur().surfaceMaterials).toEqual(painted)
    expect(validateApartment(cur())).toEqual([])
  })

  it('замена схемы начинает с чистой отделки', () => {
    const living = room(cur(), 'Комната')
    useApartmentProject.getState().apply('Отделка', setSideFinishCommand(living.id, roomSides(cur(), living.id)[0].wallIds, 'paint_sage'))
    useApartmentProject.getState().reset(buildApartment(templateById('1v')!))
    expect(Object.keys(cur().surfaceMaterials)).toHaveLength(0)
  })
})

describe('12.2 реестр материалов', () => {
  it('идентификаторы уникальны, у обоев есть файлы, физический размер и источник', () => {
    const ids = [...PAINTS, ...WALLPAPERS].map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(MATERIALS)).toHaveLength(ids.length)
    for (const p of PAINTS) {
      expect(p.colorHex).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.textureUrl).toBeUndefined()
    }
    for (const w of WALLPAPERS) {
      expect(w.tileSizeCm!.widthCm).toBeGreaterThan(5)
      expect(w.tileSizeCm!.heightCm).toBeGreaterThan(5)
      expect(w.source?.license).toBe('CC0 1.0')
      expect(w.source?.url).toContain('polyhaven.com')
      for (const url of [w.textureUrl!, w.normalUrl!, w.thumbUrl!]) expect(existsSync(`public${url}`), url).toBe(true)
      expect(w.swatchHex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('краски различимы между собой: нет двух почти одинаковых цветов', () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    for (let i = 0; i < PAINTS.length; i++) {
      for (let j = i + 1; j < PAINTS.length; j++) {
        const [a, b] = [rgb(PAINTS[i].colorHex!), rgb(PAINTS[j].colorHex!)]
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        expect(d, `${PAINTS[i].name} / ${PAINTS[j].name}`).toBeGreaterThan(18)
      }
    }
  })
})
