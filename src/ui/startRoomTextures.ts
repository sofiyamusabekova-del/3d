import * as THREE from 'three'
import { fbm, rng } from './startLandscape'

/**
 * Процедурные текстуры комнаты главного меню: паркет, штукатурка, тёмное дерево, букле, ковёр, мрамор, порошковая
 * окраска рам, разводы на стекле, лён штор, лист фикуса, картина и бетон кашпо. Без загрузки файлов.
 */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  draw(cv.getContext('2d')!, w, h)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function tiled(tex: THREE.Texture, x: number, y: number): THREE.Texture {
  const t = tex.clone()
  t.repeat.set(x, y)
  t.needsUpdate = true
  return t
}

/** Дубовый паркет: доски разной длины и тона, волокна, «соборный» рисунок, сучки, фаски. */
function parquet(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(7), rows = 10, ph = h / rows
  for (let i = 0; i < rows; i++) {
    const y0 = i * ph
    const cuts = [0]
    let x = -r() * w * 0.5
    while (x < w) { x += w * (0.35 + r() * 0.4); if (x > 0 && x < w) cuts.push(x) }
    cuts.push(w)
    for (let s = 0; s < cuts.length - 1; s++) {
      const x0 = cuts[s], x1 = cuts[s + 1]
      const hue = 28 + r() * 7, sat = 34 + r() * 14, lig = 50 + r() * 13
      const g = c.createLinearGradient(x0, 0, x1, 0)
      g.addColorStop(0, `hsl(${hue} ${sat}% ${lig + (r() - 0.5) * 4}%)`)
      g.addColorStop(1, `hsl(${hue + (r() - 0.5) * 3} ${sat}% ${lig + (r() - 0.5) * 5}%)`)
      c.fillStyle = g
      c.fillRect(x0, y0, x1 - x0, ph)
      c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, ph); c.clip()
      // Волокна: длинные волнистые линии вдоль доски.
      const seed = Math.floor(r() * 1000)
      for (let k = 0; k < 34; k++) {
        const yy = y0 + r() * ph
        const dark = r() < 0.7
        c.strokeStyle = dark ? `rgba(${70 + r() * 30},${40 + r() * 20},18,${0.05 + r() * 0.12})` : `rgba(255,236,200,${0.04 + r() * 0.06})`
        c.lineWidth = 0.5 + r() * 1.6
        c.beginPath()
        for (let px = x0; px <= x1 + 16; px += 16) {
          const off = (fbm(px / 260, k * 0.7, 3, seed) - 0.5) * ph * 0.35
          if (px === x0) c.moveTo(px, yy + off); else c.lineTo(px, yy + off)
        }
        c.stroke()
      }
      // «Соборный» рисунок на части досок.
      if (r() < 0.45) {
        const cx = x0 + (x1 - x0) * (0.2 + r() * 0.6), cy = y0 + ph * (0.3 + r() * 0.4)
        for (let k = 1; k < 9; k++) {
          c.strokeStyle = `rgba(80,46,20,${0.06 + r() * 0.06})`
          c.lineWidth = 0.8 + r()
          c.beginPath(); c.ellipse(cx, cy, 30 + k * 26 + r() * 10, 3 + k * ph * 0.05, 0, Math.PI * 0.5, Math.PI * 1.5); c.stroke()
        }
      }
      // Сучок.
      if (r() < 0.22) {
        const kx = x0 + (x1 - x0) * r(), ky = y0 + ph * (0.25 + r() * 0.5), kr = 3 + r() * 6
        for (let k = 4; k >= 0; k--) {
          c.fillStyle = `rgba(${60 + k * 10},${34 + k * 6},16,${0.18 + (4 - k) * 0.08})`
          c.beginPath(); c.ellipse(kx, ky, kr * (1 + k * 0.6), kr * 0.55 * (1 + k * 0.3), 0, 0, Math.PI * 2); c.fill()
        }
      }
      c.restore()
      // Фаски: тёмный шов и светлая кромка.
      c.fillStyle = 'rgba(38,22,10,.6)'; c.fillRect(x0, y0, 2, ph)
      c.fillStyle = 'rgba(255,240,210,.12)'; c.fillRect(x0 + 2, y0, 1.5, ph)
    }
    c.fillStyle = 'rgba(38,22,10,.55)'; c.fillRect(0, y0, w, 2)
    c.fillStyle = 'rgba(255,240,210,.14)'; c.fillRect(0, y0 + 2, w, 1.5)
  }
}

/** Штукатурка: светлое основание, крупные мягкие пятна и мелкая шероховатость. */
function plaster(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(11)
  c.fillStyle = '#eeebe5'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 160; i++) {
    const x = r() * w, y = r() * h, rad = 40 + r() * 140, v = r() < 0.5 ? '120,110,96' : '255,255,255'
    const g = c.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, `rgba(${v},${0.02 + r() * 0.025})`); g.addColorStop(1, `rgba(${v},0)`)
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  for (let i = 0; i < 26000; i++) {
    const v = r() < 0.5 ? 0 : 255, rad = 0.4 + r() * 1.8
    c.fillStyle = `rgba(${v},${v},${v},${0.012 + r() * 0.03})`
    c.beginPath(); c.arc(r() * w, r() * h, rad, 0, Math.PI * 2); c.fill()
  }
}

/** Тёмное дерево (орех): длинные волокна с переливом тона. */
function darkWood(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(23)
  c.fillStyle = '#2b2119'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 900; i++) {
    const x = r() * w, lw = 0.4 + r() * 2.4
    const light = r() < 0.5
    c.strokeStyle = light ? `rgba(${150 + r() * 70},${110 + r() * 50},${70 + r() * 30},${0.03 + r() * 0.08})` : `rgba(8,5,3,${0.06 + r() * 0.12})`
    c.lineWidth = lw
    c.beginPath()
    const seed = i
    for (let y = 0; y <= h; y += 16) {
      const off = (fbm(y / 300, seed * 0.13, 3, 5) - 0.5) * 40
      if (y === 0) c.moveTo(x + off, y); else c.lineTo(x + off, y)
    }
    c.stroke()
  }
  for (let i = 0; i < 6; i++) {
    const cx = r() * w, cy = r() * h
    for (let k = 1; k < 12; k++) {
      c.strokeStyle = `rgba(160,120,80,${0.03 + r() * 0.04})`; c.lineWidth = 1
      c.beginPath(); c.ellipse(cx, cy, 3 + k * 2.2, 18 + k * 16, 0, 0, Math.PI * 2); c.stroke()
    }
  }
}

/** Букле: плотные петли пряжи со светом и тенью. */
function boucle(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(31)
  c.fillStyle = '#e7dfd2'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 9000; i++) {
    const x = r() * w, y = r() * h, rad = 1.2 + r() * 2.6
    c.strokeStyle = `rgba(120,104,84,${0.12 + r() * 0.14})`; c.lineWidth = 1
    c.beginPath(); c.arc(x + 0.6, y + 0.6, rad, 0, Math.PI * 2); c.stroke()
    c.strokeStyle = `rgba(255,252,246,${0.25 + r() * 0.3})`
    c.beginPath(); c.arc(x, y, rad, Math.PI * 0.9, Math.PI * 1.9); c.stroke()
  }
}

/** Ковёр из шерсти: ворс, лёгкая неравномерность тона и двойной кант по краю. */
function rug(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(41)
  c.fillStyle = '#d6cab6'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, rad = 60 + r() * 160
    const g = c.createRadialGradient(x, y, 0, x, y, rad)
    const v = r() < 0.5 ? '120,100,80' : '255,250,240'
    g.addColorStop(0, `rgba(${v},.05)`); g.addColorStop(1, `rgba(${v},0)`)
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  for (let i = 0; i < 60000; i++) {
    const x = r() * w, y = r() * h
    const dark = r() < 0.5
    c.strokeStyle = dark ? `rgba(110,92,70,${0.08 + r() * 0.12})` : `rgba(255,250,238,${0.08 + r() * 0.14})`
    c.lineWidth = 0.8
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 3, y + (r() - 0.5) * 3); c.stroke()
  }
  const band = (inset: number, width: number, col: string) => {
    c.strokeStyle = col; c.lineWidth = width
    c.strokeRect(inset, inset, w - inset * 2, h - inset * 2)
  }
  band(w * 0.045, 14, 'rgba(120,98,76,.55)')
  band(w * 0.07, 3, 'rgba(120,98,76,.45)')
  band(6, 10, 'rgba(160,140,116,.5)')
}

/** Мрамор: белый с серыми прожилками из искажённого шума. */
function marble(c: CanvasRenderingContext2D, w: number, h: number) {
  const img = c.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 120, y / 120, 6, 71)
      const m = Math.sin(x * 0.012 + y * 0.02 + n * 9)
      const vein = 1 - clamp(Math.abs(m) / 0.09, 0, 1)
      const n2 = fbm(x / 40 + 7, y / 40, 4, 83)
      const fine = 1 - clamp(Math.abs(Math.sin(x * 0.03 - y * 0.011 + n2 * 7)) / 0.04, 0, 1)
      const v = 244 - vein * 70 - fine * 24 - (n - 0.5) * 14
      const o = (y * w + x) * 4
      img.data[o] = v; img.data[o + 1] = v - 1; img.data[o + 2] = v - 4; img.data[o + 3] = 255
    }
  }
  c.putImageData(img, 0, 0)
}

/** Порошковая окраска профиля: тёмный антрацит с мелкой шагренью. */
function powder(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(51)
  c.fillStyle = '#2a2d30'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 9000; i++) {
    const v = r() < 0.5 ? 0 : 255
    c.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.05})`
    c.fillRect(r() * w, r() * h, 1, 1)
  }
}

/** Разводы на стекле (карта прозрачности): мягкие пятна, следы протирки и диагональные блики. */
function glassAlpha(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(61)
  c.fillStyle = 'rgb(46,46,46)'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, rad = 20 + r() * 90
    const g = c.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, `rgba(255,255,255,${0.04 + r() * 0.06})`); g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  for (let i = 0; i < 14; i++) {
    c.strokeStyle = `rgba(255,255,255,${0.025 + r() * 0.03})`; c.lineWidth = 8 + r() * 20
    const x = r() * w, y = r() * h, rad = 30 + r() * 80
    c.beginPath(); c.arc(x, y, rad, r() * 6, r() * 6 + 2); c.stroke()
  }
  c.save(); c.translate(w / 2, h / 2); c.rotate(-0.6)
  for (const [off, bw, a] of [[-0.18, 0.16, 0.07], [0.02, 0.06, 0.05], [0.24, 0.22, 0.04]] as const) {
    const g = c.createLinearGradient(w * (off - bw), 0, w * (off + bw), 0)
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g; c.fillRect(-w, -h * 1.5, w * 2, h * 3)
  }
  c.restore()
}

/** Лён: неровные нити основы и утка с утолщениями. */
function linen(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(71)
  c.fillStyle = '#f2ede4'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < w; i += 2) {
    c.fillStyle = `rgba(150,136,116,${0.04 + r() * 0.08})`; c.fillRect(i, 0, 1, h)
    c.fillStyle = `rgba(150,136,116,${0.04 + r() * 0.08})`; c.fillRect(0, i, w, 1)
  }
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgba(120,104,86,${0.06 + r() * 0.08})`
    if (r() < 0.5) c.fillRect(r() * w, r() * h, 1.4, 10 + r() * 40)
    else c.fillRect(r() * w, r() * h, 10 + r() * 40, 1.4)
  }
}

/** Лист фикуса: глянцевая зелень, светлая центральная жилка и боковые жилки. */
function leaf(c: CanvasRenderingContext2D, w: number, h: number) {
  const g = c.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, '#24451f'); g.addColorStop(0.5, '#3d6b2e'); g.addColorStop(1, '#22421d')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  const r = rng(81)
  for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '180,220,140'},${0.03 + r() * 0.04})`; c.fillRect(r() * w, r() * h, 2, 2) }
  c.strokeStyle = 'rgba(200,226,160,.75)'; c.lineWidth = 4
  c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 0); c.stroke()
  c.lineWidth = 1.6; c.strokeStyle = 'rgba(190,220,150,.4)'
  for (let k = 1; k < 12; k++) {
    const y = h - (k / 12) * h
    c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w * 0.3, y - h * 0.05, 0, y - h * 0.12); c.stroke()
    c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w * 0.7, y - h * 0.05, w, y - h * 0.12); c.stroke()
  }
}

/** Картина: абстрактный пейзаж тёплых тонов с фактурой мазков на холсте. */
function art(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(91)
  const g = c.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#efe4d2'); g.addColorStop(1, '#e2d2bb')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  c.fillStyle = '#c86f4a'
  c.beginPath(); c.arc(w * 0.66, h * 0.36, h * 0.17, 0, Math.PI * 2); c.fill()
  const hill = (base: number, amp: number, col: string, seed: number) => {
    c.fillStyle = col
    c.beginPath(); c.moveTo(0, h)
    for (let x = 0; x <= w; x += 4) c.lineTo(x, h * base - Math.sin(x / w * Math.PI * 1.3 + seed) * h * amp)
    c.lineTo(w, h); c.closePath(); c.fill()
  }
  hill(0.62, 0.12, '#9aa489', 1)
  hill(0.74, 0.08, '#56664f', 3)
  hill(0.88, 0.05, '#2f3a30', 5)
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * h
    c.strokeStyle = `rgba(${r() < 0.5 ? '255,250,240' : '60,40,30'},${0.04 + r() * 0.05})`; c.lineWidth = 1 + r() * 2
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 4 + r() * 10, y + (r() - 0.5) * 3); c.stroke()
  }
  for (let i = 0; i < w; i += 2) { c.fillStyle = 'rgba(0,0,0,.025)'; c.fillRect(i, 0, 1, h) }
}

/** Бетон кашпо: серый, с порами и разводами. */
function concrete(c: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(97)
  c.fillStyle = '#a7a39c'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, rad = 20 + r() * 60
    const gr = c.createRadialGradient(x, y, 0, x, y, rad)
    gr.addColorStop(0, `rgba(${r() < 0.5 ? '70,66,60' : '220,216,208'},.12)`); gr.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(50,48,44,${0.2 + r() * 0.4})`; c.beginPath(); c.arc(r() * w, r() * h, 0.5 + r() * 1.4, 0, Math.PI * 2); c.fill() }
}

export function makeRoomTextures() {
  const base = {
    parquet: canvas(2048, 2048, parquet),
    plaster: canvas(1024, 1024, plaster),
    wood: canvas(1024, 1024, darkWood),
    boucle: canvas(512, 512, boucle),
    rug: canvas(1024, 712, rug),
    marble: canvas(512, 512, marble),
    powder: canvas(256, 256, powder),
    glass: canvas(512, 512, glassAlpha, false),
    linen: canvas(512, 512, linen),
    leaf: canvas(256, 512, leaf),
    art: canvas(768, 576, art),
    concrete: canvas(256, 256, concrete),
  }
  base.rug.wrapS = base.rug.wrapT = THREE.ClampToEdgeWrapping
  base.art.wrapS = base.art.wrapT = THREE.ClampToEdgeWrapping
  base.glass.wrapS = base.glass.wrapT = THREE.ClampToEdgeWrapping
  const derived = {
    floor: tiled(base.parquet, 3.2, 3.2),
    wall: tiled(base.plaster, 3, 1.4),
    ceiling: tiled(base.plaster, 3, 3),
    table: tiled(base.wood, 1.2, 0.5),
    panel: tiled(base.wood, 1.6, 0.7),
    fabric: tiled(base.boucle, 1.5, 1.5),
    linen: tiled(base.linen, 2, 6),
    powder: tiled(base.powder, 1, 8),
    marble: tiled(base.marble, 3, 0.7),
  }
  return {
    ...base,
    ...derived,
    dispose() { for (const t of [...Object.values(base), ...Object.values(derived)]) t.dispose() },
  }
}
export type RoomTextures = ReturnType<typeof makeRoomTextures>
