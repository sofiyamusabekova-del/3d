import { Component, Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { DEFAULT_WALL_HEX, MATERIALS } from '../catalog/materials'
import { CATALOG } from '../catalog/catalog'
import { selectApartment } from '../domain/store'
import { surfaceKey, type Apartment, type FloorCovering, type Id, type MaterialDefinition } from '../domain/types'
import { cmToScene } from '../geometry/units'
import { useApartmentProject } from '../scenario/flow'
import { useInterior } from '../scenario/interior'
import { useInteriorEditor } from '../scenario/interiorEditor'
import { roomClearPolygon } from '../domain/derive'
import { elevationOf } from '../domain/placement'
import { FLOORS } from '../catalog/floors'
import { floorTexture } from './floorTexture'
import { EYE_HEIGHT_CM, RUN_FACTOR, WALK_SPEED_CM_S, forwardOf, rightOf, roomAt, startPosition, stepWalk, walkObstacles } from '../domain/walk'
import { MAX_ACTIVE_LIGHTS, nearestLights, roomLights } from './roomLights'
import { walkState } from './walkState'
import { FurnitureModel } from './FurnitureModel'
import { StudioEnvironment } from './RoomScene'
import { Lighting } from './Lighting'
import { daylightAt } from './daylight'
import { LIGHT } from './lightParams'
import { STENCIL_ORDER, World, WindowStencilMaterial } from './World'
import { initialView, isFaceHidden, roomCenter, roomFaces, type Hole, type WallFace } from './roomGeometry'

/** Доступ тестов и отладки к состоянию отрисовки (память GPU, число скрытых стен). */
export const interiorProbe = {
  gl: null as THREE.WebGLRenderer | null,
  scene: null as THREE.Scene | null,
  camera: null as THREE.Camera | null,
  hiddenWalls: [] as string[],
  visibleHoles: [] as string[],
}

type V3 = [number, number, number]

/** Точка на поверхности стены: s вдоль стены, y высота, depth вглубь стены (см) → единицы сцены. */
function at(face: WallFace, s: number, y: number, depth = 0): V3 {
  return [
    cmToScene(face.a.x + face.dir.x * s - face.nIn.x * depth),
    cmToScene(y),
    cmToScene(face.a.z + face.dir.z * s - face.nIn.z * depth),
  ]
}

/** Добавляет четырёхугольник A,B,C,D, обращённый лицом в сторону desired (обратная сторона отбрасывается). */
function pushQuad(out: number[], A: V3, B: V3, C: V3, D: V3, desired: V3, uvOut?: number[], uv?: [number, number][]) {
  const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
  const ad = [D[0] - A[0], D[1] - A[1], D[2] - A[2]]
  const n = [ab[1] * ad[2] - ab[2] * ad[1], ab[2] * ad[0] - ab[0] * ad[2], ab[0] * ad[1] - ab[1] * ad[0]]
  const flip = n[0] * desired[0] + n[1] * desired[1] + n[2] * desired[2] < 0
  const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
  const pts = [A, B, C, D]
  for (const i of order) {
    out.push(...pts[i])
    if (uvOut && uv) uvOut.push(...uv[i])
  }
}

function toGeometry(positions: number[], uvs?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.computeVertexNormals()
  return g
}

/**
 * Стена с настоящими отверстиями: куски вокруг проёмов (с координатами текстуры в сантиметрах:
 * u — вдоль стороны комнаты от её начала, v — высота) и отдельно откосы глубиной в половину толщины стены.
 */
function wallGeometry(face: WallFace): { panels: THREE.BufferGeometry; reveals: THREE.BufferGeometry } {
  const pos: number[] = []
  const uvs: number[] = []
  const rev: number[] = []
  const inward: V3 = [face.nIn.x, 0, face.nIn.z]
  const along: V3 = [face.dir.x, 0, face.dir.z]
  const back: V3 = [-face.dir.x, 0, -face.dir.z]
  for (const p of face.panels) {
    const u0 = face.sideStartCm + p.s0, u1 = face.sideStartCm + p.s1
    pushQuad(pos, at(face, p.s0, p.y0), at(face, p.s1, p.y0), at(face, p.s1, p.y1), at(face, p.s0, p.y1), inward, uvs, [[u0, p.y0], [u1, p.y0], [u1, p.y1], [u0, p.y1]])
  }
  const d = face.thicknessCm / 2
  for (const h of face.holes) {
    pushQuad(rev, at(face, h.s0, h.y0), at(face, h.s0, h.y0, d), at(face, h.s0, h.y1, d), at(face, h.s0, h.y1), along)
    pushQuad(rev, at(face, h.s1, h.y0), at(face, h.s1, h.y0, d), at(face, h.s1, h.y1, d), at(face, h.s1, h.y1), back)
    pushQuad(rev, at(face, h.s0, h.y1), at(face, h.s1, h.y1), at(face, h.s1, h.y1, d), at(face, h.s0, h.y1, d), [0, -1, 0])
    if (h.y0 > 0) pushQuad(rev, at(face, h.s0, h.y0), at(face, h.s1, h.y0), at(face, h.s1, h.y0, d), at(face, h.s0, h.y0, d), [0, 1, 0])
  }
  return { panels: toGeometry(pos, uvs), reveals: toGeometry(rev) }
}

/** Настраивает текстуру отделки: повтор из физического размера образца в см (SPEC §13). */
function configureTexture(t: THREE.Texture, tile: { widthCm: number; heightCm: number }, srgb: boolean) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / tile.widthCm, 1 / tile.heightCm) // координаты u, v заданы в см
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
}

const HIGHLIGHT = { color: '#2a62d9', intensity: 0.28 }

/** Ошибка загрузки текстуры обоев (задача 18.1): сторона красится цветом образца, остальная сцена работает. */
class TextureBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.warn('Текстура обоев не загрузилась, показан цвет образца:', e instanceof Error ? e.message : e) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/** Материал одной стороны стены: краска, обои или стена без отделки; выбранная сторона слегка подсвечена. */
function FaceMaterial({ materialId, selected }: { materialId: string | null; selected: boolean }) {
  const m = materialId ? MATERIALS[materialId] : undefined
  const emissive = selected ? HIGHLIGHT.color : '#000000'
  const emissiveIntensity = selected ? HIGHLIGHT.intensity : 0
  if (m?.kind === 'wallpaper' && m.textureUrl && m.tileSizeCm) {
    const swatch = (name: string) => <meshStandardMaterial name={name} color={m.swatchHex ?? DEFAULT_WALL_HEX} roughness={0.9} emissive={emissive} emissiveIntensity={emissiveIntensity} />
    return (
      <TextureBoundary key={m.id} fallback={swatch('wallpaper-error')}>
        <Suspense fallback={swatch('wallpaper-loading')}>
          <WallpaperMaterial material={m} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </Suspense>
      </TextureBoundary>
    )
  }
  return <meshStandardMaterial color={m?.colorHex ?? DEFAULT_WALL_HEX} roughness={0.92} emissive={emissive} emissiveIntensity={emissiveIntensity} />
}

function WallpaperMaterial({ material, emissive, emissiveIntensity }: { material: MaterialDefinition; emissive: string; emissiveIntensity: number }) {
  const urls = [material.textureUrl!, ...(material.normalUrl ? [material.normalUrl] : [])]
  const textures = useTexture(urls)
  const [map, normalMap] = Array.isArray(textures) ? textures : [textures]
  useMemo(() => {
    configureTexture(map, material.tileSizeCm!, true)
    if (normalMap) configureTexture(normalMap, material.tileSizeCm!, false)
  }, [map, normalMap, material])
  return <meshStandardMaterial map={map} normalMap={normalMap} roughness={0.95} emissive={emissive} emissiveIntensity={emissiveIntensity} />
}

function holePlaneGeometry(face: WallFace, h: Hole, depth: number): THREE.BufferGeometry {
  const pos: number[] = []
  pushQuad(pos, at(face, h.s0, h.y0, depth), at(face, h.s1, h.y0, depth), at(face, h.s1, h.y1, depth), at(face, h.s0, h.y1, depth), [face.nIn.x, 0, face.nIn.z])
  return toGeometry(pos)
}

function floorGeometry(points: Array<{ x: number; z: number }>): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(cmToScene(p.x), cmToScene(p.z))))
  const g = new THREE.ShapeGeometry(shape)
  g.rotateX(Math.PI / 2) // (x, z) → плоскость XZ
  return g
}

/** Освобождает память видеокарты, когда геометрия заменяется или сцена закрывается (AC-05). */
function useDisposed(geos: THREE.BufferGeometry[]) {
  useEffect(() => () => { for (const g of geos) g.dispose() }, [geos])
}

function HoleArea({ hole, geometry }: { hole: Hole; geometry: THREE.BufferGeometry }) {
  const selected = useInterior((s) => s.selectedOpeningId === hole.openingId)
  const [hover, setHover] = useState(false)
  const select = useInterior((s) => s.select)
  const goThroughDoor = useInterior((s) => s.goThroughDoor)
  const opacity = selected ? 0.4 : hover ? 0.25 : 0
  return (
    <mesh
      geometry={geometry}
      name={`hole-${hole.openingId}`}
      userData={{ openingId: hole.openingId, kind: hole.kind }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 4) return // это было вращение камеры, а не нажатие
        e.stopPropagation()
        if (hole.kind === 'door') goThroughDoor(hole.openingId)
        else select(hole.openingId)
      }}
    >
      <meshBasicMaterial color="#5b9dff" transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Walls({ faces, apt, roomId }: { faces: WallFace[]; apt: Apartment; roomId: Id }) {
  const geos = useMemo(() => faces.map((f) => ({
    ...wallGeometry(f),
    areas: f.holes.map((h) => holePlaneGeometry(f, h, -0.2)),
    glass: f.holes.filter((h) => h.kind === 'window').map((h) => holePlaneGeometry(f, h, f.thicknessCm / 2)),
  })), [faces])
  useDisposed(useMemo(() => geos.flatMap((g) => [g.panels, g.reveals, ...g.areas, ...g.glass]), [geos]))
  const selectedWall = useInterior((s) => s.selectedSideWallId)
  const activeRoomId = useInterior((s) => s.activeRoomId)
  const walking = useInterior((s) => s.walking)
  const selectSide = useInterior((s) => s.selectSide)
  // Выбранная сторона стены относится к активной комнате; в прогулке чужие комнаты не подсвечиваются.
  const selectedSide = selectedWall && roomId === activeRoomId ? faces.find((f) => f.wallId === selectedWall)?.sideIndex : undefined
  const [hiddenState, setHidden] = useState<boolean[]>(() => faces.map(() => false))
  useEffect(() => setHidden(faces.map(() => false)), [faces])
  // Ближние стены скрываются, когда камера смотрит на них снаружи; вместе с откосами и областями нажатия.
  // В прогулке камера внутри квартиры, стены не скрываются.
  useFrame(({ camera }) => {
    if (walking) return
    const next = faces.map((f) => isFaceHidden(f, { x: camera.position.x * 100, z: camera.position.z * 100 }))
    if (next.length === hiddenState.length && next.every((v, i) => v === hiddenState[i])) return
    setHidden(next)
  })
  const hidden = walking ? faces.map(() => false) : hiddenState
  useEffect(() => {
    if (walking) return
    interiorProbe.hiddenWalls = faces.filter((_, i) => hidden[i]).map((f) => f.wallId)
    interiorProbe.visibleHoles = faces.flatMap((f, i) => (hidden[i] ? [] : f.holes.map((h) => h.openingId)))
  }, [faces, hidden, walking])
  return (
    <>
      {faces.map((f, i) => hidden[i] ? (
        // Скрытая стена не рисуется, но по-прежнему бросает тень: иначе свет залил бы комнату через «снятую» стену.
        <mesh key={`${f.wallId}-${i}`} geometry={geos[i].panels} name={`shadow-${f.wallId}`} castShadow raycast={() => null}>
          <meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <group key={`${f.wallId}-${i}`} name={`wall-${f.wallId}`}>
          <mesh
            geometry={geos[i].panels} name={`surface-${f.wallId}`} receiveShadow castShadow
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (e.delta > 4 || walking) return // вращение камеры (или обзор в прогулке), а не выбор
              e.stopPropagation()
              selectSide(f.wallId)
            }}
          >
            <FaceMaterial materialId={apt.surfaceMaterials[surfaceKey(f.wallId, roomId)] ?? null} selected={selectedSide === f.sideIndex} />
          </mesh>
          <mesh geometry={geos[i].reveals} raycast={() => null}>
            <meshStandardMaterial color="#e4e5e9" roughness={0.95} />
          </mesh>
          {geos[i].glass.map((g, k) => (
            <group key={k}>
              {/* Окно отмечает в трафарете пиксели, через которые виден внешний мир (World.tsx). */}
              <mesh geometry={g} renderOrder={STENCIL_ORDER} raycast={() => null} name="window-stencil">
                <WindowStencilMaterial />
              </mesh>
              <mesh geometry={g} raycast={() => null}>
                <meshStandardMaterial color="#c4defa" transparent opacity={0.14} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            </group>
          ))}
          {!walking && f.holes.map((h, k) => <HoleArea key={h.openingId} hole={h} geometry={geos[i].areas[k]} />)}
        </group>
      ))}
    </>
  )
}

function Floor({ roomId, polygon, covering }: { roomId: Id; polygon: Array<{ x: number; z: number }>; covering?: FloorCovering }) {
  const geo = useMemo(() => floorGeometry(polygon), [polygon])
  useDisposed(useMemo(() => [geo], [geo]))
  // Покрытие пола (D-16): процедурная текстура с физическим размером образца; без покрытия — прежний серый пол.
  const tex = useMemo(() => (covering ? floorTexture(covering.kind, covering.colorId) : null), [covering])
  return (
    <mesh geometry={geo} name={`floor-${roomId}`} receiveShadow raycast={() => null} userData={{ floor: covering ? `${covering.kind}:${covering.colorId}` : null }}>
      <meshStandardMaterial
        key={tex ? 'covered' : 'bare'} color={tex ? '#ffffff' : '#8a8f9c'} map={tex?.map ?? null}
        roughness={tex && covering ? FLOORS[covering.kind].roughness : 1} side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/**
 * Искусственный свет активной комнаты (этап 21): постоянный набор из MAX_ACTIVE_LIGHTS точечных источников (число
 * не меняется, поэтому шейдеры не пересобираются при включении) и видимое свечение ламп. Тени даёт первый источник
 * (потолочный светильник или люстра), остальные без теней: так лампа не затеняется собственным абажуром.
 */
function RoomLights({ apt, roomIds, poolRoomId }: { apt: Apartment; roomIds: Id[]; poolRoomId: Id | null }) {
  const lightsOff = useInterior((s) => s.lightsOff)
  const walking = useInterior((s) => s.walking)
  const setSummary = useInterior((s) => s.setLightSummary)
  // Источники каждой комнаты; свечение видно во всех показанных комнатах, свет в сцене даёт пул одной комнаты.
  const sets = useMemo(() => Object.fromEntries(roomIds.map((id) => [id, roomLights(apt, CATALOG, id, roomCenter(apt, id))])), [apt, roomIds])
  const poolSet = poolRoomId ? sets[poolRoomId] : undefined
  const poolOn = Boolean(poolRoomId && !lightsOff[poolRoomId])
  useEffect(() => {
    if (!walking && poolSet) setSummary({ active: poolOn ? poolSet.active.length : 0, total: poolSet.all.length })
  }, [poolSet, poolOn, walking, setSummary])
  // Прогулка: из источников комнаты игрока светят ближайшие к нему (главный источник первым), пересчёт при смене набора.
  const [nearKey, setNearKey] = useState('')
  useFrame(() => {
    if (!walking || !poolSet) return
    const key = nearestLights(poolSet.all, { x: walkState.x, z: walkState.z }).map((e) => e.key).join('|')
    if (key !== nearKey) setNearKey(key)
  })
  const pool = !poolOn || !poolSet ? [] : walking ? nearestLights(poolSet.all, { x: walkState.x, z: walkState.z }) : poolSet.active
  void nearKey
  return (
    <>
      {Array.from({ length: MAX_ACTIVE_LIGHTS }, (_, i) => {
        const e = pool[i]
        return (
          <pointLight
            key={i} name={`room-light-${i}`} position={e ? [cmToScene(e.xCm), cmToScene(e.yCm), cmToScene(e.zCm)] : [0, -50, 0]}
            color={e?.colorHex ?? '#ffffff'} intensity={e?.intensityCd ?? 0} distance={0} decay={2}
            castShadow={i === 0} shadow-mapSize={[1024, 1024]} shadow-bias={-0.003} shadow-normalBias={0.03} shadow-radius={3}
          />
        )
      })}
      {roomIds.filter((id) => !lightsOff[id]).flatMap((id) => sets[id].active.map((e) => (
        <group key={`${id}-${e.key}`}>
          {/* Видимое свечение лампы; цвет не гасится тональным отображением. */}
          <mesh name="light-glow" position={[cmToScene(e.xCm), cmToScene(e.yCm), cmToScene(e.zCm)]} raycast={() => null} userData={{ intensityCd: e.intensityCd, radiusM: cmToScene(e.glowRadiusCm) }}>
            <sphereGeometry args={[cmToScene(e.glowRadiusCm), 20, 14]} />
            <meshBasicMaterial color={e.colorHex} toneMapped={false} />
          </mesh>
          {e.kind === 'ceiling' && <CeilingFixtureBody e={e} ceilingCm={apt.ceilingHeightCm} />}
        </group>
      )))}
    </>
  )
}

/** Стандартный подвесной светильник: шнур и плафон над свечением. */
function CeilingFixtureBody({ e, ceilingCm }: { e: { xCm: number; yCm: number; zCm: number }; ceilingCm: number }) {
  const cordLen = ceilingCm - e.yCm
  return (
    <group position={[cmToScene(e.xCm), 0, cmToScene(e.zCm)]}>
      <mesh position={[0, cmToScene(e.yCm + cordLen / 2), 0]} raycast={() => null}>
        <cylinderGeometry args={[cmToScene(0.5), cmToScene(0.5), cmToScene(cordLen), 6]} />
        <meshStandardMaterial color="#202226" roughness={0.6} />
      </mesh>
      <mesh position={[0, cmToScene(e.yCm + 5), 0]} raycast={() => null}>
        <cylinderGeometry args={[cmToScene(7), cmToScene(15), cmToScene(10), 24, 1, true]} />
        <meshStandardMaterial color="#f1ede6" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/**
 * Потолок как «тень без картинки»: не виден (камера смотрит сверху) и ничего не закрывает, но не пускает солнце
 * в комнату сверху. Свет попадает внутрь только через окна, поэтому световые пятна на полу идут за солнцем.
 */
function CeilingShadow({ polygon, heightCm, visible = false }: { polygon: Array<{ x: number; z: number }>; heightCm: number; visible?: boolean }) {
  const geo = useMemo(() => floorGeometry(polygon).translate(0, cmToScene(heightCm), 0), [polygon, heightCm])
  useDisposed(useMemo(() => [geo], [geo]))
  // В прогулке потолок виден (снизу), в обычном виде — только тень.
  if (visible) {
    return (
      <mesh geometry={geo} name="ceiling" castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#f3f1ed" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    )
  }
  return (
    <mesh geometry={geo} name="ceiling-shadow" castShadow raycast={() => null}>
      <meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** Мебель активной комнаты: настоящие модели каталога (GLB), начало координат — центр основания. */
function FurnitureModels({ apt, roomId }: { apt: Apartment; roomId: Id }) {
  const items = Object.values(apt.furniture).filter((f) => f.roomId === roomId && CATALOG[f.catalogItemId])
  const walking = useInterior((s) => s.walking)
  const selectedId = useInteriorEditor((s) => s.selectedId)
  const draft = useInteriorEditor((s) => s.draft)
  const begin = useInteriorEditor((s) => s.beginDrag)
  const lift = useInteriorEditor((s) => s.beginLift)
  const planeHit = usePlaneHit()
  const wallHit = useWallHit()
  return (
    <>
      {items.map((f) => (
        <group
          key={f.id} name={`furniture-${f.id}`} visible={draft?.id !== f.id}
          userData={{ furnitureId: f.id }}
          onClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()}
          position={[cmToScene(f.xCm), cmToScene(elevationOf(apt, CATALOG[f.catalogItemId], f)), cmToScene(f.zCm)]}
          rotation-y={(f.angleDeg * Math.PI) / 180}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            if (walking) return // в прогулке мебель не переносится: мышь только поворачивает взгляд
            e.stopPropagation()
            // Shift + перетаскивание настенного предмета меняет высоту подвеса: указатель идёт по вертикальной плоскости стены.
            if (e.nativeEvent.shiftKey && CATALOG[f.catalogItemId].mount === 'wall') {
              const y = wallHit(e.nativeEvent, f)
              if (y !== null) { lift(f.id, y); return }
            }
            const p = planeHit(e.nativeEvent)
            if (p) begin({ id: f.id }, p, '3d')
          }}
        >
          <Spin angleDeg={f.angleDeg}>
            <FurnitureModel item={CATALOG[f.catalogItemId]} selected={f.id === selectedId} />
          </Spin>
        </group>
      ))}
    </>
  )
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Плавный поворот модели, как в The Sims: внешняя группа сразу получает точный угол (по ней сверяются план, проект
 * и проверки), а эта вложенная группа на мгновение доворачивает модель от прежнего угла к новому с затуханием.
 */
function Spin({ angleDeg, children }: { angleDeg: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const prev = useRef(angleDeg)
  const offset = useRef(0)
  if (prev.current !== angleDeg) {
    // Кратчайший путь: от −180° до 180°.
    const d = ((((prev.current - angleDeg) % 360) + 540) % 360) - 180
    offset.current = reduceMotion() ? 0 : offset.current + (d * Math.PI) / 180
    prev.current = angleDeg
  }
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    if (Math.abs(offset.current) < 1e-4) { offset.current = 0; if (g.rotation.y !== 0) g.rotation.y = 0; return }
    offset.current *= Math.exp(-Math.min(dt, 1 / 20) * 14)
    g.rotation.y = offset.current
  })
  return <group ref={ref}>{children}</group>
}

/** Пересечение луча указателя с плоскостью пола, в см. */
function usePlaneHit() {
  const { camera, gl } = useThree()
  return useMemo(() => {
    const ray = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const out = new THREE.Vector3()
    return (e: PointerEvent): { x: number; z: number } | null => {
      const r = gl.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      return ray.ray.intersectPlane(plane, out) ? { x: out.x * 100, z: out.z * 100 } : null
    }
  }, [camera, gl])
}

/** Высота (см над полом), в которой луч указателя пересекает вертикальную плоскость настенного предмета, лицом к комнате. */
function useWallHit() {
  const { camera, gl } = useThree()
  return useMemo(() => {
    const ray = new THREE.Raycaster()
    const out = new THREE.Vector3()
    return (e: PointerEvent, at: { xCm: number; zCm: number; angleDeg: number }): number | null => {
      const r = gl.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const a = (at.angleDeg * Math.PI) / 180
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), new THREE.Vector3(cmToScene(at.xCm), 0, cmToScene(at.zCm)))
      return ray.ray.intersectPlane(plane, out) ? out.y * 100 : null
    }
  }, [camera, gl])
}

/** Перенос, начатый в 3D: указатель переводится в координаты пола; черновик общий с планом. */
function DragController() {
  const planeHit = usePlaneHit()
  const wallHit = useWallHit()
  const view = useInteriorEditor((s) => s.draft?.view)
  const active = view === '3d' || view === 'catalog'
  const moveDrag = useInteriorEditor((s) => s.moveDrag)
  const liftTo = useInteriorEditor((s) => s.liftTo)
  const endDrag = useInteriorEditor((s) => s.endDrag)
  const { gl } = useThree()
  useEffect(() => {
    if (!active) return
    const move = (e: PointerEvent) => {
      const d = useInteriorEditor.getState().draft
      if (d?.mode === 'lift') {
        const y = wallHit(e, d)
        if (y !== null) liftTo(y, e.altKey)
        return
      }
      if (view === 'catalog') {
        // Из каталога: перенос идёт в 3D, пока указатель над сценой.
        const r = gl.domElement.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
      }
      const p = planeHit(e)
      if (p) moveDrag(p, e.altKey)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', endDrag)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', endDrag) }
  }, [active, view, gl, planeHit, wallHit, moveDrag, liftTo, endDrag])
  return null
}

/** Черновик переноса из любого представления: зелёный допустим, красный нет. */
function DraftBox() {
  const draft = useInteriorEditor((s) => s.draft)
  if (!draft) return null
  const c = CATALOG[draft.catalogItemId]
  return (
    <mesh
      name="draft" raycast={() => null}
      position={[cmToScene(draft.xCm), cmToScene((draft.result.elevationCm ?? 0) + c.heightCm / 2), cmToScene(draft.zCm)]} rotation-y={(draft.angleDeg * Math.PI) / 180}
    >
      <boxGeometry args={[cmToScene(c.widthCm), cmToScene(c.heightCm), cmToScene(c.depthCm)]} />
      <meshStandardMaterial color={draft.result.valid ? '#1a7a47' : '#a31d1d'} transparent opacity={0.6} />
    </mesh>
  )
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
const WALK_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])

/**
 * Режим «Прогулка» (этап 24, SPEC D-17): вид от первого лица на высоте глаз 160 см. W A S D и стрелки — ходьба (Shift — быстрее),
 * мышь с зажатой кнопкой — обзор, Esc — выход. Шаг по времени кадра, столкновения со стенами и мебелью (src/domain/walk.ts),
 * внутренние двери проходимы. Проект и активная комната не меняются.
 */
function WalkController({ apt }: { apt: Apartment }) {
  const walking = useInterior((s) => s.walking)
  const activeRoomId = useInterior((s) => s.activeRoomId)
  const setWalkRoom = useInterior((s) => s.setWalkRoom)
  const stopWalk = useInterior((s) => s.stopWalk)
  const { camera, gl } = useThree()
  const obstacles = useMemo(() => walkObstacles(apt, CATALOG), [apt])
  const obstaclesRef = useRef(obstacles)
  obstaclesRef.current = obstacles
  const aptRef = useRef(apt)
  aptRef.current = apt
  const keys = useRef(new Set<string>())

  useEffect(() => {
    if (!walking || !activeRoomId) return
    const persp = camera as THREE.PerspectiveCamera
    const oldFov = persp.fov
    persp.fov = 70
    persp.updateProjectionMatrix()
    camera.rotation.order = 'YXZ'
    const start = startPosition(aptRef.current, activeRoomId, obstaclesRef.current)
    walkState.x = start.x; walkState.z = start.z; walkState.yaw = 0; walkState.pitch = 0
    camera.position.set(cmToScene(start.x), cmToScene(EYE_HEIGHT_CM), cmToScene(start.z))
    camera.rotation.set(0, 0, 0)

    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'Escape') { stopWalk(); e.preventDefault(); return }
      if (WALK_KEYS.has(e.code)) { keys.current.add(e.code); e.preventDefault() }
    }
    const up = (e: KeyboardEvent) => { keys.current.delete(e.code) }
    const clear = () => keys.current.clear()
    let last: { x: number; y: number } | null = null
    const pdown = (e: PointerEvent) => { if (e.button === 0) last = { x: e.clientX, y: e.clientY } }
    const pmove = (e: PointerEvent) => {
      if (!last) return
      walkState.yaw -= (e.clientX - last.x) * 0.0045
      walkState.pitch = Math.max(-1.3, Math.min(1.3, walkState.pitch - (e.clientY - last.y) * 0.0045))
      last = { x: e.clientX, y: e.clientY }
    }
    const pup = () => { last = null }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    gl.domElement.addEventListener('pointerdown', pdown)
    window.addEventListener('pointermove', pmove)
    window.addEventListener('pointerup', pup)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      gl.domElement.removeEventListener('pointerdown', pdown)
      window.removeEventListener('pointermove', pmove)
      window.removeEventListener('pointerup', pup)
      keys.current.clear()
      persp.fov = oldFov
      persp.updateProjectionMatrix()
      camera.rotation.order = 'XYZ'
    }
  }, [walking, activeRoomId, camera, gl, stopWalk])

  useFrame((_, dtRaw) => {
    if (!useInterior.getState().walking) return
    const dt = Math.min(dtRaw, 0.05) // шаг по времени кадра; долгий кадр не даёт прыжка
    const k = keys.current
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    if (fwd !== 0 || side !== 0) {
      const f = forwardOf(walkState.yaw), r = rightOf(walkState.yaw)
      const dx = f.x * fwd + r.x * side, dz = f.z * fwd + r.z * side
      const len = Math.hypot(dx, dz) || 1
      const speed = WALK_SPEED_CM_S * (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_FACTOR : 1) * dt
      const p = stepWalk({ x: walkState.x, z: walkState.z }, { x: (dx / len) * speed, z: (dz / len) * speed }, obstaclesRef.current)
      walkState.x = p.x; walkState.z = p.z
      const room = roomAt(aptRef.current, p)
      if (room) setWalkRoom(room)
    }
    camera.position.set(cmToScene(walkState.x), cmToScene(EYE_HEIGHT_CM), cmToScene(walkState.z))
    camera.rotation.set(walkState.pitch, walkState.yaw, 0)
  })
  return null
}

/** Камера: при смене комнаты встаёт в начальный вид со стороны двери; вращение и приближение — OrbitControls. */
function CameraRig({ roomId, via }: { roomId: Id; via: Id | null }) {
  const { camera, gl, scene } = useThree()
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const walking = useInterior((s) => s.walking)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  useEffect(() => { interiorProbe.gl = gl; interiorProbe.camera = camera; interiorProbe.scene = scene }, [gl, camera, scene])
  useEffect(() => {
    if (walking) return // в прогулке камерой управляет WalkController; при выходе вид комнаты восстанавливается
    const apt = selectApartment(useApartmentProject.getState())
    const v = initialView(apt, roomId, via)
    // В узкой (портретной) области комната иначе не помещается по ширине: камера отодвигается.
    const k = Math.max(1, 1.2 / aspectRef.current)
    const pos = v.position.map((p, i) => v.target[i] + (p - v.target[i]) * k)
    camera.position.set(cmToScene(pos[0]), cmToScene(pos[1]), cmToScene(pos[2]))
    const c = controls.current
    if (c) { c.target.set(cmToScene(v.target[0]), cmToScene(v.target[1]), cmToScene(v.target[2])); c.update() }
  }, [roomId, via, camera, walking])
  const aspectRef = useRef(aspect)
  aspectRef.current = aspect
  // Пока переносится предмет, камера не вращается: управление принадлежит переносу. В прогулке — WalkController.
  const dragging = useInteriorEditor((s) => s.draft !== null)
  return <OrbitControls ref={controls} makeDefault enabled={!dragging && !walking} minDistance={0.8} maxDistance={30} maxPolarAngle={Math.PI / 2.05} />
}

/** 3D активной комнаты: пол, стены с отверстиями, окна и двери, мебель этой комнаты. Соседние комнаты не строятся. */
export function InteriorScene() {
  const apt = useApartmentProject(selectApartment)
  const roomId = useInterior((s) => s.activeRoomId)
  const via = useInterior((s) => s.enteredVia)
  const select = useInterior((s) => s.select)
  const walking = useInterior((s) => s.walking)
  const walkRoomId = useInterior((s) => s.walkRoomId)
  // В обычном виде строится одна комната; в прогулке (D-17) — вся квартира.
  const roomIds = useMemo(() => (walking ? Object.keys(apt.rooms) : roomId && apt.rooms[roomId] ? [roomId] : []), [walking, apt.rooms, roomId])
  const shells = useMemo(() => roomIds.flatMap((id) => { try { return [{ id, geo: roomFaces(apt, id) }] } catch { return [] } }), [apt, roomIds])
  const room = useMemo(() => shells.find((s) => s.id === roomId)?.geo ?? null, [shells, roomId])
  const lightBounds = useMemo(() => {
    const pts = shells.flatMap((s) => s.geo.floor)
    const xs = pts.length ? pts.map((p) => p.x) : [0], zs = pts.length ? pts.map((p) => p.z) : [0]
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  }, [shells])
  const hour = useInterior((s) => s.hour)
  const daylight = useMemo(() => daylightAt(hour), [hour])
  // Мир общий для всей квартиры: центр и размер по контурам всех комнат, чтобы вид из одинаково направленных окон совпадал.
  const worldFrame = useMemo(() => {
    const pts = Object.values(apt.rooms).flatMap((r) => { try { return roomClearPolygon(apt, r) } catch { return [] } })
    if (pts.length === 0) return { center: { x: 0, z: 0 }, radius: 8 }
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z)
    const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs)
    return { center: { x: cmToScene((Math.max(...xs) + Math.min(...xs)) / 2), z: cmToScene((Math.max(...zs) + Math.min(...zs)) / 2) }, radius: cmToScene(Math.hypot(w, d)) / 2 + 6 }
  }, [apt])
  if (!roomId || !room) return null
  return (
    <Canvas
      shadows camera={{ position: [4, 5, 8], fov: 45, near: 0.05, far: 320 }} gl={{ preserveDrawingBuffer: true, antialias: true, stencil: true }}
      data-testid="interior-scene" onPointerMissed={() => { select(null); useInterior.getState().selectSide(null); useInteriorEditor.getState().select(null) }}
    >
      <color attach="background" args={[LIGHT.background]} />
      <Lighting bounds={lightBounds} daylight={daylight} />
      <StudioEnvironment intensity={daylight.environmentIntensity} />
      <World daylight={daylight} center={worldFrame.center} exclusionRadius={worldFrame.radius} />
      <RoomLights apt={apt} roomIds={roomIds} poolRoomId={walking ? walkRoomId : roomId} />
      {shells.map((s) => (
        <group key={s.id} name={`room-shell-${s.id}`}>
          <CeilingShadow polygon={s.geo.floor} heightCm={s.geo.heightCm} visible={walking} />
          <Floor roomId={s.id} polygon={s.geo.floor} covering={apt.floorCoverings[s.id]} />
          <Walls faces={s.geo.faces} apt={apt} roomId={s.id} />
          <FurnitureModels apt={apt} roomId={s.id} />
        </group>
      ))}
      <DraftBox />
      <DragController />
      <WalkController apt={apt} />
      <CameraRig roomId={roomId} via={via} />
    </Canvas>
  )
}
