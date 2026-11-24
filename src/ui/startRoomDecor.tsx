import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { rng } from './startLandscape'
import type { RoomTextures } from './startRoomTextures'

/**
 * Детали комнаты главного меню: панорамное окно (профиль, штапики, стекло с разводами, ручка), льняные шторы на карнизе,
 * фикус в бетонном кашпо, картина в раме, плинтусы, кухня с мраморной столешницей и точечные светильники в потолке.
 */

type V3 = [number, number, number]

function Box({ p, s, color = '#ececec', rough = 0.9, metal = 0, map, shadow = true, bump = 0 }: { p: V3; s: V3; color?: string; rough?: number; metal?: number; map?: THREE.Texture; shadow?: boolean; bump?: number }) {
  return (
    <mesh position={p} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} map={map} bumpMap={bump ? map : undefined} bumpScale={bump} />
    </mesh>
  )
}

// ───────────── Окно ─────────────

const WX = 3.0
const PANES: Array<[number, number]> = [[-3.37, -2.43], [-2.37, -1.43], [-1.37, -0.43]]
const GLASS_Y0 = 0.06, GLASS_Y1 = 2.54

/** Панорамное окно: рама из алюминиевого профиля, штапики, уплотнители, три стеклопакета и ручка. */
export function WindowUnit({ tex, onGlass }: { tex: RoomTextures; onGlass: (m: THREE.MeshStandardMaterial | null) => void }) {
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.48, metalness: 0.45, map: tex.powder }), [tex])
  const bead = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.5, metalness: 0.4, map: tex.powder }), [tex])
  const rubber = useMemo(() => new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.9 }), [])
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.28, metalness: 1 }), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e4f0f2', roughness: 0.04, metalness: 0.15, envMapIntensity: 1.6,
    transparent: true, opacity: 0.55, alphaMap: tex.glass, depthWrite: false, side: THREE.FrontSide,
  }), [tex])
  useEffect(() => {
    onGlass(glass)
    return () => { onGlass(null); for (const m of [frame, bead, rubber, steel, glass]) m.dispose() }
  }, [frame, bead, rubber, steel, glass, onGlass])

  const parts: Array<{ p: V3; s: V3; m: THREE.Material; cast?: boolean }> = []
  // Коробка: стойки, верх и низ.
  parts.push({ p: [WX, 1.3, -3.37], s: [0.13, 2.6, 0.07], m: frame })
  parts.push({ p: [WX, 1.3, -0.43], s: [0.13, 2.6, 0.07], m: frame })
  parts.push({ p: [WX, 2.57, -1.9], s: [0.13, 0.07, 3.0], m: frame })
  parts.push({ p: [WX, 0.03, -1.9], s: [0.13, 0.06, 3.0], m: frame })
  // Импосты.
  for (const z of [-2.4, -1.4]) parts.push({ p: [WX, 1.3, z], s: [0.13, 2.5, 0.07], m: frame })
  // Штапики с внутренней стороны и чёрные уплотнители у стекла.
  for (const [z0, z1] of PANES) {
    const zc = (z0 + z1) / 2, wz = z1 - z0
    parts.push({ p: [WX - 0.045, GLASS_Y1 + 0.005, zc], s: [0.03, 0.025, wz], m: bead, cast: false })
    parts.push({ p: [WX - 0.045, GLASS_Y0 - 0.005, zc], s: [0.03, 0.025, wz], m: bead, cast: false })
    parts.push({ p: [WX - 0.045, 1.3, z0 + 0.012], s: [0.03, GLASS_Y1 - GLASS_Y0, 0.025], m: bead, cast: false })
    parts.push({ p: [WX - 0.045, 1.3, z1 - 0.012], s: [0.03, GLASS_Y1 - GLASS_Y0, 0.025], m: bead, cast: false })
    parts.push({ p: [WX - 0.028, GLASS_Y1 - 0.004, zc], s: [0.006, 0.008, wz - 0.03], m: rubber, cast: false })
    parts.push({ p: [WX - 0.028, GLASS_Y0 + 0.004, zc], s: [0.006, 0.008, wz - 0.03], m: rubber, cast: false })
    parts.push({ p: [WX - 0.028, 1.3, z0 + 0.026], s: [0.006, GLASS_Y1 - GLASS_Y0, 0.006], m: rubber, cast: false })
    parts.push({ p: [WX - 0.028, 1.3, z1 - 0.026], s: [0.006, GLASS_Y1 - GLASS_Y0, 0.006], m: rubber, cast: false })
  }
  // Ручка створки (средняя секция, у импоста).
  parts.push({ p: [WX - 0.075, 1.08, -1.47], s: [0.012, 0.075, 0.03], m: steel, cast: false })
  parts.push({ p: [WX - 0.1, 1.06, -1.47], s: [0.05, 0.016, 0.018], m: steel, cast: false })
  parts.push({ p: [WX - 0.118, 0.99, -1.47], s: [0.016, 0.15, 0.018], m: steel, cast: false })

  return (
    <group>
      {parts.map((it, i) => (
        <mesh key={i} position={it.p} material={it.m} castShadow={it.cast !== false} receiveShadow>
          <boxGeometry args={it.s} />
        </mesh>
      ))}
      {PANES.map(([z0, z1], i) => (
        <mesh key={`g${i}`} position={[WX - 0.012, (GLASS_Y0 + GLASS_Y1) / 2, (z0 + z1) / 2]} rotation={[0, -Math.PI / 2, 0]} material={glass} renderOrder={10}>
          <planeGeometry args={[z1 - z0 - 0.02, GLASS_Y1 - GLASS_Y0]} />
        </mesh>
      ))}
    </group>
  )
}

// ───────────── Шторы ─────────────

function curtainGeometry(width: number, height: number, seed: number) {
  const g = new THREE.PlaneGeometry(width, height, 96, 24)
  const p = g.attributes.position
  const r = rng(seed)
  const phase = r() * 6
  const fold = 0.105 + r() * 0.02
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i)
    const v = (y + height / 2) / height
    // Складки: у пола чуть глубже, у карниза собраны плотнее.
    const amp = 0.028 + (1 - v) * 0.012
    const z = Math.sin(((x + width / 2) / fold) * Math.PI * 2 + phase) * amp + Math.sin(x * 23 + v * 3) * 0.004
    p.setZ(i, z)
  }
  g.computeVertexNormals()
  return g
}

/** Льняная штора: складки, лёгкая просвечиваемость, на кольцах карниза. */
export function Curtain({ z0, z1, tex, seed }: { z0: number; z1: number; tex: RoomTextures; seed: number }) {
  const w = z1 - z0, h = 2.62
  const geo = useMemo(() => curtainGeometry(w, h, seed), [w, seed])
  return (
    <mesh geometry={geo} position={[2.86, 0.03 + h / 2, (z0 + z1) / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow castShadow>
      <meshStandardMaterial color="#f6f1e8" roughness={1} map={tex.linen} bumpMap={tex.linen} bumpScale={0.4} side={THREE.DoubleSide} transparent opacity={0.94} />
    </mesh>
  )
}

/** Карниз над окном с кронштейнами. */
export function CurtainRod() {
  return (
    <group>
      <mesh position={[2.86, 2.69, -1.85]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 4.3, 12]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.35} metalness={0.8} />
      </mesh>
      {[-3.95, -1.85, 0.25].map((z) => (
        <mesh key={z} position={[2.95, 2.69, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, 0.18, 8]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.35} metalness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

// ───────────── Фикус ─────────────

function leafGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 6, 10)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), v = p.getY(i) + 0.5
    const width = Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.98 + 0.02)), 0.6) * (0.55 + 0.5 * v)
    const nx = x * width
    p.setXYZ(i, nx, v, -nx * nx * 0.9 - v * v * 0.12)
  }
  g.computeVertexNormals()
  return g
}

/** Фикус лировидный в бетонном кашпо. */
export function Plant({ p, tex }: { p: V3; tex: RoomTextures }) {
  const geo = useMemo(() => leafGeometry(), [])
  const leaves = useMemo(() => {
    const r = rng(303)
    const out: Array<{ pos: V3; rotY: number; tilt: number; s: number; roll: number }> = []
    const stems: Array<{ base: V3; lean: [number, number]; top: number }> = [
      { base: [0, 0.42, 0], lean: [0.02, -0.03], top: 1.75 },
      { base: [0.04, 0.42, 0.03], lean: [0.12, 0.08], top: 1.35 },
      { base: [-0.03, 0.42, -0.02], lean: [-0.1, 0.1], top: 1.2 },
    ]
    stems.forEach((st, si) => {
      const n = si === 0 ? 30 : 16
      for (let i = 0; i < n; i++) {
        const t = i / n
        const y = st.base[1] + 0.3 + t * (st.top - st.base[1] - 0.3)
        const k = (y - st.base[1]) / (st.top - st.base[1])
        out.push({
          pos: [st.base[0] + st.lean[0] * k, y, st.base[2] + st.lean[1] * k],
          rotY: i * 2.39996 + si,
          tilt: 0.55 + (1 - t) * 0.6 + (r() - 0.5) * 0.3,
          s: (0.2 + (1 - t) * 0.08) * (0.85 + r() * 0.3),
          roll: (r() - 0.5) * 0.5,
        })
      }
    })
    return { out, stems }
  }, [])
  return (
    <group position={p}>
      <mesh position={[0, 0.21, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.165, 0.42, 36]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} map={tex.concrete} bumpMap={tex.concrete} bumpScale={1} />
      </mesh>
      <mesh position={[0, 0.405, 0]}>
        <cylinderGeometry args={[0.185, 0.185, 0.01, 32]} />
        <meshStandardMaterial color="#2c2118" roughness={1} />
      </mesh>
      {leaves.stems.map((st, i) => {
        const h = st.top - st.base[1]
        const tip = new THREE.Vector3(st.lean[0], h, st.lean[1])
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().normalize())
        return (
          <mesh key={i} position={[st.base[0] + st.lean[0] / 2, st.base[1] + h / 2, st.base[2] + st.lean[1] / 2]} quaternion={q} castShadow>
            <cylinderGeometry args={[0.008, 0.014, tip.length(), 8]} />
            <meshStandardMaterial color="#5b4a36" roughness={0.9} />
          </mesh>
        )
      })}
      {leaves.out.map((l, i) => (
        <group key={i} position={l.pos} rotation={[0, l.rotY, 0]}>
          <mesh geometry={geo} rotation={[l.tilt, 0, l.roll]} scale={[l.s * 0.75, l.s, l.s]} castShadow receiveShadow>
            <meshStandardMaterial map={tex.leaf} roughness={0.42} metalness={0} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ───────────── Картина ─────────────

export function Artwork({ p, tex }: { p: V3; tex: RoomTextures }) {
  return (
    <group position={p}>
      <Box p={[0, 0, 0]} s={[0.86, 0.66, 0.035]} color="#a77c52" rough={0.6} map={tex.table} />
      <mesh position={[0, 0, 0.0185]}>
        <planeGeometry args={[0.8, 0.6]} />
        <meshStandardMaterial color="#f7f4ee" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, 0.019]}>
        <planeGeometry args={[0.6, 0.45]} />
        <meshStandardMaterial map={tex.art} roughness={0.85} />
      </mesh>
    </group>
  )
}

// ───────────── Плинтусы ─────────────

export function Baseboards() {
  const c = '#f4f1ea'
  return (
    <group>
      <Box p={[0.1, 0.04, -4.093]} s={[6.0, 0.08, 0.014]} color={c} rough={0.5} shadow={false} />
      <Box p={[-2.993, 0.04, -1]} s={[0.014, 0.08, 6.3]} color={c} rough={0.5} shadow={false} />
      <Box p={[2.993, 0.04, 0.85]} s={[0.014, 0.08, 2.5]} color={c} rough={0.5} shadow={false} />
      <Box p={[2.993, 0.04, -3.75]} s={[0.014, 0.08, 0.7]} color={c} rough={0.5} shadow={false} />
    </group>
  )
}

// ───────────── Кухня ─────────────

/** Нижние шкафы без ручек (фрезерованные швы), цоколь, мраморная столешница с мойкой и смесителем, полка с посудой. */
export function Kitchen({ tex }: { tex: RoomTextures }) {
  const r = useMemo(() => rng(404), [])
  const ceramics = useMemo(() => [
    { x: -2.6, h: 0.2, rad: 0.06, c: '#efeae2' }, { x: -2.42, h: 0.13, rad: 0.075, c: '#c9b9a3' },
    { x: -2.2, h: 0.26, rad: 0.045, c: '#3a3633' }, { x: -1.98, h: 0.09, rad: 0.09, c: '#e6dccd' },
  ].map((o) => ({ ...o, tilt: (r() - 0.5) * 0.02 })), [r])
  const doors = [-2.95, -2.25, -1.55, -0.85, -0.2]
  return (
    <group>
      <Box p={[-1.6, 0.49, -3.8]} s={[2.8, 0.82, 0.6]} color="#ebe5da" rough={0.55} />
      <Box p={[-1.6, 0.04, -3.76]} s={[2.78, 0.08, 0.5]} color="#1a1816" rough={0.8} />
      {doors.slice(1, -1).map((x) => <Box key={x} p={[x, 0.49, -3.4995]} s={[0.004, 0.8, 0.002]} color="#6f665b" rough={0.8} shadow={false} />)}
      <Box p={[-1.6, 0.62, -3.4995]} s={[2.78, 0.004, 0.002]} color="#6f665b" rough={0.8} shadow={false} />
      <Box p={[-1.6, 0.92, -3.79]} s={[2.84, 0.04, 0.64]} color="#ffffff" rough={0.16} metal={0.02} map={tex.marble} />
      {/* Мойка и смеситель */}
      <Box p={[-1.0, 0.938, -3.78]} s={[0.5, 0.004, 0.38]} color="#3b3d40" rough={0.3} metal={0.8} shadow={false} />
      <mesh position={[-1.0, 1.09, -3.99]} castShadow>
        <cylinderGeometry args={[0.012, 0.016, 0.3, 16]} />
        <meshStandardMaterial color="#cfd2d6" roughness={0.18} metalness={1} />
      </mesh>
      <mesh position={[-1.0, 1.23, -3.9]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.19, 12]} />
        <meshStandardMaterial color="#cfd2d6" roughness={0.18} metalness={1} />
      </mesh>
      {/* Полка с керамикой на тёмной панели */}
      <Box p={[-2.25, 1.58, -3.93]} s={[1.0, 0.03, 0.22]} color="#c19a6b" rough={0.55} map={tex.table} />
      {ceramics.map((o) => (
        <mesh key={o.x} position={[o.x, 1.595 + o.h / 2, -3.93]} rotation={[0, 0, o.tilt]} castShadow>
          <cylinderGeometry args={[o.rad * 0.85, o.rad, o.h, 28]} />
          <meshStandardMaterial color={o.c} roughness={0.55} />
        </mesh>
      ))}
      {/* Доска и чаша на столешнице */}
      <Box p={[-2.35, 0.95, -3.85]} s={[0.42, 0.02, 0.28]} color="#c49a6c" rough={0.6} map={tex.table} />
      <mesh position={[-1.85, 0.98, -3.75]} castShadow>
        <sphereGeometry args={[0.11, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#e9e3d8" roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ───────────── Точечные светильники ─────────────

const DOWN: Array<[number, number]> = [[-2.3, -0.7], [2.2, -0.7], [-2.3, -3.0], [2.2, -3.0], [-0.2, 0.9], [1.1, 0.9]]

/** Встроенные светильники: белое кольцо и рассеиватель, который светится по мере ухода дня. */
export function Downlights({ onBulb }: { onBulb: (m: THREE.MeshBasicMaterial | null) => void }) {
  const bulb = useMemo(() => new THREE.MeshBasicMaterial({ color: '#555', toneMapped: false }), [])
  useEffect(() => { onBulb(bulb); return () => { onBulb(null); bulb.dispose() } }, [bulb, onBulb])
  return (
    <group>
      {DOWN.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 2.799, z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.035, 0.05, 32]} />
            <meshStandardMaterial color="#fafafa" roughness={0.3} metalness={0.2} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} material={bulb}>
            <circleGeometry args={[0.035, 32]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
