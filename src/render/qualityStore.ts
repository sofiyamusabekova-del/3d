import { create } from 'zustand'
import type * as THREE from 'three'
import type { Apartment, Id } from '../domain/types'
import { takeSnapshot, type ShotCamera, type ShotSnapshot } from './snapshot'

export type ShotStatus = 'idle' | 'preparing' | 'tracing' | 'done' | 'cancelled' | 'error'

/** Холст с накопленным изображением живёт вне React: результат переживает закрытие панели. */
export const shotView: HTMLCanvasElement = document.createElement('canvas')

export interface ShotState {
  status: ShotStatus
  /** Панель снимка открыта поверх 3D. */
  open: boolean
  targetSamples: number
  samples: number
  elapsedMs: number
  prepareMs: number
  /** Шейдер трассировки ещё компилируется; сколько это заняло в последнем снимке. */
  compiling: boolean
  compileMs: number
  message: string | null
  /** Снимок, по которому построено текущее изображение. */
  snapshot: ShotSnapshot | null
  hasImage: boolean
  setTarget: (n: number) => void
  start: (src: { scene: THREE.Scene; apt: Apartment; roomId: Id; camera: ShotCamera; width: number; height: number }) => void
  cancel: () => void
  close: () => void
  show: () => void
}

let controller: AbortController | null = null
let engineLoaded = false

/** Освобождает видеопамять трассировки (выход из интерьера); загружает модуль только если он уже использовался. */
export function releaseShotEngine() {
  controller?.abort()
  if (engineLoaded) void import('./qualityShot').then((m) => m.releaseQualityEngine())
}
const running = (s: ShotStatus) => s === 'preparing' || s === 'tracing'

/**
 * Состояние режима «Качественный снимок». Не часть проекта и не попадает в историю (SPEC §13).
 * Трассировка подгружается отдельным модулем только по запросу.
 */
export const useQualityShot = create<ShotState>((set, get) => ({
  status: 'idle',
  open: false,
  targetSamples: 16, // первая съёмка ~100 с уходит на компиляцию шейдера (уточнение 16.11, docs/reports/stage16-17.md); по умолчанию минимум
  samples: 0,
  elapsedMs: 0,
  prepareMs: 0,
  compiling: false,
  compileMs: 0,
  message: null,
  snapshot: null,
  hasImage: false,
  setTarget: (n) => set({ targetSamples: n }),
  show: () => set({ open: true }),
  close: () => set({ open: false }),
  cancel: () => controller?.abort(),
  start: ({ scene, apt, roomId, camera, width, height }) => {
    if (running(get().status)) return
    const snapshot = takeSnapshot(apt, roomId, camera, { width, height })
    controller = new AbortController()
    const { signal } = controller
    set({ status: 'preparing', open: true, snapshot, samples: 0, elapsedMs: 0, prepareMs: 0, compiling: false, compileMs: 0, message: null })
    void (async () => {
      try {
        const { runQualityShot } = await import('./qualityShot')
        engineLoaded = true
        const done = await runQualityShot({
          source: scene, snapshot, targetSamples: get().targetSamples, signal, view: shotView,
          onProgress: (p) => set({ status: p.phase === 'prepare' ? 'preparing' : 'tracing', samples: p.samples, elapsedMs: p.elapsedMs, compiling: !!p.compiling }),
        })
        set({ status: 'done', samples: done.samples, elapsedMs: done.elapsedMs, prepareMs: done.prepareMs, compileMs: done.compileMs, compiling: false, hasImage: true })
      } catch (e) {
        if (e instanceof Error && e.name === 'ShotCancelled') set({ compiling: false, status: 'cancelled', message: 'Снимок отменён.', hasImage: get().samples > 0 })
        else set({ compiling: false, status: 'error', message: e instanceof Error ? e.message : String(e), hasImage: false })
      } finally {
        controller = null
      }
    })()
  },
}))
