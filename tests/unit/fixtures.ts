import type { Apartment } from '../../src/domain/types'

/**
 * Две соседние комнаты с общей перегородкой.
 * Чистовые размеры: А 400×300 см, Б 200×300 см. Внешние стены 30 см, перегородка 10 см.
 * Оси: x от −15 до 625, z от −15 до 315; ось перегородки x = 405.
 */
export function twoRoomApartment(): Apartment {
  const v = (id: string, xCm: number, zCm: number) => [id, { id, xCm, zCm }] as const
  const w = (id: string, a: string, b: string, thicknessCm: number) =>
    [id, { id, startVertexId: a, endVertexId: b, thicknessCm }] as const
  return {
    id: 'apt-1',
    schemaVersion: 1,
    ceilingHeightCm: 270,
    vertices: Object.fromEntries([
      v('v1', -15, -15), v('v2', 405, -15), v('v3', 625, -15),
      v('v4', 625, 315), v('v5', 405, 315), v('v6', -15, 315),
    ]),
    walls: Object.fromEntries([
      w('wBotA', 'v1', 'v2', 30), w('wBotB', 'v2', 'v3', 30), w('wRight', 'v3', 'v4', 30),
      w('wTopB', 'v4', 'v5', 30), w('wTopA', 'v5', 'v6', 30), w('wLeft', 'v6', 'v1', 30),
      w('wShared', 'v2', 'v5', 10),
    ]),
    rooms: {
      A: {
        id: 'A', type: 'living', name: 'Комната А',
        boundary: [
          { wallId: 'wBotA', reversed: false }, { wallId: 'wShared', reversed: false },
          { wallId: 'wTopA', reversed: false }, { wallId: 'wLeft', reversed: false },
        ],
      },
      B: {
        id: 'B', type: 'hallway', name: 'Коридор Б',
        boundary: [
          { wallId: 'wBotB', reversed: false }, { wallId: 'wRight', reversed: false },
          { wallId: 'wTopB', reversed: false }, { wallId: 'wShared', reversed: true },
        ],
      },
    },
    openings: {
      door1: { id: 'door1', kind: 'door', wallId: 'wShared', offsetCm: 100, widthCm: 80, heightCm: 205, sillCm: 0, hinge: 'start', swingRoomId: 'A' },
    },
    furniture: {},
    surfaceMaterials: {},
    floorCoverings: {},
  }
}
