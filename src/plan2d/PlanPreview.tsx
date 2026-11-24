import { useEffect, useMemo, useRef, useState } from 'react'
import type { Apartment } from '../domain/types'
import { formatCm } from '../geometry/units'
import { planDrawing } from './drawing'
import { PlanGeometry, PlanLabels } from './PlanStatic'
import { fitViewport, panBy, zoomAt, type Viewport } from './view'

/**
 * Показ квартиры на плане без редактирования (превью схем, шаг настройки). С `interactive`
 * работают масштаб колесом и сдвиг; без него вид всегда вписан в область.
 */
export function PlanPreview({ apartment, interactive = false, labels = false, testId = 'plan-preview', selectedWallId = null, selectedWallIds = [], onSelectWall, selectedOpeningId = null, onSelectOpening, openingLabel }: {
  apartment: Apartment
  interactive?: boolean
  labels?: boolean
  testId?: string
  /** Выбор стен (шаг настройки): клик по стене выбирает, клик по пустому месту снимает выбор. */
  selectedWallId?: string | null
  selectedWallIds?: string[]
  onSelectWall?: (wallId: string | null) => void
  /** Выбор проёма (шаг настройки): клик по окну или двери; подпись выбранного (отступ от угла) задаёт родитель. */
  selectedOpeningId?: string | null
  onSelectOpening?: (openingId: string) => void
  openingLabel?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [vp, setVp] = useState<Viewport | null>(null)
  const drawing = useMemo(() => planDrawing(apartment), [apartment])
  const selectedWall = selectedWallId ? drawing.walls.find((w) => w.id === selectedWallId) : undefined
  const selectedOpening = selectedOpeningId ? drawing.openings.find((o) => o.id === selectedOpeningId) : undefined

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Вписываем при смене размера области или самой квартиры; пользовательский вид живёт до этого.
  // Ключ по значениям границ: новый объект квартиры с теми же границами (предпросмотр) вид не сбрасывает.
  const b = drawing.bounds
  const boundsKey = `${b.minX},${b.minZ},${b.maxX},${b.maxZ}`
  useEffect(() => {
    if (size.w > 0 && size.h > 0) setVp(fitViewport(drawing.bounds, size.w, size.h, 12))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, size.w, size.h])

  useEffect(() => {
    const el = wrap.current
    if (!el || !interactive) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setVp((v) => (v ? zoomAt(v, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)) : v))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [interactive])

  const startPan = (e: React.PointerEvent) => {
    if (!interactive) return
    let lastX = e.clientX
    let lastY = e.clientY
    const downX = e.clientX
    const downY = e.clientY
    const pickedOpening = (e.target as Element).closest('[data-pick-opening]')?.getAttribute('data-pick-opening') ?? null
    const pickedWall = (e.target as Element).closest('[data-pick-wall]')?.getAttribute('data-pick-wall') ?? null
    const move = (ev: PointerEvent) => {
      setVp((v) => (v ? panBy(v, ev.clientX - lastX, ev.clientY - lastY) : v))
      lastX = ev.clientX
      lastY = ev.clientY
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      // Короткое нажатие без сдвига — выбор, длинное — панорамирование.
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) >= 4) return
      if (pickedOpening && onSelectOpening) onSelectOpening(pickedOpening)
      else if (onSelectWall) onSelectWall(pickedWall)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {vp && (
        <svg
          data-testid={testId}
          width={size.w}
          height={size.h}
          viewBox={`${vp.xCm} ${vp.zCm} ${size.w / vp.pxPerCm} ${size.h / vp.pxPerCm}`}
          style={{ position: 'absolute', left: 0, top: 0, touchAction: 'none', background: 'var(--surface)', cursor: interactive ? 'grab' : 'default' }}
          onPointerDown={startPan}
        >
          <PlanGeometry drawing={drawing} selectedWallIds={selectedWallIds} selectedWallId={selectedWallId} selectedOpeningId={selectedOpeningId} />
          {labels && <PlanLabels drawing={drawing} px={(n) => n / vp.pxPerCm} />}
          {selectedWall && (
            <text
              data-testid="plan-wall-length"
              x={(Math.min(...selectedWall.polygon.map((p) => p.x)) + Math.max(...selectedWall.polygon.map((p) => p.x))) / 2}
              y={(Math.min(...selectedWall.polygon.map((p) => p.z)) + Math.max(...selectedWall.polygon.map((p) => p.z))) / 2}
              fontSize={14 / vp.pxPerCm} fontWeight={700} textAnchor="middle" fill="var(--text)" stroke="var(--surface)" strokeWidth={3}
              paintOrder="stroke" pointerEvents="none"
            >{formatCm(selectedWall.lengthCm)}</text>
          )}
          {selectedOpening && openingLabel && (
            <text
              data-testid="plan-opening-label"
              x={(Math.min(...selectedOpening.cut.map((p) => p.x)) + Math.max(...selectedOpening.cut.map((p) => p.x))) / 2}
              y={Math.min(...selectedOpening.cut.map((p) => p.z)) - 6 / vp.pxPerCm}
              fontSize={13 / vp.pxPerCm} fontWeight={700} textAnchor="middle" fill="var(--text)" stroke="var(--surface)" strokeWidth={3}
              paintOrder="stroke" pointerEvents="none"
            >{openingLabel}</text>
          )}
          {onSelectWall && drawing.walls.map((w) => (
            // Невидимая область нажатия шире самой стены: 10-сантиметровую перегородку иначе не поймать.
            <polygon
              key={w.id} data-pick-wall={w.id} data-testid={`pick-wall-${w.id}`} points={w.polygon.map((p) => `${p.x},${p.z}`).join(' ')}
              fill="transparent" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" pointerEvents="all" style={{ cursor: 'pointer' }}
            />
          ))}
          {onSelectOpening && drawing.openings.map((o) => (
            // Проёмы выбираются поверх стен: область нажатия рисуется последней.
            <polygon
              key={o.id} data-pick-opening={o.id} data-testid={`pick-opening-${o.id}`} points={o.cut.map((p) => `${p.x},${p.z}`).join(' ')}
              fill="transparent" stroke="transparent" strokeWidth={8} vectorEffect="non-scaling-stroke" pointerEvents="all" style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>
      )}
      {interactive && vp && (
        <button
          data-testid={`${testId}-fit`}
          onClick={() => setVp(fitViewport(drawing.bounds, size.w, size.h, 12))}
          style={{ position: 'absolute', right: 8, bottom: 8, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', padding: '2px 8px' }}
        >Вписать</button>
      )}
    </div>
  )
}
