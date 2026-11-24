import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { TECH_CATALOG } from '../catalog/techCatalog'
import { roomClearPolygon } from '../domain/derive'
import { selectApartment } from '../domain/store'
import { signedArea } from '../geometry/polygon'
import { cmToScene, sceneToCm } from '../geometry/units'
import { ROOM_ID, useEditor, useProject } from '../prototype/session'
import { LIGHT } from './lightParams'

/** Реестр 3D-объектов предметов и измеренных размеров моделей (для проверок 4.3). */
export const sceneRegistry = {
  objects: new Map<string, THREE.Object3D>(),
  measured: new Map<string, { widthCm: number; depthCm: number; heightCm: number }>(),
  camera: null as THREE.Camera | null,
  dom: null as HTMLCanvasElement | null,
}

/** Экранные координаты центра предмета (для e2e-проверок). */
export function screenPositionOf(id: string): { x: number; y: number } | null {
  const o = sceneRegistry.objects.get(id)
  if (!o || !sceneRegistry.camera || !sceneRegistry.dom) return null
  const v = o.position.clone().add(new THREE.Vector3(0, 0.25, 0)).project(sceneRegistry.camera)
  const r = sceneRegistry.dom.getBoundingClientRect()
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
}

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/** Модель с началом координат в центре основания; размеры измеряются, а не подгоняются. */
function Model({ catalogItemId, ghost }: { catalogItemId: string; ghost?: 'ok' | 'bad' }) {
  const item = TECH_CATALOG[catalogItemId]
  const gltf = useGLTF(item.modelUrl)
  const { scene, offset } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    sceneRegistryMeasure(catalogItemId, size)
    return { scene: clone, offset: new THREE.Vector3(-center.x, -box.min.y, -center.z) }
  }, [gltf, catalogItemId])

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (ghost) {
        const m = (mesh.material as THREE.MeshStandardMaterial).clone()
        m.transparent = true
        m.opacity = 0.55
        m.emissive = new THREE.Color(ghost === 'ok' ? '#1a7a47' : '#a31d1d')
        m.emissiveIntensity = 0.6
        mesh.material = m
      }
    })
  }, [scene, ghost])

  return <primitive object={scene} position={offset} />
}

function sceneRegistryMeasure(id: string, size: THREE.Vector3) {
  sceneRegistry.measured.set(id, { widthCm: sceneToCm(size.x), depthCm: sceneToCm(size.z), heightCm: sceneToCm(size.y) })
}

function Placeholder({ catalogItemId }: { catalogItemId: string }) {
  const item = TECH_CATALOG[catalogItemId]
  return (
    <mesh position={[0, cmToScene(item.heightCm) / 2, 0]}>
      <boxGeometry args={[cmToScene(item.widthCm), cmToScene(item.heightCm), cmToScene(item.depthCm)]} />
      <meshBasicMaterial color="#ff5d5d" wireframe />
    </mesh>
  )
}

function Furniture({ id }: { id: string }) {
  const f = useProject(selectApartment).furniture[id]
  const draft = useEditor((s) => s.draft)
  const selected = useEditor((s) => s.selectedId === id)
  const begin = useEditor((s) => s.beginDrag)
  const planeHit = usePlaneHit()
  if (!f) return null
  const dragging = draft?.id === id
  return (
    <group
      ref={(g) => { if (g) sceneRegistry.objects.set(id, g); else sceneRegistry.objects.delete(id) }}
      position={[cmToScene(f.xCm), 0, cmToScene(f.zCm)]}
      rotation-y={(f.angleDeg * Math.PI) / 180}
      visible={!dragging}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        const p = planeHit(e.nativeEvent)
        if (p) begin({ id }, p, '3d')
      }}
    >
      <ModelBoundary fallback={<Placeholder catalogItemId={f.catalogItemId} />}>
        <Suspense fallback={null}>
          <Model catalogItemId={f.catalogItemId} />
        </Suspense>
      </ModelBoundary>
      {selected && (
        <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[Math.hypot(cmToScene(TECH_CATALOG[f.catalogItemId].widthCm), cmToScene(TECH_CATALOG[f.catalogItemId].depthCm)) / 2 + 0.03, Math.hypot(cmToScene(TECH_CATALOG[f.catalogItemId].widthCm), cmToScene(TECH_CATALOG[f.catalogItemId].depthCm)) / 2 + 0.06, 48]} />
          <meshBasicMaterial color="#5b9dff" />
        </mesh>
      )}
    </group>
  )
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
      return ray.ray.intersectPlane(plane, out) ? { x: sceneToCm(out.x), z: sceneToCm(out.z) } : null
    }
  }, [camera, gl])
}

function DragController() {
  const planeHit = usePlaneHit()
  const { camera, gl } = useThree()
  useEffect(() => { sceneRegistry.camera = camera; sceneRegistry.dom = gl.domElement }, [camera, gl])
  const active = useEditor((s) => s.draft?.view === '3d')
  const moveDrag = useEditor((s) => s.moveDrag)
  const endDrag = useEditor((s) => s.endDrag)
  useEffect(() => {
    if (!active) return
    const move = (e: PointerEvent) => { const p = planeHit(e); if (p) moveDrag(p, e.altKey) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', endDrag)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', endDrag) }
  }, [active, planeHit, moveDrag, endDrag])
  return null
}

function Ghost() {
  const draft = useEditor((s) => s.draft)
  if (!draft) return null
  return (
    <group position={[cmToScene(draft.xCm), 0, cmToScene(draft.zCm)]} rotation-y={(draft.angleDeg * Math.PI) / 180}>
      <ModelBoundary fallback={<Placeholder catalogItemId={draft.catalogItemId} />}>
        <Suspense fallback={null}>
          <Model catalogItemId={draft.catalogItemId} ghost={draft.result.valid ? 'ok' : 'bad'} />
        </Suspense>
      </ModelBoundary>
    </group>
  )
}

/** Пол и внутренние поверхности стен из чистового контура: снаружи они отбрасываются (back-face). */
function RoomShell() {
  const apt = useProject(selectApartment)
  const { floor, walls } = useMemo(() => {
    const clear = roomClearPolygon(apt, apt.rooms[ROOM_ID])
    const orient = Math.sign(signedArea(clear)) || 1
    const h = cmToScene(apt.ceilingHeightCm)
    const floorShape = new THREE.Shape(clear.map((p) => new THREE.Vector2(cmToScene(p.x), cmToScene(p.z))))
    const floorGeo = new THREE.ShapeGeometry(floorShape)
    floorGeo.rotateX(Math.PI / 2) // (x, z) -> плоскость XZ, нормаль вверх
    const wallGeos = clear.map((a, i) => {
      const b = clear[(i + 1) % clear.length]
      const A = [cmToScene(a.x), 0, cmToScene(a.z)]
      const B = [cmToScene(b.x), 0, cmToScene(b.z)]
      const quad = orient > 0
        ? [A, B, [B[0], h, B[2]], A, [B[0], h, B[2]], [A[0], h, A[2]]]
        : [A, [B[0], h, B[2]], B, A, [A[0], h, A[2]], [B[0], h, B[2]]]
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(quad.flat(), 3))
      g.computeVertexNormals()
      return g
    })
    return { floor: floorGeo, walls: wallGeos }
  }, [apt])
  const noRay = () => null
  return (
    <>
      <mesh geometry={floor} receiveShadow raycast={noRay}>
        <meshStandardMaterial color="#8a8f9c" side={THREE.DoubleSide} />
      </mesh>
      {walls.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow raycast={noRay}>
          <meshStandardMaterial color="#d8dae0" />
        </mesh>
      ))}
    </>
  )
}

/** Окружение для бликов и мягкого света: процедурная студия three, без загрузки файлов. */
export function StudioEnvironment({ intensity = LIGHT.environmentIntensity }: { intensity?: number }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = new RoomEnvironment()
    const tex = pmrem.fromScene(env, 0.04).texture
    scene.environment = tex
    return () => { scene.environment = null; tex.dispose(); pmrem.dispose(); env.dispose() }
  }, [gl, scene])
  // Сила окружения меняется по времени суток без пересоздания карты.
  useEffect(() => { scene.environmentIntensity = intensity }, [scene, intensity])
  return null
}

export function RoomScene() {
  const ids = Object.keys(useProject(selectApartment).furniture)
  const dragging = useEditor((s) => s.draft !== null)
  return (
    <Canvas shadows camera={{ position: [2.1, 5.6, 8.2], fov: 45 }} gl={{ preserveDrawingBuffer: true, antialias: true }} data-testid="scene3d">
      <color attach="background" args={['#0f1117']} />
      <hemisphereLight args={['#ffffff', '#6b6f7a', 0.9]} />
      <directionalLight position={[3, 6, 2]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} />
      <StudioEnvironment />
      <RoomShell />
      {ids.map((id) => <Furniture key={id} id={id} />)}
      <Ghost />
      <DragController />
      <OrbitControls target={[2.1, 0.3, 1.75]} enabled={!dragging} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  )
}

export { ROOM_ID }
