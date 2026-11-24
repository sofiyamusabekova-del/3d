import { useEffect, useRef, useState } from 'react'
import type { PerspectiveCamera } from 'three'
import type { Apartment, Id } from '../domain/types'
import { releaseShotEngine, shotView, useQualityShot } from '../render/qualityStore'
import { cameraOf, snapshotKey } from '../render/snapshot'
import { interiorProbe } from '../scene3d/InteriorScene'
import { secondary, primary, field } from './styles'

const SAMPLE_CHOICES = [16, 64, 128, 256]
const OUTPUT_WIDTH = 960
const OUTPUT_MAX_HEIGHT = 720

shotView.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'

const seconds = (ms: number) => (ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })

/** Ключ текущего состояния редактора: по нему определяется, актуален ли снимок. */
function currentKey(apt: Apartment, roomId: Id): string | null {
  const cam = interiorProbe.camera as PerspectiveCamera | null
  return cam ? snapshotKey(apt, roomId, cameraOf(cam)) : null
}

/**
 * Режим «Качественный снимок» поверх 3D активной комнаты: кнопка, панель с прогрессом, отменой и
 * результатом. Изображение строится из текущего проекта и камеры; после изменения проекта, комнаты
 * или камеры оно помечается неактуальным (SPEC §13, D-09).
 */
export function QualityShot({ apt, roomId }: { apt: Apartment; roomId: Id }) {
  const s = useQualityShot()
  const host = useRef<HTMLDivElement>(null)
  const [key, setKey] = useState<string | null>(null)
  const running = s.status === 'preparing' || s.status === 'tracing'

  // Актуальность: ключ пересчитывается при смене проекта и периодически (камера двигается вне React).
  useEffect(() => {
    const tick = () => setKey(currentKey(apt, roomId))
    tick()
    const t = setInterval(tick, 300)
    return () => clearInterval(t)
  }, [apt, roomId])

  // Выход из интерьера отменяет съёмку и освобождает видеопамять трассировки.
  useEffect(() => releaseShotEngine, [])

  useEffect(() => {
    const el = host.current
    if (el && s.open && shotView.parentElement !== el) el.appendChild(shotView)
  }, [s.open, s.hasImage])

  const stale = !!s.snapshot && !running && s.status !== 'idle' && key !== null && key !== s.snapshot.key

  const begin = () => {
    const cam = interiorProbe.camera as PerspectiveCamera | null
    const gl = interiorProbe.gl
    const scene = interiorProbe.scene
    if (!cam || !gl || !scene) return
    // Кадр с теми же пропорциями, что у 3D-вида, но не больше 960 × 720 px: так кадрирование совпадает с редактором.
    const r = gl.domElement.getBoundingClientRect()
    const aspect = Math.max(0.2, r.width) / Math.max(1, r.height)
    let width = OUTPUT_WIDTH, height = Math.round(width / aspect)
    if (height > OUTPUT_MAX_HEIGHT) { height = OUTPUT_MAX_HEIGHT; width = Math.round(height * aspect) }
    s.start({ scene, apt, roomId, camera: cameraOf(cam), width: Math.max(2, width), height: Math.max(2, height) })
  }

  if (!s.open) {
    return (
      <button data-testid="quality-open" onClick={s.show} style={{ ...secondary, position: 'absolute', right: 8, top: 8, padding: '2px 8px', zIndex: 2 }}>
        Качественный снимок{s.hasImage ? (stale ? ' (устарел)' : ' ✓') : ''}
      </button>
    )
  }

  const pct = s.targetSamples > 0 ? Math.min(100, Math.round((s.samples / s.targetSamples) * 100)) : 0
  return (
    <div data-testid="quality-panel" style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 'inherit' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <b style={{ fontSize: 14 }}>Качественный снимок</b>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
          Выборок
          <select data-testid="quality-samples" value={s.targetSamples} disabled={running} onChange={(e) => s.setTarget(Number(e.target.value))} style={{ ...field, padding: '2px 6px', fontSize: 12 }}>
            {SAMPLE_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {!running && <button data-testid="quality-start" onClick={begin} style={{ ...primary, padding: '2px 10px' }}>{s.hasImage ? 'Снять заново' : 'Начать'}</button>}
        {running && <button data-testid="quality-cancel" onClick={s.cancel} style={{ ...secondary, padding: '2px 10px' }}>Отменить</button>}
        <button data-testid="quality-close" onClick={s.close} style={{ ...secondary, padding: '2px 10px', marginLeft: 'auto' }}>К редактору</button>
      </div>
      <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {s.status === 'idle' && <div data-testid="quality-hint">Снимок строится из текущего проекта и камеры браузерной трассировкой лучей; первый снимок дольше: видеокарта около полутора–двух минут готовит трассировку, следующие снимки идут быстрее (изображение на 16 выборках зернистое, с ростом числа выборок чище). Можно отменить в любой момент. Редактор не меняется.</div>}
        {s.status === 'preparing' && <div data-testid="quality-progress" role="status">Подготовка сцены…</div>}
        {s.status === 'tracing' && <div data-testid="quality-progress" role="status">{s.compiling ? 'Видеокарта готовит трассировку (только при первом снимке, может занять пару минут)' : `Выборок: ${s.samples} из ${s.targetSamples}`} · {seconds(s.elapsedMs)} с</div>}
        {s.status === 'done' && <div data-testid="quality-done" role="status">Готово: {s.samples} выборок за {seconds(s.elapsedMs)} с (подготовка {seconds(s.prepareMs)} с{s.compileMs > 500 ? `, из них подготовка видеокарты ${seconds(s.compileMs)} с` : ''}), {s.snapshot?.width} × {s.snapshot?.height} px, комната «{s.snapshot?.roomName}».</div>}
        {s.status === 'cancelled' && <div data-testid="quality-cancelled" role="status">Снимок отменён{s.hasImage ? `: показано накопленное (${s.samples} выборок)` : ''}. Редактор работает как прежде.</div>}
        {s.status === 'error' && <div data-testid="quality-error" role="alert" style={{ color: 'var(--danger)' }}>Снимок не построен: {s.message}. Редактор работает как прежде.</div>}
        {stale && <div data-testid="quality-stale" role="status" style={{ color: 'var(--warn, #e0a82e)' }}>Снимок неактуален: проект, комната или камера изменились после съёмки. Нажмите «Снять заново».</div>}
        {running && <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2 }}><div data-testid="quality-bar" style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} /></div>}
      </div>
      <div ref={host} data-testid="quality-image" data-stale={stale ? 'true' : 'false'} style={{ flex: 1, minHeight: 0, opacity: stale ? 0.45 : 1, display: s.hasImage || running ? 'block' : 'none' }} />
    </div>
  )
}
