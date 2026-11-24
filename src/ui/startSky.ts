import * as THREE from 'three'
import { dayAmount } from '../scene3d/hour'
import { CLOUD_H, CLOUD_W, drawClouds, drawLandscape, drawVillageLights, fbm, LAND_H, LAND_W, rng } from './startLandscape'

/**
 * Небо за окном главного меню (этап 31): голубое небо с кучевыми облаками и солнцем днём; тёмное небо со звёздами,
 * Млечным Путём и луной ночью. Солнце и луна идут по дуге над линией дальних гор: при смене режима солнце уходит за горы,
 * а луна всходит (и наоборот). Пейзаж (горы, лес, поля с деревней, луг) рисует startLandscape.
 * Положения считает чистая функция skyState(hour); сцена только применяет их.
 */

/** Высота линии холмов (м) и размах дуги: светило над холмами видно, под ними скрыто. */
export const HORIZON = 0.72
export const ARC = 1.45
const SUN_X = 3.98
const SKY_X = 4.2

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

export interface SkyState {
  /** Дневной свет 0…1. */
  day: number
  /** Тёплый закатный оттенок 0…1 (на рассвете и закате). */
  warm: number
  sun: { y: number; z: number; opacity: number; low: number }
  moon: { y: number; z: number; opacity: number }
  stars: number
  clouds: number
  cloudOffset: number
}

/** Солнце: с 6 до 18 часов по дуге слева направо; вне этих часов уходит под линию холмов. Луна: с 18 до 6 часов. */
export function skyState(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24
  const day = dayAmount(h)
  const t = clamp((h - 6) / 12, -0.45, 1.45)
  const hn = h >= 12 ? h : h + 24
  const tm = clamp((hn - 18) / 12, -0.45, 1.45)
  const sy = HORIZON + ARC * Math.sin(Math.PI * t)
  const my = HORIZON + ARC * Math.sin(Math.PI * tm)
  const low = 1 - smooth(0, 0.7, Math.sin(Math.PI * clamp(t, 0, 1)))
  return {
    day,
    warm: Math.exp(-Math.pow((day - 0.35) / 0.22, 2)) * (h > 12 ? 1 : 0.7),
    // Через окно со стороны камеры виден отрезок неба z от −4,6 до −1,3 (метры): дуга идёт по его середине.
    sun: { y: sy, z: -3.0 + (t - 0.58) * 3.0, opacity: smooth(HORIZON - 0.25, HORIZON + 0.1, sy), low },
    moon: { y: my, z: -3.0 + (tm - 0.42) * 2.8, opacity: smooth(HORIZON - 0.25, HORIZON + 0.1, my) },
    stars: 1 - smooth(0.05, 0.6, day),
    clouds: smooth(0.4, 0.85, day),
    cloudOffset: h * 0.0045,
  }
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d')!, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

function radial(c: CanvasRenderingContext2D, x: number, y: number, r: number, stops: Array<[number, string]>) {
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  for (const [o, col] of stops) g.addColorStop(o, col)
  c.fillStyle = g
  c.fillRect(x - r, y - r, r * 2, r * 2)
}

export interface Sky {
  group: THREE.Group
  update: (hour: number) => void
  dispose: () => void
}

/** Небо: нужен document (canvas). Все материалы без освещения и без тонового отображения. */
export function buildSky(): Sky {
  const disposables: Array<{ dispose: () => void }> = []
  const track = <T extends { dispose: () => void }>(o: T): T => { disposables.push(o); return o }
  const basic = (map: THREE.Texture | null, extra: Partial<THREE.MeshBasicMaterialParameters> = {}) =>
    track(new THREE.MeshBasicMaterial({ map, toneMapped: false, depthWrite: false, ...extra }))
  const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, order: number) => {
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), mat)
    m.position.set(x, y, z)
    m.rotation.y = -Math.PI / 2
    m.renderOrder = order
    return m
  }

  // Дневное небо: глубокий голубой в зените, светлая дымка у горизонта.
  const dayTex = track(canvasTex(8, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#4f8fd6'); g.addColorStop(0.3, '#79afe6'); g.addColorStop(0.58, '#a9cff0'); g.addColorStop(0.8, '#d6e8f4'); g.addColorStop(1, '#eef3f2')
    c.fillStyle = g; c.fillRect(0, 0, w, h)
  }))
  // Ночное небо: звёзды разной яркости, Млечный Путь наискосок и слабое свечение у горизонта.
  const nightTex = track(canvasTex(2048, 1024, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#02040a'); g.addColorStop(0.6, '#081022'); g.addColorStop(0.85, '#121c36'); g.addColorStop(1, '#1d2944')
    c.fillStyle = g; c.fillRect(0, 0, w, h)
    const r = rng(5)
    // Млечный Путь: полоса из шума и мелкой звёздной пыли.
    const band = (x: number) => h * (0.12 + (x / w) * 0.5)
    const img = c.getImageData(0, 0, w, h)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const dist = Math.abs(y - band(x)) / (h * 0.11)
        if (dist > 1.6) continue
        const n = fbm(x / 140, y / 140, 5, 61)
        const v = Math.max(0, Math.exp(-dist * dist * 1.6) * (n - 0.32) * 1.6) * (1 - smooth(0.6, 0.85, y / h))
        const o = (y * w + x) * 4
        img.data[o] += v * 46; img.data[o + 1] += v * 50; img.data[o + 2] += v * 64
      }
    }
    c.putImageData(img, 0, 0)
    for (let i = 0; i < 5000; i++) {
      const x = r() * w
      const y = band(x) + (r() + r() + r() - 1.5) * h * 0.09
      c.fillStyle = `rgba(220,228,255,${0.15 + r() * 0.35})`
      c.fillRect(x, y, 0.8, 0.8)
    }
    for (let i = 0; i < 1500; i++) {
      const x = r() * w, y = r() * h * 0.8, big = r() < 0.05, rad = big ? 1.3 + r() * 1.2 : 0.35 + r() * 0.8
      const warm = r()
      c.fillStyle = warm < 0.15 ? `rgba(255,222,190,${0.4 + r() * 0.6})` : warm < 0.3 ? `rgba(200,215,255,${0.4 + r() * 0.6})` : `rgba(240,242,255,${0.3 + r() * 0.7})`
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill()
      if (big) radial(c, x, y, rad * 6, [[0, 'rgba(210,225,255,.3)'], [1, 'rgba(210,225,255,0)']])
    }
    const glow = c.createLinearGradient(0, h * 0.7, 0, h)
    glow.addColorStop(0, 'rgba(60,70,110,0)'); glow.addColorStop(1, 'rgba(70,80,120,.35)')
    c.fillStyle = glow; c.fillRect(0, h * 0.7, w, h * 0.3)
  }))
  // Облака: кучевые с самозатенением и перистые полосы; мелкие у горизонта.
  const cloudTex = track(canvasTex(CLOUD_W, CLOUD_H, drawClouds))
  cloudTex.wrapS = THREE.RepeatWrapping
  // Горы, лес, поля с деревней и луг: линия горизонта, за которую уходят солнце и луна.
  const hillsTex = track(canvasTex(LAND_W, LAND_H, drawLandscape))
  const lightsTex = track(canvasTex(LAND_W, LAND_H, drawVillageLights))
  // Солнце: яркий диск с тёплым ореолом и широким рассеянным свечением.
  const sunTex = track(canvasTex(512, 512, (c) => {
    radial(c, 256, 256, 256, [[0, 'rgba(255,252,236,1)'], [0.085, 'rgba(255,250,228,1)'], [0.11, 'rgba(255,240,196,.75)'], [0.2, 'rgba(255,234,186,.32)'], [0.45, 'rgba(255,226,176,.12)'], [1, 'rgba(255,220,170,0)']])
  }))
  // Луна: диск с морями и кратерами, лёгкое затемнение к краю, холодный ореол.
  const moonTex = track(canvasTex(512, 512, (c) => {
    radial(c, 256, 256, 256, [[0, 'rgba(230,238,255,.22)'], [0.35, 'rgba(210,222,255,.08)'], [1, 'rgba(200,215,255,0)']])
    const R = 84
    c.save(); c.beginPath(); c.arc(256, 256, R, 0, Math.PI * 2); c.clip()
    const img = c.getImageData(256 - R, 256 - R, R * 2, R * 2)
    for (let y = 0; y < R * 2; y++) {
      for (let x = 0; x < R * 2; x++) {
        const dx = (x - R) / R, dy = (y - R) / R, d2 = dx * dx + dy * dy
        if (d2 > 1) continue
        const limb = 0.72 + 0.28 * Math.sqrt(1 - d2)
        const maria = smooth(0.5, 0.62, fbm(x / 38 + 3, y / 38, 5, 13))
        const fine = fbm(x / 6, y / 6, 3, 27)
        const v = (226 - maria * 62 + (fine - 0.5) * 26) * limb
        const o = (y * R * 2 + x) * 4
        img.data[o] = v; img.data[o + 1] = v * 0.995; img.data[o + 2] = v * 0.97; img.data[o + 3] = 255
      }
    }
    c.putImageData(img, 256 - R, 256 - R)
    const r = rng(3)
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.85, cr = 2 + r() * 8
      const x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d
      c.strokeStyle = 'rgba(255,255,250,.18)'; c.lineWidth = 1
      c.beginPath(); c.arc(x - 0.6, y - 0.6, cr, 0, Math.PI * 2); c.stroke()
      c.fillStyle = 'rgba(90,90,86,.16)'
      c.beginPath(); c.arc(x + 0.6, y + 0.6, cr * 0.85, 0, Math.PI * 2); c.fill()
    }
    c.restore()
  }))

  const dayMat = basic(dayTex)
  const nightMat = basic(nightTex, { transparent: true, opacity: 0 })
  const cloudMat = basic(cloudTex, { transparent: true, opacity: 0 })
  const sunMat = basic(sunTex, { transparent: true })
  const moonMat = basic(moonTex, { transparent: true })
  const hillsMat = basic(hillsTex, { transparent: true })
  const lightsMat = basic(lightsTex, { transparent: true, opacity: 0, blending: THREE.AdditiveBlending })

  const group = new THREE.Group()
  group.add(plane(16, 9, dayMat, SKY_X, 1.6, -1.9, 0))
  group.add(plane(16, 9, nightMat, SKY_X - 0.02, 1.6, -1.9, 1))
  // Солнце за облаками: облака частично закрывают диск.
  const sun = plane(2.6, 2.6, sunMat, SUN_X + 0.1, 2, -1.9, 2)
  group.add(plane(8, 2.4, cloudMat, SKY_X - 0.05, 1.9, -1.9, 3))
  const moon = plane(1.4, 1.4, moonMat, SUN_X, 2, -1.9, 4)
  group.add(sun, moon)
  group.add(plane(6, 1.6, hillsMat, SUN_X - 0.08, HORIZON - 0.15, -1.9, 5))
  group.add(plane(6, 1.6, lightsMat, SUN_X - 0.09, HORIZON - 0.15, -1.9, 6))

  const white = new THREE.Color(1, 1, 1), warmTint = new THREE.Color('#ffd2a8'), dusk = new THREE.Color('#2a2d44')
  const tmp = new THREE.Color()
  return {
    group,
    update(hour: number) {
      const s = skyState(hour)
      tmp.copy(white).lerp(warmTint, s.warm * 0.6)
      dayMat.color.copy(tmp)
      nightMat.opacity = 1 - s.day
      cloudMat.opacity = s.clouds
      cloudMat.color.copy(white).lerp(warmTint, s.warm * 0.8)
      cloudTex.offset.x = s.cloudOffset
      hillsMat.color.setRGB(lerp(0.08, 1, s.day), lerp(0.09, 1, s.day), lerp(0.14, 1, s.day)).lerp(tmp.copy(dusk).lerp(warmTint, 0.6), s.warm * 0.22)
      lightsMat.opacity = 1 - smooth(0.05, 0.45, s.day)
      sun.position.set(SUN_X + 0.1, s.sun.y, s.sun.z)
      sunMat.opacity = s.sun.opacity
      sunMat.color.setRGB(1, lerp(0.97, 0.7, s.sun.low), lerp(0.9, 0.42, s.sun.low))
      moon.position.set(SUN_X, s.moon.y, s.moon.z)
      moonMat.opacity = s.moon.opacity
    },
    dispose() { for (const d of disposables) d.dispose() },
  }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
