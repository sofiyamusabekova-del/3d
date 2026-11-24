import { describe, expect, it } from 'vitest'
import { TECH_CATALOG } from '../../src/catalog/techCatalog'
import { apartmentNetAreaM2, apartmentOuterAreaM2 } from '../../src/domain/derive'
import { openingFrame, roomsOfWall } from '../../src/domain/doors'
import {
  deltaForRoomSize, proposeCeilingHeight, proposeWallMove, roomBox, wallInfo, wallLine,
} from '../../src/domain/geometryEdit'
import { canUndo } from '../../src/domain/history'
import { validateFurniturePlacement, validatePlacement } from '../../src/domain/placement'
import { createProjectStore } from '../../src/domain/store'
import type { Apartment, Id } from '../../src/domain/types'
import { validateApartment } from '../../src/domain/validate'
import { parseCmInput } from '../../src/scenario/input'
import { buildApartment, templateById } from '../../src/scenario/layouts'

const apt1b = () => buildApartment(templateById('1b')!)
const room = (a: Apartment, name: string) => Object.values(a.rooms).find((r) => r.name === name)!

/** Стены комнаты, лежащие на вертикальной (axis x) или горизонтальной линии с краевой координатой. */
function edgeWall(a: Apartment, roomName: string, axis: 'x' | 'z', side: 'min' | 'max'): Id {
  const r = room(a, roomName)
  const key = axis === 'x' ? 'xCm' : 'zCm'
  const cands = r.boundary
    .map((b) => a.walls[b.wallId])
    .filter((w) => Math.abs(a.vertices[w.startVertexId][key] - a.vertices[w.endVertexId][key]) < 0.01)
  const val = (w: (typeof cands)[number]) => a.vertices[w.startVertexId][key]
  cands.sort((p, q) => (side === 'min' ? val(p) - val(q) : val(q) - val(p)))
  return cands[0].id
}

const plain = (a: Apartment) => JSON.stringify(a)

describe('8.2 сдвиг общей стены (D-03)', () => {
  it('прямая стена идёт вдоль нескольких комнат и сдвигается целиком', () => {
    const a = apt1b()
    const wall = edgeWall(a, 'Комната', 'x', 'max') // перегородка между комнатой и колонкой
    const line = wallLine(a, wall)
    expect(line.wallIds.length).toBeGreaterThanOrEqual(3)
    expect(line.exterior).toBe(false)
    expect(line.axis).toBe('x')
  })

  it('меняются обе стороны на одно значение, противоположные стены остаются на месте', () => {
    const a = apt1b()
    const wall = edgeWall(a, 'Комната', 'x', 'max')
    const before = Object.fromEntries(Object.values(a.rooms).map((r) => [r.name, roomBox(a, r)]))
    const p = proposeWallMove(a, wall, 30)
    expect(p.issues).toEqual([])
    expect(p.ok).toBe(true)
    const c = p.candidate!
    const after = Object.fromEntries(Object.values(c.rooms).map((r) => [r.name, roomBox(c, r)]))
    expect(after['Комната'].widthCm).toBeCloseTo(before['Комната'].widthCm + 30, 6)
    for (const n of ['Кухня', 'Прихожая', 'Санузел']) expect(after[n].widthCm).toBeCloseTo(before[n].widthCm - 30, 6)
    for (const r of Object.values(a.rooms)) expect(after[r.name].depthCm).toBeCloseTo(before[r.name].depthCm, 6)
    expect(p.affected.map((x) => x.name).sort()).toEqual(['Кухня', 'Комната', 'Прихожая', 'Санузел'].sort())
    // Внешние стены (противоположные) не двигались.
    const line = wallLine(a, wall)
    for (const v of Object.values(a.vertices)) {
      expect(Math.abs(c.vertices[v.id].xCm - v.xCm) > 0.01, v.id).toBe(line.vertexIds.includes(v.id))
      expect(c.vertices[v.id].zCm).toBe(v.zCm)
    }
    expect(validateApartment(c)).toEqual([])
    expect(p.exterior).toBe(false)
  })

  it('число вместо смещения: комната получает заданный размер, соседняя уменьшается на столько же', () => {
    const a = apt1b()
    const wall = edgeWall(a, 'Комната', 'x', 'max')
    const info = wallInfo(a, wall)
    const living = info.rooms.find((r) => r.name === 'Комната')!
    const kitchen = info.rooms.find((r) => r.name === 'Кухня')!
    expect(living.dimension).toBe('width')
    expect(living.sign).toBe(1)
    expect(kitchen.sign).toBe(-1)
    const d = deltaForRoomSize(living, living.sizeCm + 40)
    expect(d).toBe(40)
    expect(deltaForRoomSize(kitchen, kitchen.sizeCm - 40)).toBe(40) // тот же сдвиг, заданный со стороны кухни
    const c = proposeWallMove(a, wall, d).candidate!
    expect(roomBox(c, room(c, 'Комната')).widthCm).toBeCloseTo(living.sizeCm + 40, 6)
  })

  it('проёмы на примыкающих стенах остаются на прежнем месте плана', () => {
    const a = apt1b()
    const wall = edgeWall(a, 'Комната', 'x', 'max')
    const c = proposeWallMove(a, wall, 30).candidate!
    const line = wallLine(a, wall)
    for (const o of Object.values(a.openings)) {
      if (line.wallIds.includes(o.wallId)) continue // дверь на самой стене едет вместе с ней
      const rid = roomsOfWall(a, o.wallId)[0]
      const p0 = openingFrame(a, o, rid).p0
      const q0 = openingFrame(c, c.openings[o.id], rid).p0
      expect(q0.x).toBeCloseTo(p0.x, 6)
      expect(q0.z).toBeCloseTo(p0.z, 6)
    }
  })

  it('сдвиг на 0 не создаёт изменения', () => {
    const a = apt1b()
    const p = proposeWallMove(a, edgeWall(a, 'Комната', 'x', 'max'), 0)
    expect(p.ok).toBe(true)
    expect(p.candidate).toBe(a)
  })
})

describe('8.3 явное изменение внешнего контура', () => {
  it('внешняя стена: площадь растёт и показана до/после', () => {
    const a = apt1b()
    const wall = edgeWall(a, 'Комната', 'x', 'min') // левая внешняя
    const p = proposeWallMove(a, wall, -50)
    expect(p.ok).toBe(true)
    expect(p.exterior).toBe(true)
    expect(p.affected.map((x) => x.name)).toEqual(['Комната'])
    const living = p.affected[0]
    expect(living.after.widthCm).toBeCloseTo(living.before.widthCm + 50, 6)
    expect(p.after!.netM2).toBeGreaterThan(p.before.netM2)
    expect(p.after!.outerM2).toBeGreaterThan(p.before.outerM2)
    expect(p.before.netM2).toBeCloseTo(apartmentNetAreaM2(a), 9)
    expect(p.after!.outerM2).toBeCloseTo(apartmentOuterAreaM2(p.candidate!), 9)
    // Прирост = 50 см × длина комнаты.
    expect((p.after!.netM2 - p.before.netM2) * 10_000).toBeCloseTo(50 * living.before.depthCm, 3)
  })

  it('мебель не масштабируется и не двигается', () => {
    const a = apt1b()
    const living = room(a, 'Комната')
    const sofa = { id: 'f1', catalogItemId: 'sofa_02', assetVersion: TECH_CATALOG.sofa_02.version, roomId: living.id, xCm: 150, zCm: 100, elevationCm: 0, angleDeg: 0 }
    const withSofa: Apartment = { ...a, furniture: { f1: sofa } }
    expect(validatePlacement(withSofa, TECH_CATALOG, sofa).valid).toBe(true)
    const p = proposeWallMove(withSofa, edgeWall(a, 'Комната', 'x', 'min'), -50, { catalog: TECH_CATALOG })
    expect(p.ok).toBe(true)
    expect(p.candidate!.furniture).toBe(withSofa.furniture)
    expect(p.candidate!.furniture.f1).toEqual(sofa)
  })
})

describe('8.4 / AC-03 предпросмотр и конфликт в соседней комнате', () => {
  const kitchenWithSofa = () => {
    const a = apt1b()
    const kitchen = room(a, 'Кухня')
    const b = roomBox(a, kitchen)
    const poly = planeLeft(a, kitchen.id)
    const sofa = { id: 'f1', catalogItemId: 'sofa_02', assetVersion: '1', roomId: kitchen.id, xCm: poly.minX + 181 / 2, zCm: poly.minZ + 82 / 2, elevationCm: 0, angleDeg: 0 }
    const apt: Apartment = { ...a, furniture: { f1: sofa } }
    expect(b.widthCm).toBeGreaterThan(181 + 30)
    expect(validatePlacement(apt, TECH_CATALOG, sofa).valid).toBe(true)
    return { a, apt, kitchen }
  }
  function planeLeft(a: Apartment, roomId: Id) {
    const r = a.rooms[roomId]
    const pts = r.boundary.flatMap((b) => [a.vertices[a.walls[b.wallId].startVertexId], a.vertices[a.walls[b.wallId].endVertexId]])
    const t = 5 // половина перегородки: чистовой край на 5 см внутрь от оси
    return { minX: Math.min(...pts.map((p) => p.xCm)) + t, minZ: Math.min(...pts.map((p) => p.zCm)) + 15 }
  }

  it('предпросмотр перечисляет затронутые помещения с новыми размерами и площадью', () => {
    const a = apt1b()
    const p = proposeWallMove(a, edgeWall(a, 'Комната', 'x', 'max'), 30)
    const living = p.affected.find((x) => x.name === 'Комната')!
    expect(living.after.areaM2).toBeGreaterThan(living.before.areaM2)
    const kitchen = p.affected.find((x) => x.name === 'Кухня')!
    expect(kitchen.after.widthCm).toBeCloseTo(kitchen.before.widthCm - 30, 6)
    expect(p.after!.netM2).not.toBe(p.before.netM2)
  })

  it('шкаф (диван) в соседней комнате блокирует сдвиг с названием комнаты и предмета', () => {
    const { apt } = kitchenWithSofa()
    const wall = edgeWall(apt, 'Комната', 'x', 'max')
    const p = proposeWallMove(apt, wall, 30, { catalog: TECH_CATALOG })
    expect(p.ok).toBe(false)
    expect(p.candidate).toBeNull()
    const msg = p.issues.map((i) => i.message).join(' | ')
    expect(msg).toContain('Кухня')
    expect(msg).toContain('Диван')
    expect(msg).toContain('выходит за стену')
  })

  it('8.5 отказ не меняет состояние: тот же объект истории, ничего не записано', () => {
    const { apt } = kitchenWithSofa()
    const store = createProjectStore(apt, validateFurniturePlacement(TECH_CATALOG))
    const snapshot = plain(store.getState().history.present)
    const histBefore = store.getState().history
    const wall = edgeWall(apt, 'Комната', 'x', 'max')
    // Принудительно подаём недопустимого кандидата: общая команда обязана отклонить его сама.
    const bad = (cur: Apartment): Apartment => {
      const line = wallLine(cur, wall)
      const vertices = { ...cur.vertices }
      for (const id of line.vertexIds) vertices[id] = { ...vertices[id], xCm: vertices[id].xCm + 30 }
      return { ...cur, vertices }
    }
    const r = store.getState().apply('Сдвиг стены', bad)
    expect(r.ok).toBe(false)
    expect(store.getState().history).toBe(histBefore)
    expect(plain(store.getState().history.present)).toBe(snapshot)
    expect(canUndo(store.getState().history)).toBe(false)
  })

  it('допустимый сдвиг применяется одним шагом истории и отменяется точно', () => {
    const a = apt1b()
    const store = createProjectStore(a)
    const p = proposeWallMove(a, edgeWall(a, 'Комната', 'x', 'max'), 30)
    const r = store.getState().apply('Сдвиг стены', () => p.candidate!)
    expect(r.ok).toBe(true)
    expect(store.getState().history.past).toHaveLength(1)
    store.getState().undo()
    expect(plain(store.getState().history.present)).toBe(plain(a))
    store.getState().redo()
    expect(plain(store.getState().history.present)).toBe(plain(p.candidate!))
  })
})

describe('8.5 невалидные изменения блокируются с причиной', () => {
  it('стена становится короче проёма: сдвиг отклонён с названием проёма', () => {
    const a = apt1b()
    const wall = edgeWall(a, 'Кухня', 'x', 'min') // линия слева от колонки
    const p = proposeWallMove(a, wall, 250)
    expect(p.ok).toBe(false)
    expect(p.candidate).toBeNull()
    expect(p.issues.length).toBeGreaterThan(0)
    expect(p.issues.some((i) => /Дверь|Окно/.test(i.message) && /«/.test(i.message))).toBe(true)
    expect(p.issues.every((i) => !/Неверный размер/.test(i.message))).toBe(true)
  })

  it('комната не может превысить 1500 см', () => {
    const a = apt1b()
    const p = proposeWallMove(a, edgeWall(a, 'Кухня', 'x', 'max'), 1300)
    expect(p.ok).toBe(false)
    expect(p.issues.some((i) => i.code === 'room-size' && /1500/.test(i.message))).toBe(true)
  })

  it('стена, проходящая через соседнюю комнату, отклоняется валидатором геометрии', () => {
    const a = apt1b()
    const p = proposeWallMove(a, edgeWall(a, 'Комната', 'x', 'max'), 600)
    expect(p.ok).toBe(false)
    expect(p.issues.length).toBeGreaterThan(0)
  })

  it('нечисловой сдвиг отклоняется', () => {
    const a = apt1b()
    expect(proposeWallMove(a, edgeWall(a, 'Комната', 'x', 'max'), NaN).ok).toBe(false)
  })
})

describe('8.6 высота потолка', () => {
  it('допустимое значение меняет одну высоту на всю квартиру', () => {
    const a = apt1b()
    const p = proposeCeilingHeight(a, 300)
    expect(p.ok).toBe(true)
    expect(p.candidate!.ceilingHeightCm).toBe(300)
    expect(validateApartment(p.candidate!)).toEqual([])
  })

  it('проём выше нового потолка блокирует изменение и называет проём', () => {
    const a = apt1b()
    const window = Object.values(a.openings).find((o) => o.kind === 'window')!
    const top = window.sillCm + window.heightCm
    const p = proposeCeilingHeight(a, top - 5)
    expect(p.ok).toBe(false)
    expect(p.candidate).toBeNull()
    expect(p.issues.some((i) => i.message.includes('Окно') && i.message.includes(String(top)))).toBe(true)
    expect(proposeCeilingHeight(a, top).ok).toBe(true)
  })

  it('пределы 220–400 см', () => {
    const a = apt1b()
    expect(proposeCeilingHeight(a, 219).ok).toBe(false)
    expect(proposeCeilingHeight(a, 401).ok).toBe(false)
    expect(proposeCeilingHeight(a, 400).ok).toBe(true)
    // 220 см ниже верха окна (230 см): граница диапазона допустима, но окно блокирует.
    expect(proposeCeilingHeight(a, 220).issues.some((i) => i.message.includes('Окно'))).toBe(true)
  })

  it('то же значение — без изменения', () => {
    const a = apt1b()
    expect(proposeCeilingHeight(a, a.ceilingHeightCm).candidate).toBe(a)
  })
})

describe('ввод размеров в сантиметрах (SPEC §3.2)', () => {
  it('принимает запятую, точку и суффикс, округляет до целых', () => {
    expect(parseCmInput('420', 80, 1500, 'размер')).toEqual({ ok: true, valueCm: 420, text: '420' })
    expect(parseCmInput(' 420,6 см ', 80, 1500, 'размер')).toEqual({ ok: true, valueCm: 421, text: '421' })
    expect(parseCmInput('420.4', 80, 1500, 'размер')).toMatchObject({ ok: true, valueCm: 420 })
  })
  it('ошибки понятные', () => {
    expect(parseCmInput('', 80, 1500, 'размер')).toMatchObject({ ok: false })
    expect(parseCmInput('abc', 80, 1500, 'размер')).toMatchObject({ ok: false })
    expect(parseCmInput('-5', 80, 1500, 'размер')).toMatchObject({ ok: false })
    expect(parseCmInput('79', 80, 1500, 'размер')).toMatchObject({ ok: false, message: 'Слишком мало: минимум 80 см' })
    expect(parseCmInput('1501', 80, 1500, 'размер')).toMatchObject({ ok: false, message: 'Слишком много: максимум 1500 см' })
  })
})
