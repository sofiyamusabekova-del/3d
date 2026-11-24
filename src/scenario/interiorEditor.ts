import { CATALOG } from '../catalog/catalog'
import { roomClearPolygon } from '../domain/derive'
import { selectApartment } from '../domain/store'
import { createEditor } from '../prototype/editor'
import { useApartmentProject } from './flow'
import { useInterior } from './interior'

/**
 * Редактор предметов интерьера: тот же код, что в технической сцене, но над общим проектом квартиры
 * и активной комнатой. Каталог временный (технический), настоящий подключает этап 13.
 */
export const useInteriorEditor = createEditor({
  project: useApartmentProject,
  catalog: CATALOG,
  roomId: () => useInterior.getState().activeRoomId,
  idPrefix: 'i',
  spot: () => {
    const apt = selectApartment(useApartmentProject.getState())
    const id = useInterior.getState().activeRoomId
    if (!id || !apt.rooms[id]) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
    const poly = roomClearPolygon(apt, apt.rooms[id])
    const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
    return { minX: Math.min(...xs) + 30, maxX: Math.max(...xs) - 30, minZ: Math.min(...zs) + 30, maxZ: Math.max(...zs) - 30 }
  },
})

const clearEditor = () => useInteriorEditor.setState({ selectedId: null, draft: null, message: null })

// Смена комнаты сбрасывает выбор и незавершённый перенос: скрытые предметы ничего не перехватывают.
useInterior.subscribe((s, prev) => {
  if (s.activeRoomId !== prev.activeRoomId) clearEditor()
  // Выбран проём или сторона стены: выбор предмета снимается (выбран всегда один объект).
  const picked = (s.selectedOpeningId && s.selectedOpeningId !== prev.selectedOpeningId) || (s.selectedSideWallId && s.selectedSideWallId !== prev.selectedSideWallId)
  if (picked && useInteriorEditor.getState().selectedId) clearEditor()
})
// Выбран предмет: выбор проёма и стороны стены снимается.
useInteriorEditor.subscribe((s, prev) => {
  if (!s.selectedId || s.selectedId === prev.selectedId) return
  const i = useInterior.getState()
  if (i.selectedOpeningId || i.selectedSideWallId) useInterior.setState({ selectedOpeningId: null, selectedSideWallId: null })
})
