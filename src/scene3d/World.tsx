import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MOON_COLOR, type Daylight } from './daylight'
import { worldLayout } from './worldLayout'

/**
 * Внешний мир за окнами (этап 20): небо с солнцем, луной и звёздами, земля, холмы, дома и деревья.
 * Всё строится из кода. Мир виден только через окна: окна пишут трафарет (stencil), а все объекты
 * мира рисуются только там, где трафарет равен 1. Остальное пространство остаётся фоном сцены.
 */

/** Порядок отрисовки: сначала трафарет окон, потом небо, потом мир; остальная сцена — с 0. */
export const STENCIL_ORDER = -20
export const WORLD_ORDER = -10

/** Параметры материала: рисовать только там, где окно записало в трафарет единицу. */
export const insideWindowOnly = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
} as const

/** Материал «окна»: ничего не рисует, но отмечает в трафарете пиксели, через которые виден мир. */
export function WindowStencilMaterial() {
  return (
    <meshBasicMaterial
      colorWrite={false} depthWrite={false} side={THREE.DoubleSide}
      stencilWrite stencilRef={1} stencilFunc={THREE.AlwaysStencilFunc}
      stencilFail={THREE.KeepStencilOp} stencilZFail={THREE.KeepStencilOp} stencilZPass={THREE.ReplaceStencilOp}
    />
  )
}

const SKY_VERTEX = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SKY_FRAGMENT = `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonColor;
  uniform float uSunVisible;
  uniform float uNight;
  uniform float uMoonAlpha;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = max(dir.y, 0.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.55));

    // Солнце: диск и тёплое гало вокруг.
    float ds = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * (pow(ds, 600.0) * 0.5 + pow(ds, 48.0) * 0.22 + pow(ds, 6.0) * 0.07) * uSunVisible;
    col = mix(col, uSunColor * 6.0, smoothstep(0.99955, 0.99985, ds) * uSunVisible);

    // Звёзды: яркие точки в ячейках сетки, только ночью и над горизонтом.
    vec3 sp = dir * 260.0;
    vec3 id = floor(sp);
    vec3 f = fract(sp) - 0.5;
    float r = hash(id);
    float star = step(0.9965, r) * smoothstep(0.28, 0.0, length(f)) * (0.5 + 0.5 * hash(id + 7.0));
    col += vec3(star) * uNight * smoothstep(0.02, 0.2, dir.y);

    // Луна: диск и слабое гало.
    float dm = max(dot(dir, uMoonDir), 0.0);
    col += uMoonColor * pow(dm, 160.0) * 0.18 * uNight;
    col = mix(col, uMoonColor * 1.6, smoothstep(0.99935, 0.99965, dm) * uMoonAlpha);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Sky({ daylight }: { daylight: Daylight }) {
  const uniforms = useMemo(() => ({
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color() },
    uMoonDir: { value: new THREE.Vector3() },
    uMoonColor: { value: new THREE.Color(MOON_COLOR) },
    uSunVisible: { value: 1 },
    uNight: { value: 0 },
    uMoonAlpha: { value: 0 },
  }), [])
  useLayoutEffect(() => {
    uniforms.uTop.value.set(daylight.sky.top)
    uniforms.uHorizon.value.set(daylight.sky.horizon)
    uniforms.uSunDir.value.set(...daylight.sun.direction)
    uniforms.uSunColor.value.set(daylight.sun.altitudeDeg > -0.5 ? daylight.light.color : '#ff7f36')
    uniforms.uMoonDir.value.set(...daylight.moonDirection)
    uniforms.uSunVisible.value = daylight.sun.altitudeDeg > -6 ? Math.min(1, (daylight.sun.altitudeDeg + 6) / 6) : 0
    uniforms.uNight.value = daylight.night
    uniforms.uMoonAlpha.value = daylight.moonAlpha
  }, [daylight, uniforms])
  return (
    <mesh renderOrder={WORLD_ORDER - 1} frustumCulled={false} raycast={() => null} name="world-sky">
      <sphereGeometry args={[220, 40, 24]} />
      <shaderMaterial
        uniforms={uniforms} vertexShader={SKY_VERTEX} fragmentShader={SKY_FRAGMENT} side={THREE.BackSide}
        depthWrite={false} {...insideWindowOnly}
      />
    </mesh>
  )
}

/** Набор экземпляров одной геометрии с матрицами и цветами. */
function Instances({ geometry, matrices, colors, castShadow = false }: {
  geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[]; colors: string[]; castShadow?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const c = new THREE.Color()
    matrices.forEach((mat, i) => { m.setMatrixAt(i, mat); m.setColorAt(i, c.set(colors[i])) })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [matrices, colors])
  if (matrices.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, matrices.length]} renderOrder={WORLD_ORDER} frustumCulled={false} receiveShadow castShadow={castShadow} raycast={() => null}>
      <meshStandardMaterial roughness={0.95} {...insideWindowOnly} />
    </instancedMesh>
  )
}

const compose = (x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(sx, sy, sz))

/** Квадратики окон домов одной геометрией: lit — только освещённые (горят ночью). */
function windowGeometry(houses: ReturnType<typeof worldLayout>['houses'], lit: boolean): THREE.BufferGeometry {
  const pos: number[] = []
  const w = 1.4, h = 1.7
  for (const house of houses) {
    const c = Math.cos(house.rotY), s = Math.sin(house.rotY)
    for (const win of house.windows) {
      if (lit && !win.lit) continue
      const cw = Math.cos(win.rotY), sw = Math.sin(win.rotY)
      const out = lit ? 0.02 : 0
      // Локальные углы окна: по ширине вдоль (cw, 0, -sw) стены, по высоте — вертикаль.
      const corners: Array<[number, number]> = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
      const pts = corners.map(([u, v]) => {
        const lx = win.x + u * cw + Math.sin(win.rotY) * out
        const lz = win.z - u * sw + Math.cos(win.rotY) * out
        return [house.x + lx * c + lz * s, win.y + v, house.z - lx * s + lz * c]
      })
      for (const i of [0, 1, 2, 0, 2, 3]) pos.push(...pts[i])
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/**
 * Мир вокруг квартиры. center — центр квартиры (м), exclusionRadius — зона вокруг неё, свободная от построек;
 * daylight управляет огнями в окнах домов и освещением материалов (через свет сцены).
 */
export function World({ daylight, center, exclusionRadius }: { daylight: Daylight; center: { x: number; z: number }; exclusionRadius: number }) {
  const layout = useMemo(() => worldLayout(exclusionRadius), [exclusionRadius])
  const geo = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    const roof = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4)
    roof.rotateY(Math.PI / 4)
    return {
      box, roof,
      trunk: new THREE.CylinderGeometry(0.12, 0.18, 1, 6),
      crown: new THREE.IcosahedronGeometry(1, 1),
      cone: new THREE.ConeGeometry(1, 1, 7),
      hill: new THREE.ConeGeometry(1, 1, 9),
      ground: new THREE.CircleGeometry(250, 64).rotateX(-Math.PI / 2),
      windows: windowGeometry(layout.houses, false),
      lit: windowGeometry(layout.houses, true),
    }
  }, [layout])
  useLayoutEffect(() => () => { for (const g of Object.values(geo)) g.dispose() }, [geo])

  const items = useMemo(() => {
    const { houses, trees, hills } = layout
    return {
      walls: { m: houses.map((h) => compose(h.x, h.h / 2, h.z, h.rotY, h.w, h.h, h.d)), c: houses.map((h) => h.wall) },
      roofs: { m: houses.map((h) => compose(h.x, h.h + h.roofH / 2, h.z, h.rotY, h.w, h.roofH, h.d)), c: houses.map((h) => h.roof) },
      trunks: { m: trees.map((t) => compose(t.x, (t.conifer ? t.h * 0.25 : t.h * 0.4) / 2, t.z, 0, 1, t.conifer ? t.h * 0.25 : t.h * 0.4, 1)), c: trees.map(() => '#5a4332') },
      crowns: (() => {
        const round = trees.filter((t) => !t.conifer)
        return { m: round.map((t) => compose(t.x, t.h * 0.4 + t.r * 0.8, t.z, 0, t.r, t.r * 1.1, t.r)), c: round.map((t) => t.color) }
      })(),
      cones: (() => {
        const con = trees.filter((t) => t.conifer)
        return { m: con.map((t) => compose(t.x, t.h * 0.25 + t.h * 0.75 / 2, t.z, 0, t.r, t.h * 0.75, t.r)), c: con.map((t) => t.color) }
      })(),
      hills: { m: hills.map((h) => compose(h.x, h.h / 2 - 1, h.z, 0, h.r, h.h, h.r)), c: hills.map((h) => h.color) },
    }
  }, [layout])

  return (
    <group name="world" position={[center.x, 0, center.z]}>
      <Sky daylight={daylight} />
      <mesh geometry={geo.ground} position={[0, -0.02, 0]} renderOrder={WORLD_ORDER} receiveShadow raycast={() => null} name="world-ground">
        <meshStandardMaterial color="#4a6b3b" roughness={1} {...insideWindowOnly} />
      </mesh>
      <Instances geometry={geo.hill} matrices={items.hills.m} colors={items.hills.c} />
      <Instances geometry={geo.box} matrices={items.walls.m} colors={items.walls.c} />
      <Instances geometry={geo.roof} matrices={items.roofs.m} colors={items.roofs.c} />
      <Instances geometry={geo.trunk} matrices={items.trunks.m} colors={items.trunks.c} />
      <Instances geometry={geo.crown} matrices={items.crowns.m} colors={items.crowns.c} />
      <Instances geometry={geo.cone} matrices={items.cones.m} colors={items.cones.c} />
      <mesh geometry={geo.windows} renderOrder={WORLD_ORDER} raycast={() => null} name="world-windows">
        <meshStandardMaterial color="#27384d" roughness={0.25} metalness={0.4} {...insideWindowOnly} />
      </mesh>
      {daylight.night > 0.02 && (
        <mesh geometry={geo.lit} renderOrder={WORLD_ORDER + 1} raycast={() => null} name="world-lit-windows">
          <meshBasicMaterial color="#ffd18a" transparent opacity={Math.min(1, daylight.night * 1.1)} depthWrite={false} {...insideWindowOnly} />
        </mesh>
      )}
    </group>
  )
}
