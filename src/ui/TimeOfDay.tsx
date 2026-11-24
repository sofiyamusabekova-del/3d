import { useEffect, useRef, useState } from 'react'
import { selectApartment } from '../domain/store'
import { useApartmentProject } from '../scenario/flow'
import { useInterior } from '../scenario/interior'
import { daylightAt, formatHour, HOUR_PRESETS } from '../scene3d/daylight'

/** Выключатель комнаты (D-11): включает и выключает весь искусственный свет активной комнаты; у каждой комнаты своё состояние. */
function LightSwitch() {
  const roomId = useInterior((s) => s.activeRoomId)
  const off = useInterior((s) => Boolean(roomId && s.lightsOff[roomId]))
  const toggle = useInterior((s) => s.toggleLights)
  const summary = useInterior((s) => s.lightSummary)
  if (!roomId) return null
  return (
    <button
      data-testid="lights-toggle" aria-pressed={!off} onClick={() => toggle(roomId)}
      title={summary.total > summary.active && !off ? `Светят ${summary.active} из ${summary.total}: больше ${summary.active} источников сразу не включается` : 'Выключатель комнаты'}
      style={{ padding: '2px 10px', borderRadius: 6, border: '1px solid var(--border-strong)', background: off ? 'transparent' : 'rgba(242, 193, 78, 0.22)', color: 'inherit', cursor: 'pointer', fontSize: 12 }}
    >
      Свет: {off ? 'выкл' : 'вкл'}
      {!off && summary.total > summary.active ? ` (${summary.active} из ${summary.total})` : ''}
    </button>
  )
}

/** Кнопка режима «Прогулка» (D-17) и подсказка по управлению, пока режим включён. */
function WalkButton() {
  const walking = useInterior((s) => s.walking)
  const start = useInterior((s) => s.startWalk)
  const stop = useInterior((s) => s.stopWalk)
  return (
    <button
      data-testid="walk-toggle" aria-pressed={walking} onClick={() => (walking ? stop() : start())}
      title="Вид от первого лица по всей квартире"
      style={{ padding: '2px 10px', borderRadius: 6, border: '1px solid var(--border-strong)', background: walking ? 'var(--accent-soft)' : 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 }}
    >{walking ? 'Выйти из прогулки' : 'Прогулка'}</button>
  )
}

/** Панель 3D, которую разворачивает кнопка «На весь экран»: ближайший предок с этим атрибутом. */
const FS_ROOT = '[data-fullscreen-root]'
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

function toggleFullscreen(from: Element | null) {
  if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return }
  const root = from?.closest(FS_ROOT) ?? document.querySelector(FS_ROOT)
  if (root instanceof HTMLElement && root.requestFullscreen) void root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
}

/**
 * Полноэкранный режим 3D (вместе с прогулкой, временем суток и подсказкой). В прогулке его же переключает клавиша F,
 * выход — Esc или та же кнопка. Холст подстраивается под размер сам (R3F следит за размером контейнера).
 */
function FullscreenButton() {
  const ref = useRef<HTMLButtonElement>(null)
  const [full, setFull] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target) || !useInterior.getState().walking) return
      if (e.code === 'KeyF') { e.preventDefault(); toggleFullscreen(ref.current) }
    }
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('fullscreenchange', on); window.removeEventListener('keydown', onKey) }
  }, [])
  if (typeof document !== 'undefined' && !document.fullscreenEnabled) return null
  return (
    <button
      ref={ref} data-testid="fullscreen-toggle" aria-pressed={full} onClick={(e) => toggleFullscreen(e.currentTarget)}
      title={full ? 'Выйти из полноэкранного режима (Esc)' : 'Развернуть 3D на весь экран (в прогулке — клавиша F)'}
      style={{ padding: '2px 10px', borderRadius: 6, border: '1px solid var(--border-strong)', background: full ? 'var(--accent-soft)' : 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 }}
    >{full ? 'Свернуть' : 'На весь экран'}</button>
  )
}

/** Подсказка над 3D в прогулке: управление и комната, в которой стоит игрок. */
export function WalkHint() {
  const walking = useInterior((s) => s.walking)
  const walkRoomId = useInterior((s) => s.walkRoomId)
  const roomName = useApartmentProject((s) => (walkRoomId ? selectApartment(s).rooms[walkRoomId]?.name ?? null : null))
  if (!walking) return null
  return (
    <div
      data-testid="walk-hint" role="status"
      style={{ position: 'absolute', left: 8, right: 8, top: 8, padding: '6px 10px', borderRadius: 'var(--radius)', background: 'rgba(15, 17, 23, 0.88)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-1)', fontSize: 'var(--text-sm)', pointerEvents: 'none' }}
    >
      <b data-testid="walk-room">{roomName ?? 'Дверной проём'}</b>. W A S D или стрелки — ходьба, Shift — быстрее, мышь с зажатой кнопкой — обзор, F — на весь экран, Esc — выход.
    </div>
  )
}

/**
 * Время суток над 3D (этап 20): ползунок 0–24 ч и быстрые кнопки. Меняет солнце, тени, небо и вид за окнами;
 * не часть проекта и не попадает в историю отмены.
 */
export function TimeOfDay() {
  const hour = useInterior((s) => s.hour)
  const setHour = useInterior((s) => s.setHour)
  const alt = daylightAt(hour).sun.altitudeDeg
  return (
    <div
      data-testid="time-of-day" aria-label="Время суток"
      style={{
        position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '6px 10px', borderRadius: 'var(--radius)', background: 'rgba(15, 17, 23, 0.88)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-1)', fontSize: 'var(--text-sm)',
      }}
    >
      <output data-testid="time-label" style={{ minWidth: 44, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatHour(hour)}</output>
      <input
        data-testid="time-slider" type="range" min={0} max={24} step={0.25} value={hour} aria-label="Время суток, часы"
        aria-valuetext={`${formatHour(hour)}, солнце ${alt > 0 ? `на ${Math.round(alt)}° над горизонтом` : 'за горизонтом'}`}
        onChange={(e) => setHour(Number(e.target.value))} style={{ flex: '1 1 120px', minWidth: 100, accentColor: 'var(--accent, #5b9dff)' }}
      />
      <LightSwitch />
      <WalkButton />
      <FullscreenButton />
      <span style={{ display: 'flex', gap: 4 }}>
        {HOUR_PRESETS.map((p) => (
          <button
            key={p.label} data-testid={`time-${p.label}`} onClick={() => setHour(p.hour)}
            style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 }}
          >{p.label}</button>
        ))}
      </span>
    </div>
  )
}
