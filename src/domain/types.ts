/**
 * Модель квартиры (SPEC §6). Все линейные величины в сантиметрах, поля с суффиксом Cm.
 * Площади, контуры и поверхности не хранятся: они выводятся из геометрии (derive.ts).
 */

export type Id = string

export interface Vertex {
  id: Id
  xCm: number
  zCm: number
}

/** Стена задана осью между двумя вершинами. Общая перегородка — одна сущность. */
export interface Wall {
  id: Id
  startVertexId: Id
  endVertexId: Id
  thicknessCm: number
}

/** Ссылка комнаты на стену; reversed — комната обходит стену от конца к началу. */
export interface BoundaryRef {
  wallId: Id
  reversed: boolean
}

export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'kitchenLiving'
  | 'bathroom'
  | 'toilet'
  | 'combinedBathroom'
  | 'hallway'

/** Граница обходится против часовой стрелки (положительная площадь в осях x, z). */
export interface Room {
  id: Id
  type: RoomType
  name: string
  boundary: BoundaryRef[]
}

export type OpeningKind = 'door' | 'window'

export interface Opening {
  id: Id
  kind: OpeningKind
  wallId: Id
  /** Отступ от начала оси стены до ближнего края проёма. */
  offsetCm: number
  widthCm: number
  heightCm: number
  /** Высота подоконника; у двери 0. */
  sillCm: number
  /** Только для двери: сторона петель и комната, в которую открывается створка. */
  hinge?: 'start' | 'end'
  swingRoomId?: Id
}

export type MaterialKind = 'paint' | 'wallpaper'

export interface MaterialDefinition {
  id: Id
  kind: MaterialKind
  name: string
  colorHex?: string
  textureUrl?: string
  /** Маленькая миниатюра (WebP 96 px) для списков: полную текстуру ради образца не грузим. */
  thumbUrl?: string
  /** Карта нормалей (OpenGL), если есть. */
  normalUrl?: string
  /** Цвет образца для плана и списков: у обоев средний цвет рисунка. */
  swatchHex?: string
  /** Физический размер одного повтора текстуры (SPEC §13). */
  tileSizeCm?: { widthCm: number; heightCm: number }
  /** Источник и лицензия текстуры (docs/ASSETS.md). */
  source?: { url: string; author: string; license: string; retrievedAt: string }
}

export type FloorKind = 'laminate' | 'linoleum' | 'carpet'

/** Покрытие пола комнаты (D-16): входит в проект и историю. */
export interface FloorCovering {
  kind: FloorKind
  colorId: string
}

export type MountType = 'floor' | 'wall' | 'ceiling' | 'surface'
export type CatalogLayer = 'item' | 'floorCovering'

/** Упрощённый объём для проверки размещения, в локальных осях предмета. */
export interface ColliderBox {
  xCm: number
  zCm: number
  widthCm: number
  depthCm: number
  yMinCm: number
  yMaxCm: number
}

/** Источник света предмета (светильник, люстра): точечный свет в локальных осях предмета (центр основания). */
export interface LightSpec {
  /** Положение источника относительно предмета, см (y — от основания предмета). */
  offsetCm: { x: number; y: number; z: number }
  colorHex: string
  /** Сила света, кд (в единицах three.js для PointLight). */
  intensityCd: number
  /** Радиус видимого свечения лампы, см. */
  glowRadiusCm: number
  /** Люстра: заменяет потолочный светильник комнаты (SPEC D-14). */
  chandelier?: boolean
}

export interface CatalogItem {
  id: Id
  /** Версия ассета: обновление каталога не меняет сохранённый проект незаметно. */
  version: string
  name: string
  category: string
  roomTypes: RoomType[]
  widthCm: number
  depthCm: number
  heightCm: number
  mount: MountType
  /** Высота установки по умолчанию для настенных предметов (бра), см над полом. */
  mountHeightCm?: number
  /** Источник света; у предметов без света поля нет. */
  light?: LightSpec
  layer: CatalogLayer
  modelUrl: string
  previewUrl: string
  colliders: ColliderBox[]
  materialIds: Id[]
  license: {
    source: string
    author: string
    license: string
    attribution: string
    retrievedAt: string
  }
}

export interface FurnitureInstance {
  id: Id
  catalogItemId: Id
  assetVersion: string
  roomId: Id
  xCm: number
  zCm: number
  /** Высота установки над полом для настенных и потолочных предметов. */
  elevationCm: number
  /** Поворот вокруг вертикальной оси, градусы. */
  angleDeg: number
  variantId?: string
}

/** Ключ стороны стены: пара «стена + комната». Обе стороны перегородки независимы. */
export type SurfaceKey = `${Id}|${Id}`
export const surfaceKey = (wallId: Id, roomId: Id): SurfaceKey => `${wallId}|${roomId}`

/** Заметка на плане («здесь розетка»): точка в комнате и текст. Этап 6 доработок, SPEC D-35. */
export interface PlanNote {
  id: Id
  roomId: Id
  xCm: number
  zCm: number
  text: string
}

/** Сохранённый вариант расстановки: снимок всей мебели квартиры. Этап 7 доработок, SPEC D-36. */
export interface FurnitureLayout {
  id: Id
  name: string
  furniture: Record<Id, FurnitureInstance>
}

export interface Apartment {
  id: Id
  schemaVersion: number
  /** Заметки на плане; в старых проектах нет. */
  notes?: Record<Id, PlanNote>
  /** Варианты расстановки; в старых проектах нет. */
  layouts?: Record<Id, FurnitureLayout>
  /** Одна высота потолка на всю квартиру (FR-26). */
  ceilingHeightCm: number
  vertices: Record<Id, Vertex>
  walls: Record<Id, Wall>
  rooms: Record<Id, Room>
  openings: Record<Id, Opening>
  furniture: Record<Id, FurnitureInstance>
  /** SurfaceKey -> MaterialDefinition.id */
  surfaceMaterials: Record<SurfaceKey, Id>
  /** roomId -> покрытие пола */
  floorCoverings: Record<Id, FloorCovering>
}

/**
 * Состояние редактора: не часть проекта и не попадает в историю отмены.
 * Определено здесь как контракт; хранилище появится вместе с интерфейсом.
 */
export interface EditorState {
  stage: 'params' | 'schemes' | 'setup' | 'interior' | 'render'
  activeRoomId: Id | null
  selection: { kind: 'wall' | 'opening' | 'furniture'; id: Id } | null
  camera: { position: [number, number, number]; target: [number, number, number] }
}

export interface Issue {
  code: string
  /** Конкретная причина на русском с названием объекта. */
  message: string
  objectId?: Id
}
