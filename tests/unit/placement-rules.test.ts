import { describe, expect, it } from 'vitest'
import { validatePlacement, type Catalog } from '../../src/domain/placement'
import { techRoomApartment } from '../../src/domain/techRoom'
import type { Apartment, CatalogItem, ColliderBox, MountType } from '../../src/domain/types'
import { formatCm } from '../../src/geometry/units'
import { twoRoomApartment } from './fixtures'

const lic = { source: '', author: '', license: '', attribution: '', retrievedAt: '' }
const box = (xCm: number, zCm: number, widthCm: number, depthCm: number, yMinCm: number, yMaxCm: number): ColliderBox =>
  ({ xCm, zCm, widthCm, depthCm, yMinCm, yMaxCm })
const mk = (id: string, colliders: ColliderBox[], mount: MountType = 'floor', layer: CatalogItem['layer'] = 'item'): CatalogItem => ({
  id, version: '1', name: id, category: 't', roomTypes: ['living'], widthCm: 0, depthCm: 0, heightCm: 0,
  mount, layer, modelUrl: '', previewUrl: '', colliders, materialIds: [], license: lic,
})
const solid = (id: string, w: number, d: number, h: number) => mk(id, [box(0, 0, w, d, 0, h)])

const catalog: Catalog = {
  sofa: solid('sofa', 180, 80, 70),
  cab: solid('cab', 100, 50, 50),
  dot: solid('dot', 10, 10, 50),
  table: mk('table', [box(0, 0, 160, 80, 72, 76), ...[[-75, -35], [75, -35], [-75, 35], [75, 35]].map(([x, z]) => box(x, z, 6, 6, 0, 72))]),
  ell: mk('ell', [box(0, 0, 100, 40, 0, 50), box(-70, 0, 40, 20, 0, 50)]),
  chair: mk('chair', [box(0, 0, 40, 40, 0, 45), box(0, -18, 40, 4, 45, 90)]),
  rug: mk('rug', [box(0, 0, 200, 140, 0, 1)], 'floor', 'floorCovering'),
  shelf: mk('shelf', [box(0, 0, 100, 20, 0, 30)], 'wall'),
  lamp: mk('lamp', [box(0, 0, 30, 30, 0, 20)], 'ceiling'),
}
type Cand = { id?: string | null; roomId: string; xCm: number; zCm: number; angleDeg?: number; elevationCm?: number }
const put = (apt: Apartment, catalogItemId: string, c: Cand) =>
  validatePlacement(apt, catalog, { id: c.id ?? null, catalogItemId, roomId: c.roomId, xCm: c.xCm, zCm: c.zCm, angleDeg: c.angleDeg ?? 0, elevationCm: c.elevationCm })
const withItem = (a: Apartment, id: string, catalogItemId: string, c: Cand): Apartment => ({
  ...a, furniture: { ...a.furniture, [id]: { id, catalogItemId, assetVersion: '1', roomId: c.roomId, xCm: c.xCm, zCm: c.zCm, elevationCm: c.elevationCm ?? 0, angleDeg: c.angleDeg ?? 0 } },
})

// Двухкомнатная квартира: А x 0..400, z 0..300 (дверь на перегородке x=400, z 85..165, петли у z=85, открывается в А);
// Б x 410..610. Окно в А на стене z=0: x 135..235 (подоконник 90, высота 120).
const flat = (): Apartment => {
  const a = twoRoomApartment()
  a.openings.win = { id: 'win', kind: 'window', wallId: 'wBotA', offsetCm: 150, widthCm: 100, heightCm: 120, sillCm: 90 }
  return a
}
const A = (x: number, z: number, angleDeg = 0, extra: Partial<Cand> = {}): Cand => ({ roomId: 'A', xCm: x, zCm: z, angleDeg, ...extra })

describe('5.4 коллайдеры: поворот, высота, полная принадлежность комнате', () => {
  const tech = techRoomApartment()
  const T = (x: number, z: number, angleDeg = 0): Cand => ({ roomId: 'room', xCm: x, zCm: z, angleDeg })
  it('центр внутри, но выступающий угол за стеной — запрещено', () => {
    expect(put(tech, 'sofa', T(95, 175, 0)).valid).toBe(true)
    expect(put(tech, 'sofa', T(95, 175, 20)).code).toBe('outside-room')
  })
  it('составной предмет: любой коллайдер за стеной запрещает размещение', () => {
    // Основной объём 100 см, выступ слева на 40 см (локально x −90…−50).
    expect(put(tech, 'ell', T(60, 175)).code).toBe('outside-room') // основной объём внутри, выступ за стеной
    expect(put(tech, 'ell', T(90, 175)).valid).toBe(true) // выступ касается стены
  })
  it('стул задвинут под стол: высоты не пересекаются — можно; спинка или ножка в столе — нельзя', () => {
    const apt = withItem(tech, 'tbl', 'table', T(200, 100))
    expect(put(apt, 'chair', T(200, 130, 180)).valid).toBe(true) // сиденье под столешницей, спинка за краем
    expect(put(apt, 'chair', T(200, 110, 180)).code).toBe('overlap') // спинка (45–90) задевает столешницу (72–76)
    expect(put(apt, 'chair', T(128, 130, 180)).code).toBe('overlap') // сиденье задевает ножку стола
  })
  it('предметы с непересекающимися высотами не конфликтуют, пересекающимися — конфликтуют', () => {
    const apt = withItem(tech, 'tbl', 'table', T(200, 100))
    expect(put(apt, 'cab', T(200, 100)).valid).toBe(true) // шкаф 0–50 стоит между ножек под столешницей 72–76
    const hit = put(apt, 'cab', T(125, 135)) // накрывает ножку 0–72
    expect(hit.code).toBe('overlap')
    expect(hit.conflictIds).toEqual(['tbl'])
  })
  it('высота установки настенного предмета участвует в проверке пересечения', () => {
    // Диван у стены z=300 (z 220..300, высота 0–70). Полка на стене над ним.
    const apt = withItem(flat(), 'sofa1', 'sofa', A(200, 260))
    expect(put(apt, 'shelf', A(200, 290, 180, { elevationCm: 150 })).valid).toBe(true) // 150–180 выше дивана
    expect(put(apt, 'shelf', A(200, 290, 180, { elevationCm: 50 })).code).toBe('overlap') // 50–80 задевает 0–70
  })
})

describe('5.5 исключения D-05 и зоны D-06', () => {
  it('ковёр лежит под диваном; два ковра друг на друге запрещены', () => {
    const apt = withItem(flat(), 'sofa1', 'sofa', A(200, 150))
    expect(put(apt, 'rug', A(200, 150)).valid).toBe(true)
    const withRug = withItem(apt, 'rug1', 'rug', A(200, 150))
    expect(put(withRug, 'rug', A(240, 150)).code).toBe('overlap')
    expect(put(withRug, 'sofa', A(200, 150)).code).toBe('overlap') // диван на диване
  })
  it('ковёр допустим в зоне двери, предмет — нет', () => {
    expect(put(flat(), 'rug', A(300, 125)).valid).toBe(true)
    expect(put(flat(), 'cab', A(350, 125)).code).toBe('door-zone')
  })
  it('прямоугольник 30 см перед дверью действует с обеих сторон', () => {
    const b = (x: number): Cand => ({ roomId: 'B', xCm: x, zCm: 125 })
    expect(put(flat(), 'cab', b(470)).code).toBe('door-zone') // x 420..520 заходит в 410..440
    expect(put(flat(), 'cab', b(490)).valid).toBe(true) // x 440..540, касается границы зоны
  })
  it('сектор открывания только в комнате створки и ограничен дугой (четверть круга, не квадрат)', () => {
    // Петли у (400, 85), радиус 80. Предмет 10×10 в углу квадрата зоны, но вне дуги.
    expect(put(flat(), 'dot', A(326, 159)).valid).toBe(true) // угол (331,154) на расстоянии ≈ 97,6 > 80
    expect(put(flat(), 'dot', A(360, 125)).code).toBe('door-zone') // внутри сектора
    // В Б сектора нет: предмет там, где был бы сектор зеркально, допустим.
    expect(put(flat(), 'dot', { roomId: 'B', xCm: 460, zCm: 125 }).valid).toBe(true)
  })
  it('касание зоны допустимо: предмет вплотную к границе 165 см', () => {
    expect(put(flat(), 'cab', A(350, 190)).valid).toBe(true) // z 165..215
    expect(put(flat(), 'cab', A(350, 189.98)).code).toBe('door-zone')
  })
  it('предмет выше двери не попадает в зону двери', () => {
    const tall = mk('tall', [box(0, 0, 100, 50, 210, 240)])
    const cat = { ...catalog, tall }
    const r = validatePlacement(flat(), cat, { id: null, catalogItemId: 'tall', roomId: 'A', xCm: 350, zCm: 125, angleDeg: 0 })
    expect(r.valid).toBe(true)
  })
  it('мебель под окном разрешена, навесной предмет на окне — нет; ниже подоконника — можно', () => {
    expect(put(flat(), 'sofa', A(185, 50)).valid).toBe(true) // диван у стены z=0 под окном
    expect(put(flat(), 'shelf', A(200, 10, 0, { elevationCm: 100 })).code).toBe('opening-conflict')
    expect(put(flat(), 'shelf', A(200, 10, 0, { elevationCm: 40 })).valid).toBe(true) // 40–70 ниже подоконника 90
    expect(put(flat(), 'shelf', A(200, 10, 0, { elevationCm: 220 })).valid).toBe(true) // выше окна (90+120=210)
    expect(put(flat(), 'shelf', A(330, 10, 0, { elevationCm: 100 })).valid).toBe(true) // сплошной участок стены
  })
  it('настенный предмет: задняя сторона вплотную к стене лицом в комнату, иначе неверная опора', () => {
    expect(put(flat(), 'shelf', A(60, 10, 0, { elevationCm: 100 })).valid).toBe(true)
    expect(put(flat(), 'shelf', A(60, 30, 0, { elevationCm: 100 })).code).toBe('bad-support') // отодвинут от стены
    expect(put(flat(), 'shelf', A(60, 10, 180, { elevationCm: 100 })).code).toBe('bad-support') // лицом к стене
    expect(put(flat(), 'shelf', A(10, 100, 90, { elevationCm: 100 })).valid).toBe(true) // левая стена x=0
  })
  it('напольный предмет не висит; потолочный висит от потолка (этап 21), хранимая высота не важна', () => {
    expect(put(flat(), 'sofa', A(200, 150, 0, { elevationCm: 20 })).code).toBe('bad-support')
    const hung = put(flat(), 'lamp', A(200, 150))
    expect(hung.valid).toBe(true)
    expect(hung.elevationCm).toBe(flat().ceilingHeightCm - catalog.lamp.heightCm)
    expect(put(flat(), 'lamp', A(200, 150, 0, { elevationCm: 5 })).valid).toBe(true)
  })
})

describe('5.6 допуск, касание и округление', () => {
  const tech = techRoomApartment()
  const T = (x: number): Cand => ({ roomId: 'room', xCm: x, zCm: 175 })
  it('касание стены допустимо, проникновение больше допуска 0,01 см — нет', () => {
    expect(put(tech, 'sofa', T(90)).valid).toBe(true)
    expect(put(tech, 'sofa', T(89.995)).valid).toBe(true) // в пределах допуска
    expect(put(tech, 'sofa', T(89.98)).code).toBe('outside-room')
  })
  it('решение не зависит от округления подписи', () => {
    // Подпись округляет 89,98 до «90», но предмет всё же выходит за стену.
    expect(formatCm(89.98)).toContain('90')
    expect(put(tech, 'sofa', T(89.98)).valid).toBe(false)
    expect(put(tech, 'sofa', T(Math.round(89.98))).valid).toBe(true)
  })
  it('предметы вплотную друг к другу допустимы, наложение на 0,02 см — нет', () => {
    const apt = withItem(tech, 'a', 'cab', { roomId: 'room', xCm: 100, zCm: 100 }) // x 50..150
    expect(put(apt, 'cab', { roomId: 'room', xCm: 200, zCm: 100 }).valid).toBe(true)
    expect(put(apt, 'cab', { roomId: 'room', xCm: 199.98, zCm: 100 }).code).toBe('overlap')
  })
})
