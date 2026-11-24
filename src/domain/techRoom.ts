import type { Apartment } from './types'

/** ТЕХНИЧЕСКАЯ комната этапа 4: 420×350 см (чистовые), стены 30 см. Не схема квартиры. */
export function techRoomApartment(): Apartment {
  const v = (id: string, xCm: number, zCm: number) => [id, { id, xCm, zCm }] as const
  const w = (id: string, a: string, b: string) => [id, { id, startVertexId: a, endVertexId: b, thicknessCm: 30 }] as const
  return {
    id: 'tech-apartment',
    schemaVersion: 1,
    ceilingHeightCm: 270,
    vertices: Object.fromEntries([v('v1', -15, -15), v('v2', 435, -15), v('v3', 435, 365), v('v4', -15, 365)]),
    walls: Object.fromEntries([w('w1', 'v1', 'v2'), w('w2', 'v2', 'v3'), w('w3', 'v3', 'v4'), w('w4', 'v4', 'v1')]),
    rooms: {
      room: {
        id: 'room',
        type: 'living',
        name: 'Техническая комната',
        boundary: ['w1', 'w2', 'w3', 'w4'].map((wallId) => ({ wallId, reversed: false })),
      },
    },
    openings: {},
    furniture: {},
    surfaceMaterials: {},
    floorCoverings: {},
  }
}
