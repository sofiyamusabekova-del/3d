import { ContactShadows, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { Artwork, Baseboards, Curtain, CurtainRod, Downlights, Kitchen, Plant, WindowUnit } from './startRoomDecor'
import { makeRoomTextures, type RoomTextures } from './startRoomTextures'
import { useInterior } from '../scenario/interior'
import { daylightAt } from '../scene3d/daylight'
import { DAY_PRESET_HOUR, dayAmount, isNightHour, NIGHT_PRESET_HOUR } from '../scene3d/hour'
import { PullCord } from './pullCord'
import { buildSky } from './startSky'

/**
 * Живая 3D-комната главного меню (этап 30): светлая монохромная комната с чёрным столом, белыми стульями, большим окном и
 * подвесным плафоном. Свет считается от часа в общем состоянии useInterior (тот же час, что у ползунка и у редактора):
 * солнце и небо берутся из daylightAt, лампа зажигается по мере ухода дня. Щелчок по плафону и шнур переводят час к
 * дневному (13:00) или ночному (23:00) значению пружиной, ползунок при этом едет вместе со светом.
 * Грузится отдельным куском после показа меню, до этого и без WebGL остаётся картинка SVG.
 */

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

const WIRE = 0.62
const BELL_R = 0.28
const RIM_LOCAL = new THREE.Vector3(0.2, -BELL_R, 0.06) // откуда шнур выходит из плафона (в системе плафона)

interface Rig {
  sun: THREE.DirectionalLight | null
  hemi: THREE.HemisphereLight | null
  spot: THREE.SpotLight | null
  glow: THREE.PointLight | null
  bulb: THREE.MeshBasicMaterial | null
  bellInner: THREE.MeshStandardMaterial | null
  led: THREE.MeshBasicMaterial | null
  lamp: THREE.Group | null
  dome: THREE.Group | null
  wire: THREE.Mesh | null
  scene: THREE.Scene | null
  glass: THREE.MeshStandardMaterial | null
  down: THREE.MeshBasicMaterial | null
}

let areaLib = false

interface Els { path: SVGPathElement | null; bead: HTMLElement | null; grab: HTMLButtonElement | null; hint: HTMLElement | null }

/** Состояние пружины часа: плавный переход света к нужному часу. */
interface HourSpring { x: number; t: number; written: number; from: number; elapsed: number; dur: number }

/** Длительность смены дня и ночи (с): солнце успевает дойти до холмов, луна — подняться. */
const TRANSITION_S = 3.4

function Box({ p, s, color = '#ececec', rough = 0.9, metal = 0, rot, shadow = true, map, bump = 0 }: { p: [number, number, number]; s: [number, number, number]; color?: string; rough?: number; metal?: number; rot?: [number, number, number]; shadow?: boolean; map?: THREE.Texture; bump?: number }) {
  return (
    <mesh position={p} rotation={rot} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} map={map} bumpMap={bump ? map : undefined} bumpScale={bump} />
    </mesh>
  )
}

function Chair({ p, rotY, fabric }: { p: [number, number, number]; rotY: number; fabric: THREE.Texture }) {
  const legs: Array<[number, number]> = [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <RoundedBox args={[0.46, 0.07, 0.44]} radius={0.03} smoothness={3} position={[0, 0.45, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.95} map={fabric} bumpMap={fabric} bumpScale={1.2} />
      </RoundedBox>
      <RoundedBox args={[0.46, 0.34, 0.06]} radius={0.028} smoothness={3} position={[0, 0.69, -0.2]} rotation={[-0.2, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.95} map={fabric} bumpMap={fabric} bumpScale={1.2} />
      </RoundedBox>
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x * 1.15, 0.22, z * 1.15]} rotation={[z > 0 ? 0.07 : -0.07, 0, x > 0 ? -0.07 : 0.07]} castShadow>
          <cylinderGeometry args={[0.008, 0.008, 0.45, 8]} />
          <meshStandardMaterial color="#0c0c0c" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

function Branches() {
  const stems = useMemo(() => [[-0.5, 0.2], [-0.3, -0.1], [-0.12, 0.35], [0.1, -0.25], [0.3, 0.1], [0.5, -0.05], [0.0, 0.0]].map(([a, b]) => ({ a, b })), [])
  return (
    <group position={[0.1, 0.89, -1.8]}>
      {stems.map((s, i) => (
        <mesh key={i} position={[Math.sin(s.a) * 0.13, 0.17, Math.sin(s.b) * 0.1]} rotation={[s.b * 0.5, 0, -s.a * 0.9]}>
          <cylinderGeometry args={[0.002, 0.003, 0.4 + (i % 3) * 0.06, 5]} />
          <meshStandardMaterial color="#303030" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

interface SceneProps { rig: React.MutableRefObject<Rig>; cord: PullCord; els: React.MutableRefObject<Els>; spring: React.MutableRefObject<HourSpring>; toggle: () => void; ready: () => void; interacted: React.MutableRefObject<boolean> }

function Scene({ rig, cord, els, spring, toggle, ready, interacted }: SceneProps) {
  const { gl, scene, camera, size, invalidate } = useThree()
  const r = rig.current
  const bellRef = useRef<THREE.Group>(null)
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const spotRef = useRef<THREE.SpotLight>(null)
  const glowRef = useRef<THREE.PointLight>(null)
  const spotTarget = useMemo(() => new THREE.Object3D(), [])
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), w: new THREE.Vector3(), cam: new THREE.Vector3(), look: new THREE.Vector3(0.4, 1.15, -2.0), base: new THREE.Vector3(-1.5, 1.3, 2.0), par: new THREE.Vector2() }), [])
  const first = useRef(true)
  const reduce = useMemo(() => reduceMotion(), [])
  const tex = useMemo<RoomTextures>(() => makeRoomTextures(), [])
  useEffect(() => () => tex.dispose(), [tex])
  const sky = useMemo(() => buildSky(), [])
  useEffect(() => () => sky.dispose(), [sky])
  const areaRef = useRef<THREE.RectAreaLight>(null)
  const area = useMemo(() => {
    if (!areaLib) { RectAreaLightUniformsLib.init(); areaLib = true }
    return true
  }, [])
  const onGlass = useCallback((m: THREE.MeshStandardMaterial | null) => { rig.current.glass = m }, [rig])
  const onBulb = useCallback((m: THREE.MeshBasicMaterial | null) => { rig.current.down = m }, [rig])
  useEffect(() => { areaRef.current?.lookAt(0, 1.3, -1.9) }, [area])

  // Окружение для отражений: процедурное, без загрузки файлов.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = new RoomEnvironment()
    const tex = pmrem.fromScene(env, 0.04).texture
    scene.environment = tex
    r.scene = scene
    invalidate()
    return () => { scene.environment = null; tex.dispose(); pmrem.dispose() }
  }, [gl, scene, invalidate, r])

  useEffect(() => {
    const el = gl.domElement.parentElement?.parentElement
    if (!el) return
    const move = () => invalidate()
    el.addEventListener('pointermove', move)
    return () => el.removeEventListener('pointermove', move)
  }, [gl, invalidate])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30)
    let keep = false

    // 1. Час: внешнее изменение принимается сразу, переход шнуром и щелчком идёт плавной кривой (солнце уходит, луна всходит).
    const sp = spring.current
    const store = useInterior.getState().hour
    if (Math.abs(store - sp.written) > 1e-6) { sp.x = sp.t = store; sp.dur = 0; sp.written = store }
    if (sp.dur > 0) {
      sp.elapsed += dt
      const p = Math.min(1, sp.elapsed / sp.dur)
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      sp.x = sp.from + (sp.t - sp.from) * e
      if (p >= 1) { sp.x = sp.t; sp.dur = 0 }
      keep = true
    }
    const h = Math.min(24, Math.max(0, sp.x))
    if (Math.abs(h - sp.written) > 1e-4) { sp.written = h; useInterior.setState({ hour: h }) }

    // 2. Свет по часу.
    const hour = sp.x
    const d = daylightAt(hour)
    const day = dayAmount(hour)
    const alt = Math.max(8, Math.min(70, d.sun.altitudeDeg))
    const glow = 1 - smooth(0.04, 0.8, day)
    const sun = sunRef.current, hemi = hemiRef.current, spot = spotRef.current, gl2 = glowRef.current
    if (sun) {
      sun.intensity = 3.6 * smooth(0.02, 0.9, day) * (0.6 + 0.4 * Math.min(1, alt / 45))
      sun.position.set(7, 1.1 + 4 * Math.sin((alt * Math.PI) / 180), -1.8 + (hour - 13) * 0.4)
      sun.target.position.set(0, 0, -1.8)
      sun.target.updateMatrixWorld()
    }
    if (hemi) hemi.intensity = 0.16 + 0.5 * day
    scene.environmentIntensity = 0.1 + 0.4 * day
    if (spot) spot.intensity = 70 * glow
    if (gl2) gl2.intensity = 5 * glow
    const rg = rig.current
    sky.update(hour)
    if (rg.bulb) rg.bulb.color.setRGB(lerp(0.2, 1, glow), lerp(0.19, 0.95, glow), lerp(0.18, 0.86, glow))
    if (rg.bellInner) { rg.bellInner.emissive.setRGB(1, 0.94, 0.84); rg.bellInner.emissiveIntensity = 0.55 * glow }
    if (rg.led) rg.led.color.setRGB(lerp(0.35, 1, glow), lerp(0.35, 0.95, glow), lerp(0.35, 0.85, glow))
    // Мягкий свет неба через всё окно; ночью стекло сильнее отражает комнату.
    const area = areaRef.current
    if (area) area.intensity = 1.8 * smooth(0.05, 0.9, day)
    if (rg.glass) rg.glass.opacity = lerp(0.95, 0.45, day)
    if (rg.down) rg.down.color.setRGB(lerp(0.75, 1.6, glow), lerp(0.75, 1.45, glow), lerp(0.74, 1.2, glow))

    // 3. Камера: лёгкий параллакс от указателя.
    if (!reduce) {
      tmp.par.lerp(state.pointer, 1 - Math.exp(-4 * dt))
      tmp.cam.set(tmp.base.x + tmp.par.x * 0.16, tmp.base.y + tmp.par.y * 0.05, tmp.base.z)
      if (tmp.cam.distanceTo(camera.position) > 1e-4) { camera.position.copy(tmp.cam); keep = true }
    } else camera.position.copy(tmp.base)
    camera.lookAt(tmp.look)
    camera.updateMatrixWorld()

    // 4. Лампа: наклон и просадка от шнура, затем якорь шнура в пикселях.
    const lamp = rg.lamp, dome = rg.dome, wire = rg.wire
    if (lamp && dome && wire) {
      dome.updateMatrixWorld(true)
      tmp.v.set(0, 2.8, -1.8).project(camera)
      const topPx = (-tmp.v.y * 0.5 + 0.5) * size.height
      tmp.v.set(0, 2.8 - 1, -1.8).project(camera)
      const pxPerM = Math.max(40, Math.abs((-tmp.v.y * 0.5 + 0.5) * size.height - topPx))
      const tugM = Math.max(0, Math.min(0.15, cord.tug.x / pxPerM))
      lamp.rotation.z = -cord.th.x
      dome.position.y = -(WIRE + tugM)
      wire.scale.y = WIRE + tugM
      wire.position.y = -(WIRE + tugM) / 2
      lamp.updateMatrixWorld(true)
      tmp.w.copy(RIM_LOCAL).applyMatrix4(dome.matrixWorld).project(camera)
      const ax = (tmp.w.x * 0.5 + 0.5) * size.width, ay = (-tmp.w.y * 0.5 + 0.5) * size.height
      cord.setAnchor(ax, ay)
      if (first.current) { first.current = false; ready() }
      cord.update(dt)
      const e = els.current, b = cord.bead
      if (e.path) e.path.setAttribute('d', cord.path())
      if (e.bead) e.bead.style.transform = `translate(${b.x.toFixed(2)}px,${b.y.toFixed(2)}px) rotate(${cord.beadAngle().toFixed(4)}rad)`
      if (e.grab) e.grab.style.transform = `translate(${b.x.toFixed(2)}px,${b.y.toFixed(2)}px)`
      if (e.hint) e.hint.style.transform = `translate(${(b.x + 18).toFixed(1)}px,${(b.y + 4).toFixed(1)}px)`
      if (cord.active) keep = true
    }
    void interacted
    if (keep) invalidate()
  })

  return (
    <>
      <color attach="background" args={['#0c0c0c']} />
      <hemisphereLight ref={hemiRef} args={['#fff4e2', '#b49a78', 0.6]} />
      <directionalLight ref={sunRef} color="#ffe7c6" intensity={3} castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0003} shadow-normalBias={0.025} shadow-radius={6}
        shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-camera-near={0.5} shadow-camera-far={20} />
      <rectAreaLight ref={areaRef} position={[2.93, 1.3, -1.9]} width={2.95} height={2.45} color="#e6efff" intensity={0} />

      {/* Оболочка комнаты */}
      <mesh position={[0, -0.05, -1]} receiveShadow>
        <boxGeometry args={[6.3, 0.1, 6.4]} />
        <meshPhysicalMaterial color="#d8c8b4" roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.22} map={tex.floor} bumpMap={tex.floor} bumpScale={0.6} />
      </mesh>
      <Box p={[0, 2.85, -1]} s={[6.3, 0.1, 6.4]} color="#faf7f2" map={tex.ceiling} bump={0.4} />
      <Box p={[-3.05, 1.4, -1]} s={[0.1, 2.8, 6.4]} color="#f6f1e8" map={tex.wall} bump={0.8} />
      <Box p={[0, 1.4, -4.15]} s={[6.3, 2.8, 0.1]} color="#f4eee4" map={tex.wall} bump={0.8} />
      <Box p={[0, 1.4, 2.15]} s={[6.3, 2.8, 0.1]} color="#f6f1e8" map={tex.wall} />
      <Box p={[3.05, 1.4, 0.85]} s={[0.1, 2.8, 2.5]} color="#f6f1e8" map={tex.wall} bump={0.8} />
      <Box p={[3.05, 1.4, -3.75]} s={[0.1, 2.8, 0.7]} color="#f6f1e8" map={tex.wall} bump={0.8} />
      <Box p={[3.05, 2.7, -1.9]} s={[0.1, 0.2, 3.0]} color="#f6f1e8" map={tex.wall} />
      <Baseboards />
      {/* Окно: профиль, стекло, шторы и пейзаж за ним */}
      <WindowUnit tex={tex} onGlass={onGlass} />
      <CurtainRod />
      <Curtain z0={-3.98} z1={-3.26} tex={tex} seed={3} />
      <Curtain z0={-0.54} z1={0.22} tex={tex} seed={8} />
      <primitive object={sky.group} />
      <Plant p={[2.3, 0, -3.6]} tex={tex} />
      <Artwork p={[1.3, 1.58, -4.085]} tex={tex} />
      <Downlights onBulb={onBulb} />
      {/* Потолок: утопленные чёрные линии */}
      <Box p={[0, 2.795, -0.4]} s={[3.1, 0.012, 0.025]} color="#080808" shadow={false} />
      <Box p={[0, 2.795, -3.2]} s={[3.1, 0.012, 0.025]} color="#080808" shadow={false} />
      <Box p={[-1.55, 2.795, -1.8]} s={[0.025, 0.012, 2.8]} color="#080808" shadow={false} />
      <Box p={[1.55, 2.795, -1.8]} s={[0.025, 0.012, 2.8]} color="#080808" shadow={false} />
      {/* Кухонная стена */}
      <Kitchen tex={tex} />
      <Box p={[-1.6, 1.72, -4.08]} s={[2.8, 1.2, 0.08]} color="#ffffff" rough={0.5} map={tex.panel} bump={0.3} />
      <mesh position={[-1.6, 1.08, -4.0]}>
        <boxGeometry args={[2.7, 0.018, 0.03]} />
        <meshBasicMaterial ref={(m) => { rig.current.led = m }} color="#555" toneMapped={false} />
      </mesh>

      {/* Стол, стулья, предметы */}
      <mesh position={[0, 0.006, -1.8]} receiveShadow>
        <boxGeometry args={[3.3, 0.012, 2.3]} />
        <meshStandardMaterial color="#ffffff" roughness={1} map={tex.rug} bumpMap={tex.rug} bumpScale={1.5} />
      </mesh>
      <ContactShadows frames={1} position={[0, 0.014, -1.5]} scale={[6.2, 6.2]} resolution={1024} blur={2.4} far={1.1} opacity={0.5} color="#2a2018" />
      <mesh position={[0, 0.74, -1.8]} castShadow receiveShadow>
        <boxGeometry args={[2.3, 0.05, 1.0]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.15} map={tex.table} bumpMap={tex.table} bumpScale={0.4} />
      </mesh>
      <Box p={[-0.7, 0.37, -1.8]} s={[0.1, 0.72, 0.6]} color="#ffffff" rough={0.45} map={tex.table} />
      <Box p={[0.7, 0.37, -1.8]} s={[0.1, 0.72, 0.6]} color="#ffffff" rough={0.45} map={tex.table} />
      <Box p={[-0.7, 0.02, -1.8]} s={[0.1, 0.04, 0.85]} color="#ffffff" rough={0.45} map={tex.table} />
      <Box p={[0.7, 0.02, -1.8]} s={[0.1, 0.04, 0.85]} color="#ffffff" rough={0.45} map={tex.table} />
      {[-0.65, 0.65].flatMap((x) => [<Chair key={`f${x}`} p={[x, 0, -1.1]} rotY={Math.PI} fabric={tex.fabric} />, <Chair key={`b${x}`} p={[x + 0.05, 0, -2.5]} rotY={0.08} fabric={tex.fabric} />])}
      <mesh position={[0.1, 0.89 - 0.12, -1.8]} castShadow>
        <cylinderGeometry args={[0.045, 0.07, 0.24, 20]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.25} metalness={0.2} />
      </mesh>
      <Branches />
      <mesh position={[-0.45, 0.785, -1.7]} castShadow>
        <cylinderGeometry args={[0.07, 0.04, 0.05, 20]} />
        <meshStandardMaterial color="#121212" roughness={0.4} />
      </mesh>
      <mesh position={[-0.2, 0.768, -1.95]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.012, 24]} />
        <meshStandardMaterial color="#181818" roughness={0.3} />
      </mesh>

      {/* Подвесной плафон: щелчок переключает день и ночь */}
      <group ref={(g) => { rig.current.lamp = g }} position={[0, 2.8, -1.8]}>
        <mesh ref={(m) => { rig.current.wire = m }} position={[0, -WIRE / 2, 0]} scale={[1, WIRE, 1]}>
          <cylinderGeometry args={[0.004, 0.004, 1, 6]} />
          <meshStandardMaterial color="#111" roughness={0.6} />
        </mesh>
        <group ref={(g) => { rig.current.dome = g }} position={[0, -WIRE, 0]}>
          <group
            ref={bellRef}
            onClick={(e) => { e.stopPropagation(); toggle() }}
            onPointerOver={(e) => { e.stopPropagation(); gl.domElement.style.cursor = 'pointer' }}
            onPointerOut={() => { gl.domElement.style.cursor = '' }}
          >
            <mesh position={[0, -BELL_R, 0]} castShadow>
              <sphereGeometry args={[BELL_R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#0d0d0d" roughness={0.45} metalness={0.15} side={THREE.DoubleSide} ref={(m) => { rig.current.bellInner = m }} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.05, 12]} />
              <meshStandardMaterial color="#0d0d0d" roughness={0.5} />
            </mesh>
            <mesh position={[0, -BELL_R + 0.07, 0]}>
              <sphereGeometry args={[0.055, 20, 12]} />
              <meshBasicMaterial ref={(m) => { rig.current.bulb = m }} color="#333" toneMapped={false} />
            </mesh>
          </group>
          <pointLight ref={glowRef} position={[0, -BELL_R - 0.04, 0]} intensity={0} distance={7} decay={2} color="#ffe9c9" />
          <spotLight ref={spotRef} position={[0, -BELL_R + 0.06, 0]} angle={0.95} penumbra={0.85} intensity={0} decay={2} distance={9} color="#ffe9c9" castShadow
            shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} shadow-normalBias={0.02} target={spotTarget} />
          <primitive object={spotTarget} position={[0, -1.7, 0]} />
        </group>
      </group>
    </>
  )
}

interface Props { onReady?: () => void }

export default function StartRoom3D({ onReady }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const rig = useRef<Rig>({ sun: null, hemi: null, spot: null, glow: null, bulb: null, bellInner: null, led: null, lamp: null, dome: null, wire: null, scene: null, glass: null, down: null })
  const els = useRef<Els>({ path: null, bead: null, grab: null, hint: null })
  const spring = useRef<HourSpring>({ x: useInterior.getState().hour, t: useInterior.getState().hour, written: useInterior.getState().hour, from: 0, elapsed: 0, dur: 0 })
  const interacted = useRef(false)
  const invalidateRef = useRef<() => void>(() => {})
  const [night, setNight] = useState(() => isNightHour(useInterior.getState().hour))
  const [touched, setTouched] = useState(false)
  const [ready, setReady] = useState(false)

  const toggle = () => {
    const sp = spring.current
    const toNight = !isNightHour(sp.t)
    const target = toNight ? NIGHT_PRESET_HOUR : DAY_PRESET_HOUR
    if (reduceMotion()) { sp.x = sp.t = target; sp.dur = 0 } else { sp.from = sp.x; sp.t = target; sp.elapsed = 0; sp.dur = TRANSITION_S }
    interacted.current = true
    setTouched(true)
    invalidateRef.current()
  }
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle
  const cord = useMemo(() => new PullCord(() => toggleRef.current(), reduceMotion()), [])

  // Служебный вход для снимков и автотестов (как __interior в редакторе): поставить час напрямую.
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__start = { setHour: (h: number) => useInterior.getState().setHour(h) }
    return () => { delete (window as unknown as Record<string, unknown>).__start }
  }, [])

  // Режим следует за часом: и за ползунком, и за переходом.
  useEffect(() => useInterior.subscribe((s) => { setNight(isNightHour(s.hour)); invalidateRef.current() }), [])

  // Намёк: одно лёгкое движение шнура, не доходящее до щелчка. Отсчёт идёт от готовности сцены (генерация текстур
  // занимает заметное время, и намёк не должен совпасть с первым нажатием сразу после показа).
  useEffect(() => {
    if (!ready || reduceMotion()) return
    const t = setTimeout(() => { if (!interacted.current) { cord.pull(true); invalidateRef.current() } }, 2600)
    return () => clearTimeout(t)
  }, [cord, ready])

  const local = (e: ReactPointerEvent): [number, number] => {
    const r = stage.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const [x, y] = local(e)
    cord.down(x, y)
    interacted.current = true
    setTouched(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* указатель уже не активен */ }
    e.currentTarget.classList.add('is-held')
    invalidateRef.current()
  }
  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => { if (!cord.isHeld) return; const [x, y] = local(e); cord.move(x, y); invalidateRef.current() }
  const onUp = (e: ReactPointerEvent<HTMLButtonElement>) => { e.currentTarget.classList.remove('is-held'); if (e.type === 'pointercancel') cord.cancel(); else cord.up(); invalidateRef.current() }

  return (
    <div className={`start-stage${night ? ' is-night' : ''}`} ref={stage} data-testid="start-room3d" data-ready={ready ? '1' : '0'} data-mode={night ? 'night' : 'day'}>
      <Canvas
        frameloop="demand"
        shadows="soft"
        dpr={[1, 1.75]}
        camera={{ position: [-1.5, 1.3, 2.0], fov: 46, near: 0.1, far: 40 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ invalidate }) => { invalidateRef.current = invalidate }}
        aria-hidden="true"
      >
        <Scene rig={rig} cord={cord} els={els} spring={spring} toggle={() => toggleRef.current()} interacted={interacted} ready={() => { setReady(true); onReady?.() }} />
      </Canvas>
      <svg className="start-rope" aria-hidden="true"><path ref={(p) => { els.current.path = p }} /></svg>
      <i className="start-bead" aria-hidden="true" ref={(b) => { els.current.bead = b }} />
      <button
        className="start-grab"
        ref={(b) => { els.current.grab = b }}
        role="switch"
        aria-checked={night}
        aria-label="Ночное освещение: потяните шнур или нажмите Enter"
        data-testid="start-cord"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => { if (!e.detail) { interacted.current = true; setTouched(true); cord.pull(); invalidateRef.current() } }}
      />
      <div className={`start-hint${touched ? ' is-quiet' : ''}`} ref={(h) => { els.current.hint = h }} aria-hidden="true">Потяните за шнур, чтобы изменить освещение</div>
    </div>
  )
}
