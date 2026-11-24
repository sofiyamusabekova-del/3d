import * as THREE from 'three'
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer'
import { LIGHT } from '../scene3d/lightParams'
import { verifyTraceScene, type ShotSnapshot } from './snapshot'

/**
 * «Качественный снимок» (SPEC §13, D-09): браузерный path tracing той же сцены с той же камеры.
 * Сцена трассировки строится из 3D-сцены редактора (общая геометрия и положения), без служебных
 * объектов и подсветки выбора, и проверяется на соответствие снимку проекта (snapshot.ts).
 */

const POINT_LIGHT_TRACE_SCALE = 4 * Math.PI

/** Служебные меши редактора, которых нет в изображении: области нажатия, черновик переноса, индикаторы загрузки. */
const isHelper = (m: THREE.Mesh) => m.name === 'draft' || m.name.startsWith('hole-') || m.name === 'model-loading' || m.name === 'model-error'

const isGlass = (m: THREE.Material) => m.transparent && m.opacity < 1

/** Материал для трассировки: копия без подсветки выбора, двусторонний; стекло — физическое пропускание света. */
function traceMaterial(src: THREE.Material, cache: Map<THREE.Material, THREE.Material>): THREE.Material | null {
  const hit = cache.get(src)
  if (hit) return hit
  if (!(src as THREE.MeshStandardMaterial).isMeshStandardMaterial) return null
  const s = src as THREE.MeshStandardMaterial
  let out: THREE.Material
  if (isGlass(s)) {
    out = new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.03, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.02, side: THREE.DoubleSide })
  } else {
    const c = s.clone() as THREE.MeshStandardMaterial
    c.emissive.set('#000000')
    c.emissiveIntensity = 0
    c.side = THREE.DoubleSide
    out = c
  }
  cache.set(src, out)
  return out
}

/**
 * Модели каталога сжаты с квантованием (этап 28): вершины и нормали лежат нормализованными целыми.
 * Трассировщик копирует массивы как есть и читает их как числа с плавающей точкой, поэтому в сцену трассировки
 * геометрия передаётся копией с обычными Float32 (кэш на время сцены; исходная геометрия редактора не меняется).
 */
function floatGeometry(g: THREE.BufferGeometry, cache: Map<THREE.BufferGeometry, THREE.BufferGeometry>): THREE.BufferGeometry {
  const hit = cache.get(g)
  if (hit) return hit
  const names = Object.keys(g.attributes)
  const plain = names.every((n) => {
    const a = g.attributes[n] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute
    return !('isInterleavedBufferAttribute' in a) && a.array instanceof Float32Array && !a.normalized
  })
  if (plain) { cache.set(g, g); return g }
  const out = new THREE.BufferGeometry()
  for (const n of names) {
    const a = g.attributes[n] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute
    const arr = new Float32Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) {
      arr[i * a.itemSize] = a.getX(i)
      if (a.itemSize > 1) arr[i * a.itemSize + 1] = a.getY(i)
      if (a.itemSize > 2) arr[i * a.itemSize + 2] = a.getZ(i)
      if (a.itemSize > 3) arr[i * a.itemSize + 3] = a.getW(i)
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize))
  }
  if (g.index) out.setIndex(g.index.clone())
  for (const grp of g.groups) out.addGroup(grp.start, grp.count, grp.materialIndex)
  out.computeBoundingSphere()
  cache.set(g, out)
  return out
}

export interface TraceScene {
  scene: THREE.Scene
  dispose: () => void
}

/** Сцена трассировки из сцены редактора; собственный свет и небо трассировки (SPEC §13). */
export function buildTraceScene(source: THREE.Scene): TraceScene {
  const scene = new THREE.Scene()
  source.updateMatrixWorld(true)
  const cache = new Map<THREE.Material, THREE.Material>()
  const geoCache = new Map<THREE.BufferGeometry, THREE.BufferGeometry>()
  const groups = new Map<THREE.Object3D, THREE.Group>()
  const place = (node: THREE.Object3D, matrixWorld: THREE.Matrix4) => matrixWorld.decompose(node.position, node.quaternion, node.scale)

  source.traverseVisible((o) => {
    if (!o.name.startsWith('furniture-')) return
    const g = new THREE.Group()
    g.name = o.name
    place(g, o.matrixWorld)
    scene.add(g)
    groups.set(o, g)
  })

  // Внешний мир (дома, деревья, холмы) нарисован экземплярами: в сцену трассировки их копии кладутся по одной.
  const extra: THREE.Material[] = []
  source.traverseVisible((o) => {
    const inst = o as THREE.InstancedMesh
    if (!inst.isInstancedMesh || isHelper(inst)) return
    const base = traceMaterial(inst.material as THREE.Material, cache) as THREE.MeshStandardMaterial | null
    if (!base) return
    const byColor = new Map<string, THREE.Material>()
    const m = new THREE.Matrix4(), c = new THREE.Color()
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m)
      let mat: THREE.Material = base
      if (inst.instanceColor) {
        inst.getColorAt(i, c)
        const key = c.getHexString()
        let hit = byColor.get(key)
        if (!hit) { const cl = base.clone(); cl.color.copy(base.color).multiply(c); extra.push(cl); byColor.set(key, cl); hit = cl }
        mat = hit
      }
      const copy = new THREE.Mesh(floatGeometry(inst.geometry, geoCache), mat)
      copy.name = `${inst.name || 'instance'}-${i}`
      place(copy, new THREE.Matrix4().multiplyMatrices(inst.matrixWorld, m))
      scene.add(copy)
    }
  })

  source.traverseVisible((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || isHelper(mesh) || (mesh as THREE.InstancedMesh).isInstancedMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const converted = mats.map((m) => traceMaterial(m, cache))
    if (converted.some((m) => !m)) return // служебные материалы (basic): в изображение не входят
    const copy = new THREE.Mesh(floatGeometry(mesh.geometry, geoCache), Array.isArray(mesh.material) ? (converted as THREE.Material[]) : (converted[0] as THREE.Material))
    copy.name = mesh.name
    let owner: THREE.Object3D | null = mesh.parent
    while (owner && !groups.has(owner)) owner = owner.parent
    if (owner) {
      place(copy, new THREE.Matrix4().copy(owner.matrixWorld).invert().multiply(mesh.matrixWorld))
      groups.get(owner)!.add(copy)
    } else {
      place(copy, mesh.matrixWorld)
      scene.add(copy)
    }
  })

  // Собственный свет: то же направление и цвет солнца, что в редакторе, и градиентное небо.
  const srcSun = source.getObjectByName('sun') as THREE.DirectionalLight | undefined
  // Время суток из сцены редактора (Lighting.tsx): цвет и сила света, небо.
  const dl = source.userData.daylight as { skyTop: string; skyHorizon: string; intensityScale: number; environmentIntensity: number } | undefined
  const sun = new THREE.DirectionalLight(srcSun ? srcSun.color : new THREE.Color(LIGHT.sunColor), LIGHT.trace.sunIntensity * (dl?.intensityScale ?? 1))
  if (srcSun) {
    srcSun.getWorldPosition(sun.position)
    srcSun.target.getWorldPosition(sun.target.position)
  } else {
    sun.position.copy(LIGHT.sunDirection).multiplyScalar(10)
  }
  sun.castShadow = true
  scene.add(sun, sun.target)

  // Искусственный свет (этап 21): те же точечные источники, что в редакторе. Шарики свечения в трассировку не входят:
  // непрозрачный шар вокруг источника закрыл бы его лучи (на полу получались кольца), а сам по себе излучающий шар при
  // 16 выборках почти не освещает комнату. Лампа в кадре видна своей моделью.
  const pos = new THREE.Vector3()
  source.traverseVisible((o) => {
    const pl = o as THREE.PointLight
    if (!pl.isPointLight || !(pl.intensity > 0)) return
    // Трассировщик считает силу точечного света в других единицах: множитель 4π (как лампа в люменах) подобран по снимкам этапа 21.
    const copy = new THREE.PointLight(pl.color, pl.intensity * POINT_LIGHT_TRACE_SCALE, 0, 2)
    pl.getWorldPosition(pos)
    copy.position.copy(pos)
    copy.castShadow = true
    scene.add(copy)
  })

  const sky = new GradientEquirectTexture(64)
  sky.topColor.set(dl?.skyTop ?? LIGHT.trace.skyTop)
  sky.bottomColor.set(dl?.skyHorizon ?? LIGHT.trace.skyHorizon)
  sky.update()
  // Небо часа видно в окнах и освещает комнату; ночью оно тёмное, поэтому сила окружения следует за временем суток.
  scene.background = dl ? sky : new THREE.Color(LIGHT.background)
  scene.environment = sky
  scene.environmentIntensity = LIGHT.trace.skyIntensity * (dl ? dl.environmentIntensity / LIGHT.environmentIntensity : 1)

  return {
    scene,
    dispose: () => {
      for (const m of cache.values()) m.dispose()
      for (const m of extra) m.dispose()
      for (const [src, copy] of geoCache) if (copy !== src) copy.dispose()
      sky.dispose()
    },
  }
}

export class ShotCancelled extends Error {
  constructor() { super('Снимок отменён'); this.name = 'ShotCancelled' }
}

/** compiling — видеокарта ещё компилирует шейдер трассировки (только при первом снимке или после смены сцены), выборки не идут. */
export interface ShotProgress { phase: 'prepare' | 'trace'; samples: number; targetSamples: number; elapsedMs: number; compiling?: boolean }

export interface ShotRun {
  source: THREE.Scene
  snapshot: ShotSnapshot
  targetSamples: number
  signal: AbortSignal
  /** 2D-холст, на который выводится накопленное изображение. */
  view: HTMLCanvasElement
  onProgress: (p: ShotProgress) => void
}

/** elapsedMs — вся трассировка, включая compileMs (ожидание компиляции шейдера). */
export interface ShotDone { samples: number; elapsedMs: number; prepareMs: number; compileMs: number }

interface Engine { canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer; tracer: WebGLPathTracer }
/** Рендерер трассировки живёт между съёмками: шейдер компилируется один раз, а не при каждом запуске. */
let engine: Engine | null = null

function acquireEngine(width: number, height: number): Engine {
  if (!engine) {
    const canvas = document.createElement('canvas')
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false })
    } catch {
      throw new Error('Не удалось создать контекст WebGL для трассировки: проверьте поддержку графики в браузере')
    }
    if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) {
      renderer.dispose()
      renderer.forceContextLoss()
      throw new Error('Видеокарта или браузер не поддерживают вычисления с плавающей точкой (EXT_color_buffer_float), нужные для трассировки')
    }
    renderer.setPixelRatio(1)
    renderer.toneMapping = LIGHT.toneMapping
    renderer.toneMappingExposure = LIGHT.toneMappingExposure
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const tracer = new WebGLPathTracer(renderer)
    tracer.tiles.set(2, 2)
    tracer.bounces = LIGHT.trace.bounces
    tracer.transmissiveBounces = LIGHT.trace.transmissiveBounces
    tracer.filterGlossyFactor = LIGHT.trace.filterGlossyFactor
    tracer.renderDelay = 0
    tracer.minSamples = 1
    tracer.fadeDuration = 0
    tracer.rasterizeScene = false
    tracer.dynamicLowRes = false
    engine = { canvas, renderer, tracer }
  }
  engine.renderer.setSize(width, height, false)
  return engine
}

/** Освобождает видеопамять трассировки: при ошибке и при выходе из шага «Интерьер». */
export function releaseQualityEngine() {
  if (!engine) return
  engine.tracer.dispose()
  engine.renderer.dispose()
  engine.renderer.forceContextLoss()
  engine = null
}

const frame = () => new Promise<void>((resolve) => { const t = setTimeout(resolve, 100); requestAnimationFrame(() => { clearTimeout(t); resolve() }) })

/**
 * Выполняет трассировку: отдельный рендерер и холст (редактор не затрагивается), накопление выборок
 * кадр за кадром, отмена в любой момент. Любая ошибка или отмена освобождает видеопамять.
 */
export async function runQualityShot(run: ShotRun): Promise<ShotDone> {
  const { snapshot, signal, view } = run
  const t0 = performance.now()
  const stop = () => { if (signal.aborted) throw new ShotCancelled() }
  run.onProgress({ phase: 'prepare', samples: 0, targetSamples: run.targetSamples, elapsedMs: 0 })
  await frame()
  stop()

  const trace = buildTraceScene(run.source)
  let failed = true
  try {
    const { renderer, tracer, canvas } = acquireEngine(snapshot.width, snapshot.height)
    const problems = verifyTraceScene(trace.scene, snapshot)
    if (problems.length > 0) throw new Error(`Снимок не совпадает с проектом: ${problems.slice(0, 3).join('; ')}`)
    void renderer

    const cam = new THREE.PerspectiveCamera(snapshot.camera.fov, snapshot.width / snapshot.height, snapshot.camera.near, snapshot.camera.far)
    cam.position.set(...snapshot.camera.position)
    cam.quaternion.set(...snapshot.camera.quaternion)
    cam.updateMatrixWorld(true)
    tracer.setScene(trace.scene, cam)
    const prepareMs = performance.now() - t0

    const ctx = view.getContext('2d')
    if (!ctx) throw new Error('Не удалось открыть холст для изображения')
    view.width = snapshot.width
    view.height = snapshot.height
    const tStart = performance.now()
    let samples = 0
    let compileMs = 0
    while (samples < run.targetSamples) {
      stop()
      const compiling = (tracer as unknown as { isCompiling: boolean }).isCompiling // есть в 0.0.28, но нет в типах
      const tf = performance.now()
      tracer.renderSample()
      samples = Math.floor(tracer.samples)
      ctx.drawImage(canvas, 0, 0)
      run.onProgress({ phase: 'trace', samples, targetSamples: run.targetSamples, elapsedMs: performance.now() - tStart, compiling })
      await frame()
      if (compiling) compileMs += performance.now() - tf
    }
    ctx.drawImage(canvas, 0, 0)
    failed = false
    return { samples, elapsedMs: performance.now() - tStart, prepareMs, compileMs }
  } catch (e) {
    failed = !(e instanceof ShotCancelled) // отмена оставляет готовый к работе рендерер; ошибка освобождает его
    throw e
  } finally {
    trace.dispose()
    if (failed) releaseQualityEngine()
  }
}
