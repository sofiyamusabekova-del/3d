/**
 * Процедурный пейзаж за окном главного меню: облака, горы, лес, поля с деревней, ближняя линия деревьев и луг.
 * Всё рисуется в canvas без загрузки файлов, с фиксированным зерном генератора: картинка одинакова при каждом запуске.
 * Свет падает сверху слева; дальние планы тонут в воздушной дымке.
 */

export const LAND_W = 3072
export const LAND_H = 820
export const CLOUD_W = 1440
export const CLOUD_H = 432

type RGB = [number, number, number]

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const css = (c: RGB, k = 1, a = 1) => `rgba(${Math.round(clamp(c[0] * k, 0, 255))},${Math.round(clamp(c[1] * k, 0, 255))},${Math.round(clamp(c[2] * k, 0, 255))},${a})`

export function rng(seed: number) {
  let a = seed | 0
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

function hash2(ix: number, iy: number, seed: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function vnoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, y: number, octaves: number, seed: number) {
  let sum = 0, amp = 0.5, f = 1, norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f, y * f, seed + o * 17)
    norm += amp; f *= 2.03; amp *= 0.5
  }
  return sum / norm
}

function offscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  return [cv, cv.getContext('2d')!]
}

// ───────────────────────────── Облака ─────────────────────────────

/**
 * Кучевые облака с перспективой (у горизонта мельче и плотнее), самозатенением по направлению к солнцу,
 * светлой каймой по тонким краям и перистыми полосами наверху. Нижний край растворяется в дымке горизонта.
 */
export function drawClouds(c: CanvasRenderingContext2D, w: number, h: number) {
  const dens = new Float32Array(w * h)
  const cirrus = new Float32Array(w * h)
  const sx = 5.2 / w
  for (let j = 0; j < h; j++) {
    const ny = j / h
    const persp = 1 + ny * ny * 2.2
    const bias = -0.07 + 0.16 * smooth(0.1, 0.5, ny) - 0.08 * smooth(0.85, 1, ny)
    for (let i = 0; i < w; i++) {
      let u = i * sx * persp
      const v = ny * 3.4 * persp
      u += (fbm(u * 0.45, v * 0.45, 3, 77) - 0.5) * 1.3
      const n = fbm(u, v * 1.6, 6, 3)
      const det = fbm(u * 4.2, v * 6.5, 3, 41)
      const k = j * w + i
      dens[k] = n + bias + (det - 0.5) * 0.16
      if (ny < 0.42) cirrus[k] = smooth(0.56, 0.76, fbm(u * 0.5, v * 8, 5, 91)) * (1 - smooth(0.18, 0.42, ny)) * 0.5
    }
  }
  const thr = 0.53
  const lit: RGB = [255, 252, 246], shadow: RGB = [146, 160, 184], haze: RGB = [228, 236, 242]
  const img = c.createImageData(w, h)
  const data = img.data
  for (let j = 0; j < h; j++) {
    const ny = j / h
    const hz = smooth(0.55, 1, ny)
    const fade = 1 - smooth(0.9, 1, ny)
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      const d = dens[k]
      const a = smooth(thr, thr + 0.17, d)
      const ci = cirrus[k]
      if (a <= 0.004 && ci <= 0.004) continue
      // Свет идёт сверху слева: чем больше облака по пути к солнцу, тем темнее точка.
      let occ = 0
      for (let s = 1; s <= 5; s++) {
        const si = i - s * 4, sj = j - s * 6
        if (si < 0 || sj < 0) break
        occ += Math.max(0, dens[sj * w + si] - thr)
      }
      const light = Math.exp(-occ * 5.5)
      const edge = 1 - smooth(0, 0.55, a)
      const lum = clamp(0.25 + 0.75 * light + edge * 0.18, 0, 1)
      let col = mix(shadow, lit, lum)
      col = mix(col, haze, hz * 0.55)
      const o = k * 4
      const ca = Math.max(a, ci)
      if (a < ci) col = mix(col, lit, 0.8)
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]
      data[o + 3] = ca * fade * 252
    }
  }
  c.putImageData(img, 0, 0)
}

// ───────────────────────────── Пейзаж ─────────────────────────────

interface House { x: number; y: number; w: number; hw: number; hr: number; wall: RGB; roof: RGB; tall: boolean }

interface Plan {
  far: Float32Array
  forest: Float32Array
  mid: Float32Array
  near: Float32Array
  houses: House[]
  windows: Array<[number, number]>
}

let cached: Plan | null = null

function profile(w: number, h: number, base: number, amp: number, freq: number, seed: number, ridged = 0): Float32Array {
  const p = new Float32Array(w + 1)
  for (let x = 0; x <= w; x++) {
    const n = fbm((x / w) * freq, seed * 0.31, 6, seed)
    const r = 1 - Math.abs(n * 2 - 1)
    const v = n * (1 - ridged) + r * ridged
    p[x] = h * (base - amp * (v - 0.5) * 2)
  }
  return p
}

/** Профили холмов и дома деревни: общие для дневной картинки и ночных огней. */
function plan(w: number, h: number): Plan {
  if (cached) return cached
  const r = rng(101)
  const far = profile(w, h, 0.31, 0.1, 6.5, 5, 0.85)
  const forest = profile(w, h, 0.39, 0.026, 11, 11)
  const mid = profile(w, h, 0.465, 0.026, 2.8, 19)
  const near = profile(w, h, 0.645, 0.012, 7, 29)
  const houses: House[] = []
  const windows: Array<[number, number]> = []
  // Деревня на среднем холме, в видимой части окна (u ≈ 0,06…0,67).
  const cx = w * 0.42
  for (let i = 0; i < 16; i++) {
    const x = cx + (r() - 0.5) * w * 0.17 + (i % 2 ? 1 : -1) * r() * 60
    const xi = clamp(Math.round(x), 0, w)
    const y = mid[xi] + h * (0.02 + r() * 0.07)
    const s = 0.75 + (y / h - 0.48) * 6
    const tall = i === 3
    const hw = (tall ? 22 : 9 + r() * 6) * s
    const hse: House = {
      x, y, w: (12 + r() * 14) * s, hw, hr: (tall ? 26 : 6 + r() * 5) * s,
      wall: r() < 0.7 ? [238, 232, 220] : [222, 206, 182],
      roof: r() < 0.6 ? [132, 62, 46] : [86, 90, 98], tall,
    }
    houses.push(hse)
    const nWin = Math.max(1, Math.round(hse.w / (6 * s)))
    for (let k = 0; k < nWin; k++) if (r() < 0.75) windows.push([x - hse.w / 2 + (k + 0.5) * (hse.w / nWin), y - hw * 0.55])
  }
  houses.sort((a, b) => a.y - b.y)
  cached = { far, forest, mid, near, houses, windows }
  return cached
}

function fillProfile(c: CanvasRenderingContext2D, p: Float32Array, w: number, h: number, fill: string | CanvasGradient) {
  c.fillStyle = fill
  c.beginPath(); c.moveTo(0, h)
  for (let x = 0; x <= w; x += 2) c.lineTo(x, p[x])
  c.lineTo(w, h); c.closePath(); c.fill()
}

/** Тонировать нарисованное на слое воздушной дымкой: сверху меньше, в низинах больше. */
function hazeLayer(c: CanvasRenderingContext2D, w: number, h: number, top: number, bot: number, aTop: number, aBot: number, col: RGB = [206, 220, 232]) {
  c.save()
  c.globalCompositeOperation = 'source-atop'
  const g = c.createLinearGradient(0, h * top, 0, h * bot)
  g.addColorStop(0, css(col, 1, aTop)); g.addColorStop(1, css(col, 1, aBot))
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
  c.restore()
}

/** Лиственное дерево: ствол и крона из освещённых слева сверху кистей листвы с мелкими бликами. */
function deciduous(c: CanvasRenderingContext2D, x: number, y: number, h: number, r: () => number, hazeK = 0) {
  const trunkW = Math.max(1, h * 0.05)
  c.fillStyle = css(mix([70, 54, 40], [190, 200, 205], hazeK))
  c.beginPath()
  c.moveTo(x - trunkW * 0.6, y); c.lineTo(x - trunkW * 0.25, y - h * 0.5); c.lineTo(x + trunkW * 0.25, y - h * 0.5); c.lineTo(x + trunkW * 0.6, y)
  c.closePath(); c.fill()
  const base: RGB = mix([46 + r() * 30, 80 + r() * 34, 34 + r() * 18], [170, 190, 196], hazeK)
  const cx = x + (r() - 0.5) * h * 0.06, cy = y - h * 0.6
  const R = h * (0.32 + r() * 0.07), Rx = R * (0.8 + r() * 0.35)
  const n = clamp(Math.round(h / 3.2), 8, 70)
  const clumps: Array<[number, number, number, number]> = []
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r())
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d
    const lit = clamp(0.5 - dx * 0.32 - dy * 0.42 + (r() - 0.5) * 0.2, 0, 1)
    clumps.push([cx + dx * Rx * 0.85, cy + dy * R * 0.8, R * (0.24 + r() * 0.22), lit])
  }
  clumps.sort((p, q) => p[3] - q[3])
  for (const [px, py, cr, lit] of clumps) {
    const g = c.createRadialGradient(px - cr * 0.35, py - cr * 0.4, cr * 0.1, px, py, cr * 1.05)
    g.addColorStop(0, css(base, 0.95 + lit * 0.75))
    g.addColorStop(0.55, css(base, 0.7 + lit * 0.45))
    g.addColorStop(1, css(base, 0.5 + lit * 0.2))
    c.fillStyle = g
    c.beginPath(); c.arc(px, py, cr, 0, Math.PI * 2); c.fill()
  }
  if (h > 30) {
    const dots = n * 4
    for (let i = 0; i < dots; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r())
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d
      const lit = 0.5 - dx * 0.4 - dy * 0.5
      if (lit < 0.35) continue
      c.fillStyle = css(base, 1.25 + lit * 0.7, 0.55)
      c.beginPath(); c.arc(cx + dx * Rx, cy + dy * R * 0.9, 0.6 + r() * h * 0.012, 0, Math.PI * 2); c.fill()
    }
  }
}

/** Ель: ярусы с рваным нижним краем, освещённая сторона слева. */
function conifer(c: CanvasRenderingContext2D, x: number, y: number, h: number, r: () => number, hazeK = 0) {
  const tiers = clamp(Math.round(h / 9), 5, 14)
  const col: RGB = mix([34 + r() * 14, 64 + r() * 16, 48 + r() * 12], [168, 186, 196], hazeK)
  c.fillStyle = css(mix([62, 48, 36], [180, 190, 198], hazeK))
  c.fillRect(x - h * 0.02, y - h * 0.12, h * 0.04, h * 0.12)
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers
    const ty = y - h * 0.1 - k * h * 0.9
    const tw = h * 0.26 * Math.pow(1 - k, 0.85) + 1
    const th = (h * 0.9) / tiers * 1.9
    const g = c.createLinearGradient(x - tw, 0, x + tw, 0)
    g.addColorStop(0, css(col, 1.45)); g.addColorStop(0.45, css(col, 1.05)); g.addColorStop(1, css(col, 0.62))
    c.fillStyle = g
    c.beginPath()
    c.moveTo(x, ty - th)
    const teeth = 5
    for (let s = 0; s <= teeth; s++) {
      const px = x + tw - (2 * tw * s) / teeth
      c.lineTo(px, ty + (s % 2 ? -th * 0.12 : 0) + (r() - 0.5) * th * 0.1)
    }
    c.closePath(); c.fill()
  }
}

function drawHouse(c: CanvasRenderingContext2D, hs: House) {
  const { x, y, w, hw, hr, wall, roof } = hs
  const l = x - w / 2
  if (hs.tall) {
    // Колокольня: узкая башня со шпилем.
    const tw = w * 0.35
    c.fillStyle = css(wall, 0.95); c.fillRect(x - tw / 2, y - hw, tw, hw)
    c.fillStyle = css(wall, 0.78); c.fillRect(x, y - hw, tw / 2, hw)
    c.fillStyle = css(roof, 0.9)
    c.beginPath(); c.moveTo(x - tw * 0.6, y - hw); c.lineTo(x, y - hw - hr); c.lineTo(x + tw * 0.6, y - hw); c.closePath(); c.fill()
    return
  }
  c.fillStyle = 'rgba(30,40,20,.25)'
  c.beginPath(); c.ellipse(x + w * 0.2, y + 1, w * 0.65, Math.max(1, hw * 0.18), 0, 0, Math.PI * 2); c.fill()
  c.fillStyle = css(wall, 1); c.fillRect(l, y - hw, w * 0.72, hw)
  c.fillStyle = css(wall, 0.8); c.fillRect(l + w * 0.72, y - hw, w * 0.28, hw)
  c.fillStyle = css(roof, 1.05)
  c.beginPath(); c.moveTo(l - w * 0.05, y - hw); c.lineTo(l + w * 0.2, y - hw - hr); c.lineTo(l + w * 0.9, y - hw - hr); c.lineTo(l + w * 0.72, y - hw); c.closePath(); c.fill()
  c.fillStyle = css(roof, 0.72)
  c.beginPath(); c.moveTo(l + w * 0.72, y - hw); c.lineTo(l + w * 0.9, y - hw - hr); c.lineTo(l + w * 1.04, y - hw); c.closePath(); c.fill()
  c.fillStyle = 'rgba(40,46,54,.75)'
  const nWin = Math.max(1, Math.round(w / 9))
  for (let k = 0; k < nWin; k++) c.fillRect(l + (k + 0.3) * (w * 0.72 / nWin), y - hw * 0.62, Math.max(1, w * 0.06), Math.max(1, hw * 0.22))
}

/** Дневной пейзаж: горы → лес → поля с деревней → ближние деревья → луг с тропинкой. */
export function drawLandscape(c: CanvasRenderingContext2D, w: number, h: number) {
  const P = plan(w, h)
  const r = rng(23)

  // 1. Горы: рельеф из гребневого шума, освещённые склоны слева сверху, тени в распадках; к подножию тонут в дымке.
  {
    const y0 = Math.floor(Math.min(...P.far) - 2), y1 = Math.ceil(h * 0.47)
    const img = c.createImageData(w, y1 - y0)
    const rock: RGB = [118, 136, 160], litC: RGB = [214, 224, 236], shadC: RGB = [74, 90, 116], hazeC: RGB = [200, 214, 228]
    const height = (x: number, y: number) => {
      const n = fbm(x / 170, y / 70, 5, 7)
      const ridge = 1 - Math.abs(n * 2 - 1)
      return ridge * 0.75 + fbm(x / 40, y / 22, 3, 13) * 0.25
    }
    // Распознанная видимая часть окна (u ≈ 0,03…0,72): за её пределами достаточно плоской заливки.
    const xa = Math.floor(w * 0.03), xb = Math.ceil(w * 0.72)
    for (let y = y0; y < y1; y++) {
      const fy = (y - y0) / (y1 - y0)
      for (let x = 0; x < w; x++) {
        const top = P.far[x]
        if (y < top - 1) continue
        const edge = clamp(y - top + 1, 0, 1)
        let col: RGB
        if (x >= xa && x <= xb) {
          // Склон к подножию + рельеф: перепад высоты к соседу справа-снизу даёт освещённость.
          const hh = height(x, y) + (y - top) * 0.004
          const hn = height(x + 2, y + 2) + (y - top + 2) * 0.004
          const sh = clamp((hh - hn) * 9, -1, 1)
          col = sh > 0 ? mix(rock, litC, sh) : mix(rock, shadC, -sh)
        } else col = rock
        col = mix(col, hazeC, 0.28 + fy * 0.55)
        const o = ((y - y0) * w + x) * 4
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255 * edge
      }
    }
    const [cv, l] = offscreen(w, h)
    l.putImageData(img, 0, y0)
    l.fillStyle = css(hazeC, 0.97)
    l.fillRect(0, y1, w, h - y1)
    c.drawImage(cv, 0, 0)
  }

  // 2. Дальний лес: пушистый край и тысячи крон-точек.
  {
    const [cv, l] = offscreen(w, h)
    fillProfile(l, P.forest, w, h, '#58776a')
    for (let x = 0; x <= w; x += 3) {
      l.fillStyle = css([74, 104, 90], 0.8 + r() * 0.4)
      l.beginPath(); l.arc(x, P.forest[x] + r() * 2, 1.6 + r() * 2.2, 0, Math.PI * 2); l.fill()
    }
    l.save(); l.globalCompositeOperation = 'source-atop'
    for (let i = 0; i < 22000; i++) {
      const x = r() * w, top = P.forest[Math.round(x)]
      const y = top + Math.pow(r(), 1.3) * h * 0.14
      const lit = r()
      l.fillStyle = lit < 0.5 ? css([50, 78, 62], 0.8 + r() * 0.3) : css([110, 140, 112], 0.85 + r() * 0.3)
      l.beginPath(); l.arc(x, y, 1 + r() * 1.8, 0, Math.PI * 2); l.fill()
    }
    l.restore()
    hazeLayer(l, w, h, 0.36, 0.55, 0.3, 0.55)
    c.drawImage(cv, 0, 0)
  }

  // 3. Средний холм: лоскуты полей с бороздами, живые изгороди, рощи и деревня.
  {
    const [cv, l] = offscreen(w, h)
    const g = l.createLinearGradient(0, h * 0.44, 0, h * 0.7)
    g.addColorStop(0, '#93b06c'); g.addColorStop(1, '#7c9c55')
    fillProfile(l, P.mid, w, h, g)
    l.save(); l.globalCompositeOperation = 'source-atop'
    const fieldCols: RGB[] = [[204, 186, 112], [150, 178, 92], [176, 196, 110], [126, 152, 76], [170, 146, 98], [196, 204, 128]]
    const bands: number[] = []
    for (let y = h * 0.455, k = 0; y < h * 0.7; k++) { bands.push(y); y += h * (0.012 + k * 0.006) }
    for (let b = 0; b < bands.length - 1; b++) {
      const y0 = bands[b], y1 = bands[b + 1]
      let x = -r() * 200
      while (x < w) {
        const fw = (90 + r() * 260) * (1 + b * 0.25)
        const sk0 = (r() - 0.5) * 40, sk1 = (r() - 0.5) * 40
        const col = fieldCols[Math.floor(r() * fieldCols.length)]
        l.fillStyle = css(col, 0.95 + r() * 0.1, 0.75)
        l.beginPath(); l.moveTo(x + sk0, y0); l.lineTo(x + fw + sk1, y0); l.lineTo(x + fw + sk1 * 1.3, y1); l.lineTo(x + sk0 * 1.3, y1); l.closePath(); l.fill()
        if (r() < 0.55) {
          l.strokeStyle = css(col, 0.78, 0.35)
          l.lineWidth = 1
          const step = 3 + b * 0.8, ang = (r() - 0.5) * 1.2
          for (let fx = x; fx < x + fw; fx += step) { l.beginPath(); l.moveTo(fx, y0); l.lineTo(fx + (y1 - y0) * ang, y1); l.stroke() }
        }
        // Живая изгородь по краю поля.
        if (r() < 0.6) {
          const sz = 1.2 + b * 0.35
          for (let t = 0; t < 1; t += 0.06) {
            const hx = x + sk0 + (sk0 * 0.3) * t, hy = y0 + (y1 - y0) * t
            l.fillStyle = css([52, 82, 46], 0.85 + r() * 0.35)
            l.beginPath(); l.arc(hx + (r() - 0.5) * 2, hy, sz + r() * sz, 0, Math.PI * 2); l.fill()
          }
        }
        x += fw
      }
      for (let t = 0; t < w; t += 5) {
        if (r() < 0.45) continue
        l.fillStyle = css([56, 86, 48], 0.85 + r() * 0.35)
        l.beginPath(); l.arc(t, y0 + (r() - 0.5) * 1.5, 1.3 + b * 0.3 + r() * 1.5, 0, Math.PI * 2); l.fill()
      }
    }
    // Рощи.
    for (let k = 0; k < 14; k++) {
      const gx = r() * w, gy = h * (0.47 + r() * 0.17), gs = 18 + r() * 60
      const sz = 1.5 + (gy / h - 0.46) * 18
      for (let i = 0; i < gs * 2; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r())
        l.fillStyle = r() < 0.4 ? css([96, 128, 74], 0.9 + r() * 0.3) : css([46, 74, 42], 0.85 + r() * 0.35)
        l.beginPath(); l.arc(gx + Math.cos(a) * d * gs, gy + Math.sin(a) * d * gs * 0.22, sz * (0.7 + r() * 0.7), 0, Math.PI * 2); l.fill()
      }
    }
    l.restore()
    for (const hs of P.houses) drawHouse(l, hs)
    // Деревья между домами.
    for (let i = 0; i < 40; i++) {
      const hs = P.houses[Math.floor(r() * P.houses.length)]
      const tx = hs.x + (r() - 0.5) * 80, ty = hs.y + r() * 6
      deciduous(l, tx, ty, 10 + r() * 14, r, 0.15)
    }
    hazeLayer(l, w, h, 0.44, 0.68, 0.16, 0.3)
    c.drawImage(cv, 0, 0)
  }

  // 4. Ближняя опушка: отдельные лиственные деревья и ели с тенями; просветы на поля.
  {
    const [cv, l] = offscreen(w, h)
    const g = l.createLinearGradient(0, h * 0.62, 0, h)
    g.addColorStop(0, '#7aa04d'); g.addColorStop(1, '#5f8a3c')
    fillProfile(l, P.near, w, h, g)
    const trees: Array<[number, number, number, boolean]> = []
    let x = 0
    // Деревья группами: плотные куртины с просветами между ними.
    while (x < w) {
      x += 90 + r() * 260
      const count = 3 + Math.floor(r() * 9), spread = 40 + count * 14
      for (let k = 0; k < count; k++) {
        const tx = x + (r() - 0.5) * spread
        const xi = clamp(Math.round(tx), 0, w)
        trees.push([tx, P.near[xi] + 2 + r() * 16, 70 + r() * 120, r() < 0.3])
      }
      x += spread / 2
    }
    trees.sort((a, b) => a[1] - b[1])
    for (const [tx, ty, th] of trees) {
      l.fillStyle = 'rgba(28,48,18,.28)'
      l.beginPath(); l.ellipse(tx + th * 0.16, ty + 1, th * 0.28, th * 0.035, 0, 0, Math.PI * 2); l.fill()
    }
    for (const [tx, ty, th, con] of trees) (con ? conifer : deciduous)(l, tx, ty, th, r, 0.05)
    hazeLayer(l, w, h, 0.45, 0.7, 0.06, 0.04)
    c.drawImage(cv, 0, 0)
  }

  // 5. Луг: пятна света и тени, тропинка к опушке, трава с перспективой и цветы.
  {
    const top = h * 0.68
    const g = c.createLinearGradient(0, top, 0, h)
    g.addColorStop(0, '#94ad66'); g.addColorStop(0.5, '#738f4c'); g.addColorStop(1, '#4c6834')
    c.fillStyle = g
    c.beginPath(); c.moveTo(0, h)
    for (let px = 0; px <= w; px += 4) c.lineTo(px, top + h * 0.012 * (fbm((px / w) * 11, 0.7, 3, 31) - 0.5) * 2)
    c.lineTo(w, h); c.closePath(); c.fill()
    for (let i = 0; i < 260; i++) {
      const px = r() * w, py = top + Math.pow(r(), 0.8) * (h - top)
      const s = 20 + ((py - top) / (h - top)) * 180
      c.fillStyle = r() < 0.5 ? `rgba(196,220,120,${0.05 + r() * 0.07})` : `rgba(30,60,20,${0.05 + r() * 0.08})`
      c.beginPath(); c.ellipse(px, py, s, s * 0.22, 0, 0, Math.PI * 2); c.fill()
    }
    // Тропинка: из правого нижнего угла видимой части к опушке.
    c.fillStyle = 'rgba(196,180,140,.85)'
    c.beginPath()
    const pathPts: Array<[number, number, number]> = []
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const py = h - t * (h - top - 4)
      const px = w * 0.5 - Math.sin(t * 2.6) * w * 0.06 - t * w * 0.05
      pathPts.push([px, py, 4 + (1 - t) * (1 - t) * 70])
    }
    pathPts.forEach(([px, py, pw], i) => (i ? c.lineTo(px - pw, py) : c.moveTo(px - pw, py)))
    for (let i = pathPts.length - 1; i >= 0; i--) c.lineTo(pathPts[i][0] + pathPts[i][2], pathPts[i][1])
    c.closePath(); c.fill()
    for (const [px, py, pw] of pathPts) {
      for (let k = 0; k < 6; k++) {
        c.fillStyle = `rgba(150,130,96,${0.12 + r() * 0.15})`
        c.beginPath(); c.arc(px + (r() - 0.5) * pw * 1.6, py + (r() - 0.5) * 6, 1 + r() * pw * 0.05, 0, Math.PI * 2); c.fill()
      }
    }
    // Трава: короче вдали, длиннее у окна.
    for (let i = 0; i < 42000; i++) {
      const t = Math.pow(r(), 0.7)
      const py = top + t * (h - top)
      const px = r() * w
      const len = 1.5 + t * t * 18 * (0.5 + r())
      const lit = r()
      c.strokeStyle = lit < 0.45 ? `rgba(44,78,30,${0.25 + r() * 0.35})` : lit < 0.9 ? `rgba(128,170,72,${0.25 + r() * 0.35})` : `rgba(206,222,140,${0.35 + r() * 0.3})`
      c.lineWidth = 0.6 + t * 1.1
      c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + (r() - 0.5) * len * 0.3, py - len * 0.6, px + (r() - 0.3) * len * 0.45, py - len); c.stroke()
    }
    for (let i = 0; i < 900; i++) {
      const t = Math.pow(r(), 0.6)
      const py = top + 6 + t * (h - top - 6), px = r() * w
      const s = 0.6 + t * 2.4
      const k = r()
      c.fillStyle = k < 0.5 ? 'rgba(255,255,246,.9)' : k < 0.8 ? 'rgba(255,212,72,.9)' : 'rgba(196,140,220,.85)'
      c.beginPath(); c.arc(px, py, s, 0, Math.PI * 2); c.fill()
    }
  }
}

/** Ночные огни деревни: тёплые окна с ореолом, ложатся поверх пейзажа сложением цветов. */
export function drawVillageLights(c: CanvasRenderingContext2D, w: number, h: number) {
  const P = plan(w, h)
  const r = rng(57)
  for (const [x, y] of P.windows) {
    const g = c.createRadialGradient(x, y, 0, x, y, 9)
    g.addColorStop(0, 'rgba(255,196,120,.55)'); g.addColorStop(1, 'rgba(255,170,90,0)')
    c.fillStyle = g; c.fillRect(x - 9, y - 9, 18, 18)
    c.fillStyle = `rgba(255,${214 + r() * 30},${140 + r() * 40},1)`
    c.fillRect(x - 1, y - 1, 2.2, 2.2)
  }
  // Пара фонарей у дороги.
  for (let i = 0; i < 6; i++) {
    const hs = P.houses[Math.floor(r() * P.houses.length)]
    const x = hs.x + (r() - 0.5) * 50, y = hs.y + 3
    const g = c.createRadialGradient(x, y, 0, x, y, 14)
    g.addColorStop(0, 'rgba(255,220,160,.5)'); g.addColorStop(1, 'rgba(255,200,140,0)')
    c.fillStyle = g; c.fillRect(x - 14, y - 14, 28, 28)
  }
}
