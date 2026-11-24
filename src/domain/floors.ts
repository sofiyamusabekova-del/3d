import type { Apartment, FloorCovering, Id, Issue } from './types'

/**
 * Покрытие пола комнаты (SPEC D-16): запись «комната → вид и цвет». Входит в проект и историю отмены,
 * как отделка стен: назначается общей командой, проверяется при каждом изменении проекта.
 */

/** Назначает покрытие комнате или снимает его при null; другие комнаты не меняются. */
export const setFloorCoveringCommand = (roomId: Id, covering: FloorCovering | null) => (a: Apartment): Apartment => {
  if (!a.rooms[roomId]) throw new Error(`Комната ${roomId} не найдена`)
  const next = { ...a.floorCoverings }
  if (covering === null) delete next[roomId]
  else next[roomId] = { kind: covering.kind, colorId: covering.colorId }
  return { ...a, floorCoverings: next }
}

/** Проверка целостности: покрытие ссылается на существующую комнату и на известные вид и цвет. */
export const validateFloorCoverings = (isKnown: (c: FloorCovering) => boolean) => (apt: Apartment): Issue[] => {
  const issues: Issue[] = []
  for (const [roomId, c] of Object.entries(apt.floorCoverings)) {
    if (!apt.rooms[roomId]) issues.push({ code: 'missing-ref', message: `Покрытие пола относится к несуществующей комнате ${roomId}`, objectId: roomId })
    else if (!c || !isKnown(c)) issues.push({ code: 'unknown-floor', message: `Покрытие пола комнаты «${apt.rooms[roomId].name}»: неизвестный вид или цвет`, objectId: roomId })
  }
  return issues
}
