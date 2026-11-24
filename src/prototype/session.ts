import { TECH_CATALOG } from '../catalog/techCatalog'
import { validateFurniturePlacement } from '../domain/placement'
import { createProjectStore } from '../domain/store'
import { techRoomApartment } from '../domain/techRoom'
import { createEditor } from './editor'

export { GRID_CM, type Draft } from './editor'

/** Единственное состояние проекта технической сцены: из него строятся и план, и 3D. */
export const useProject = createProjectStore(techRoomApartment(), validateFurniturePlacement(TECH_CATALOG))

export const ROOM_ID = 'room'

export const useEditor = createEditor({
  project: useProject,
  catalog: TECH_CATALOG,
  roomId: () => ROOM_ID,
  idPrefix: 'f',
  spot: () => ({ minX: 60, maxX: 360, minZ: 60, maxZ: 300 }),
})
