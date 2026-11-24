import { describe, expect, it } from 'vitest'
import { validatePlacement, type Catalog } from '../../src/domain/placement'
import { techRoomApartment } from '../../src/domain/techRoom'
import type { Apartment, CatalogItem } from '../../src/domain/types'
import { convexOverlap, rectCorners } from '../../src/geometry/placement'

// Комната 420×350 см: чистовой контур x 0..420, z 0..350.
const mk = (id: string, w: number, d: number, h: number, yMin = 0): CatalogItem => ({
  id, version: '1', name: id, category: 't', roomTypes: ['living'], widthCm: w, depthCm: d, heightCm: h,
  mount: 'floor', layer: 'item', modelUrl: '', previewUrl: '',
  colliders: [{ xCm: 0, zCm: 0, widthCm: w, depthCm: d, yMinCm: yMin, yMaxCm: yMin + h }],
  materialIds: [], license: { source: '', author: '', license: '', attribution: '', retrievedAt: '' },
})
const catalog: Catalog = { sofa: mk('sofa', 180, 80, 70), box: mk('box', 100, 50, 50), low: mk('low', 100, 50, 20), high: mk('high', 100, 50, 20, 40) }
const apt = techRoomApartment()
const at = (catalogItemId: string, xCm: number, zCm: number, angleDeg = 0) => ({ id: null, catalogItemId, roomId: 'room', xCm, zCm, angleDeg })
const withItem = (a: Apartment, id: string, catalogItemId: string, xCm: number, zCm: number, angleDeg = 0): Apartment => ({
  ...a, furniture: { ...a.furniture, [id]: { id, catalogItemId, assetVersion: '1', roomId: 'room', xCm, zCm, elevationCm: 0, angleDeg } },
})

describe('4.4 валидатор размещения: выход за стену', () => {
  it('предмет внутри комнаты допустим', () => {
    expect(validatePlacement(apt, catalog, at('sofa', 210, 175)).valid).toBe(true)
  })
  it('касание стены без проникновения допустимо, миллиметр за стеной — нет', () => {
    expect(validatePlacement(apt, catalog, at('sofa', 90, 175)).valid).toBe(true) // левый край ровно в 0
    const r = validatePlacement(apt, catalog, at('sofa', 89, 175))
    expect(r.valid).toBe(false)
    expect(r.code).toBe('outside-room')
    expect(r.message).toBe('Предмет выходит за стену')
  })
  it('центр внутри, но угол после поворота за стеной — запрещено', () => {
    expect(validatePlacement(apt, catalog, at('sofa', 95, 175, 0)).valid).toBe(true)
    const r = validatePlacement(apt, catalog, at('sofa', 95, 175, 20))
    expect(r.valid).toBe(false)
    expect(r.code).toBe('outside-room')
  })
  it('поворот на 90° меняет, какая сторона упирается в стену', () => {
    expect(validatePlacement(apt, catalog, at('sofa', 40, 175, 90)).valid).toBe(true) // ширина 80 вдоль x
    expect(validatePlacement(apt, catalog, at('sofa', 40, 175, 0)).valid).toBe(false)
  })
  it('нечисловые данные отклоняются', () => {
    expect(validatePlacement(apt, catalog, at('sofa', NaN, 175)).code).toBe('bad-data')
    expect(validatePlacement(apt, catalog, at('nope', 100, 100)).code).toBe('bad-data')
  })
})

describe('4.4 валидатор размещения: пересечения', () => {
  const base = withItem(apt, 'b1', 'box', 100, 100)
  it('пересечение запрещено, с названием предмета', () => {
    const r = validatePlacement(base, catalog, at('box', 150, 100))
    expect(r.valid).toBe(false)
    expect(r.code).toBe('overlap')
    expect(r.conflictIds).toEqual(['b1'])
  })
  it('касание гранями допустимо', () => {
    expect(validatePlacement(base, catalog, at('box', 200, 100)).valid).toBe(true)
  })
  it('предмет не конфликтует сам с собой при перемещении', () => {
    expect(validatePlacement(base, catalog, { ...at('box', 110, 100), id: 'b1' }).valid).toBe(true)
  })
  it('разные высоты на одном месте допустимы, пересекающиеся высоты — нет', () => {
    expect(validatePlacement(withItem(apt, 'h', 'high', 100, 100), catalog, at('low', 100, 100)).valid).toBe(true)
    expect(validatePlacement(withItem(apt, 'l', 'low', 100, 100), catalog, at('box', 100, 100)).valid).toBe(false)
  })
  it('повёрнутый предмет проверяется по контуру, а не по габаритному прямоугольнику', () => {
    // Узкий предмет 100×50 под 45° имеет габарит ~106×106, но угол пустой: сосед в углу габарита не мешает.
    const a = rectCorners({ cx: 0, cz: 0, w: 100, d: 50, angleDeg: 45 })
    const corner = rectCorners({ cx: 50, cz: 50, w: 10, d: 10, angleDeg: 0 })
    expect(convexOverlap(a, corner)).toBe(false)
    expect(convexOverlap(a, rectCorners({ cx: 20, cz: 20, w: 10, d: 10, angleDeg: 0 }))).toBe(true)
  })
})
