import * as THREE from 'three'
import { BOARD_CM, BOARD_ROWS, FLOORS } from '../catalog/floors'
import type { FloorKind } from '../domain/types'
import { mulberry32 } from './worldLayout'

/**
 * Процедурные текстуры пола (этап 23, SPEC D-16): рисуются на холсте при первом показе, файлы не загружаются.
 * Рисунок задан в физических размерах: ламинат — доски 19 × 120 см со смещением швов, линолеум — мелкая крапинка
 * на 100 × 100 см, ковролин — ворс на 50 × 50 см. Повтор текстуры считается из размера образца в см.
 */

/** Ряды досок ламината: смещение шва по длине (см, от края образца) и отклонение тона доски. Детерминировано. */
export const LAMINATE_ROWS: ReadonlyArray<{ seamCm: number; tone: number }> = [
  { seamCm: 0, tone: 0 },
  { seamCm: 44, tone: -0.06 },
  { seamCm: 86, tone: 0.05 },
  { seamCm: 23, tone: -0.025 },
].slice(0, BOARD_ROWS)

const shade = (hex: string, k: number): string => {
  const c = new THREE.Color(hex)
  const f = (v: number) => Math.min(1, Math.max(0, v * (1 + k)))
  return `#${new THREE.Color(f(c.r), f(c.g), f(c.b)).getHexString()}`
}

function draw(kind: FloorKind, hex: string): HTMLCanvasElement {
  const def = FLOORS[kind]
  const pxPerCm = kind === 'laminate' ? 8 : kind === 'linoleum' ? 5 : 10
  const W = Math.round(def.tileCm.widthCm * pxPerCm), H = Math.round(def.tileCm.heightCm * pxPerCm)
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const g = canvas.getContext('2d')!
  const rnd = mulberry32(kind === 'laminate' ? 7 : kind === 'linoleum' ? 11 : 13)
  g.fillStyle = hex
  g.fillRect(0, 0, W, H)

  if (kind === 'laminate') {
    const rowH = BOARD_CM.widthCm * pxPerCm
    LAMINATE_ROWS.forEach((row, i) => {
      const y = i * rowH
      g.fillStyle = shade(hex, row.tone)
      g.fillRect(0, y, W, rowH)
      // Волокна: тонкие волнистые линии вдоль доски.
      for (let n = 0; n < 70; n++) {
        const yy = y + rnd() * rowH
        const amp = 0.4 + rnd() * 1.4
        const ph = rnd() * 6.28
        g.strokeStyle = rnd() < 0.5 ? `rgba(40,25,10,${0.05 + rnd() * 0.08})` : `rgba(255,240,215,${0.04 + rnd() * 0.07})`
        g.lineWidth = 0.5 + rnd() * 1.2
        g.beginPath()
        for (let x = 0; x <= W; x += 24) {
          const yv = yy + Math.sin(x / 90 + ph) * amp
          if (x === 0) g.moveTo(x, yv); else g.lineTo(x, yv)
        }
        g.stroke()
      }
      // Шов между рядами и торцевой шов доски (по смещению ряда).
      g.fillStyle = 'rgba(25,15,8,0.55)'
      g.fillRect(0, y, W, 1.5)
      // Торец доски только по смещению ряда; на краю образца доска продолжается в следующий повтор без шва.
      const sx = row.seamCm * pxPerCm
      if (sx < 1) { g.fillRect(0, y, 0.75, rowH); g.fillRect(W - 0.75, y, 0.75, rowH) } else g.fillRect(sx - 0.75, y, 1.5, rowH)
    })
  } else if (kind === 'linoleum') {
    const dots = (n: number, alpha: number, light: boolean) => {
      for (let i = 0; i < n; i++) {
        const x = rnd() * W, y = rnd() * H, r = 0.5 + rnd() * 1.4
        g.fillStyle = light ? `rgba(255,255,255,${alpha * (0.5 + rnd())})` : `rgba(0,0,0,${alpha * (0.5 + rnd())})`
        // Рисуем с переносом через край, чтобы образец стыковался.
        for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 6.283); g.fill() }
      }
    }
    dots(2600, 0.16, true)
    dots(2600, 0.12, false)
  } else {
    // Ковролин: короткие штрихи ворса разной длины и направления.
    for (let i = 0; i < 14000; i++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * 6.283, l = 2 + rnd() * 5
      g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.1})` : `rgba(0,0,0,${0.05 + rnd() * 0.12})`
      g.lineWidth = 0.8 + rnd() * 1.1
      for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
        g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke()
      }
    }
  }
  return canvas
}

export interface FloorTexture {
  map: THREE.Texture
  /** Повторов на метр координат пола: из физического размера образца. */
  repeat: [number, number]
}

const cache = new Map<string, FloorTexture>()

/** Текстура покрытия; null вне браузера (нет холста). Хранится в кеше: у каждого сочетания вида и цвета одна текстура. */
export function floorTexture(kind: FloorKind, colorId: string): FloorTexture | null {
  const color = FLOORS[kind]?.colors.find((c) => c.id === colorId)
  if (!color || typeof document === 'undefined') return null
  const key = `${kind}:${colorId}`
  let t = cache.get(key)
  if (!t) {
    const map = new THREE.CanvasTexture(draw(kind, color.hex))
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    const tile = FLOORS[kind].tileCm
    // Координаты пола в метрах: повторов на метр = 100 / размер образца в см.
    map.repeat.set(100 / tile.widthCm, 100 / tile.heightCm)
    t = { map, repeat: [100 / tile.widthCm, 100 / tile.heightCm] }
    cache.set(key, t)
  }
  return t
}

/** Освобождает все текстуры пола (выход из шага «Интерьер», тесты). */
export function disposeFloorTextures() {
  for (const t of cache.values()) t.map.dispose()
  cache.clear()
}
