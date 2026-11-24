import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TECH_CATALOG } from '../catalog/techCatalog'
import { selectApartment } from '../domain/store'
import { useEditor, useProject } from '../prototype/session'
import { planDrawing } from './drawing'
import { PlanGeometry, PlanLabels } from './PlanStatic'
import { fitViewport, panBy, screenToPlan as viewToPlan, zoomAt, type Viewport } from './view'

/** Перевод экранной точки в координаты проекта (см) через матрицу SVG: не зависит от масштаба. */
export function screenToPlan(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; z: number } {
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, z: 0 }
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
  return { x: p.x, z: p.y }
}

type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number }

export interface PlanSurface {
  key: string
  roomId: string
  /** Первый участок стороны: по нему сторона выбирается. */
  wallId: string
  strip: Array<{ x: number; z: number }>
  /** Цвет образца или null, если отделки нет. */
  color: string | null
  selected: boolean
}

/**
 * План с редактированием предметов. Без параметров — план технической сцены; в интерьере
 * передаются проект, редактор, активная комната (остальные приглушены и выбираются нажатием)
 * и область, в которую вписывается вид.
 */
export function PlanView({
  project = useProject, editor = useEditor, catalog = TECH_CATALOG, testId = 'plan',
  activeRoomId, onPickRoom, focusBounds, focusKey, surfaces, onPickSurface, markers, activeMarker, dims, notes, selectedNote, onSelectNote, onMoveNote,
}: {
  /** Заметки на плане (D-35): рисуются поверх, тянутся мышью. */
  notes?: Array<{ id: string; xCm: number; zCm: number; text: string }>
  selectedNote?: string | null
  onSelectNote?: (id: string) => void
  onMoveNote?: (id: string, xCm: number, zCm: number) => void
  /** Линии размеров от выбранного предмета (см. domain/dimensions). */
  dims?: Array<{ x1: number; z1: number; x2: number; z2: number; cm: number }>
  /** Отметки на плане (замечания по проходам). */
  markers?: Array<{ key: string; xCm: number; zCm: number }>
  activeMarker?: string | null
  /** Отделка стен: полосы вдоль внутренней стороны стен (SPEC §13); у активной комнаты их можно выбирать. */
  surfaces?: PlanSurface[]
  onPickSurface?: (wallId: string) => void
  project?: typeof useProject
  editor?: typeof useEditor
  catalog?: typeof TECH_CATALOG
  testId?: string
  activeRoomId?: string | null
  onPickRoom?: (roomId: string) => void
  focusBounds?: Bounds | null
  /** Смена ключа заново вписывает вид в focusBounds; без ключа вид вписывается один раз. */
  focusKey?: string
}) {
  const apt = project(selectApartment)
  const { selectedId, draft, select, beginDrag, beginRotate, rotateTo, moveDrag, endDrag } = editor()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [noteDrag, setNoteDrag] = useState<{ id: string; xCm: number; zCm: number } | null>(null)
  const [vp, setVp] = useState<Viewport | null>(null)
  const drawing = useMemo(() => planDrawing(apt), [apt])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const target = focusBounds ?? drawing.bounds
  const fit = useCallback(() => setVp(fitViewport(target, size.w, size.h)), [target, size.w, size.h])
  // Вписывание после появления размера и при смене ключа; дальше вид меняет только пользователь.
  const fittedKey = useRef<string | null>(null)
  useEffect(() => {
    const key = focusKey ?? 'static'
    if (size.w > 0 && size.h > 0 && (!vp || fittedKey.current !== key)) { fittedKey.current = key; fit() }
  }, [vp, size.w, size.h, fit, focusKey])

  // Колесо: масштаб вокруг указателя. Слушатель не пассивный, чтобы страница не прокручивалась.
  useEffect(() => {
    const el = wrapRef.current // svg появляется позже, поэтому слушаем контейнер
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setVp((v) => (v ? zoomAt(v, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)) : v))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Перенос предмета принадлежит плану, если начат на плане; из каталога — пока указатель над планом.
  const dragView = draft?.view
  useEffect(() => {
    if (dragView !== 'plan' && dragView !== 'catalog') return
    const move = (e: PointerEvent) => {
      const svg = svgRef.current
      if (!svg) return
      if (dragView === 'catalog') {
        const r = svg.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
      }
      const p = screenToPlan(svg, e.clientX, e.clientY)
      const d = editor.getState().draft
      if (d?.mode === 'rotate') rotateTo((Math.atan2(-(p.x - d.xCm), -(p.z - d.zCm)) * 180) / Math.PI, e.altKey)
      else moveDrag(p, e.altKey)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', endDrag)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', endDrag)
    }
  }, [dragView, moveDrag, rotateTo, endDrag]) // eslint-disable-line react-hooks/exhaustive-deps

  // Сдвиг вида: тянуть за пустое место; клик без движения снимает выбор.
  const startPan = (e: React.PointerEvent) => {
    let lastX = e.clientX
    let lastY = e.clientY
    let moved = false
    const pickedRoom = (e.target as Element).closest('[data-pick-room]')?.getAttribute('data-pick-room') ?? null
    const pickedSurface = (e.target as Element).closest('[data-pick-surface]')?.getAttribute('data-pick-surface') ?? null
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 3) moved = true
      if (moved) setVp((v) => (v ? panBy(v, ev.clientX - lastX, ev.clientY - lastY) : v))
      lastX = ev.clientX
      lastY = ev.clientY
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (moved) return
      if (pickedSurface && onPickSurface) onPickSurface(pickedSurface)
      else if (pickedRoom && onPickRoom) onPickRoom(pickedRoom)
      else { select(null); onPickSurface?.('') }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const s = vp?.pxPerCm ?? 1
  const px = (n: number) => n / s // размер в см для постоянной величины в пикселях экрана

  const rect = (xCm: number, zCm: number, angleDeg: number, w: number, d: number, props: React.SVGProps<SVGRectElement>) => (
    <g transform={`translate(${xCm} ${zCm}) rotate(${-angleDeg})`}>
      <rect x={-w / 2} y={-d / 2} width={w} height={d} vectorEffect="non-scaling-stroke" {...props} />
      {/* Передняя сторона предмета (+z локально) — чтобы поворот был виден. */}
      <line x1={-w / 2} y1={d / 2} x2={w / 2} y2={d / 2} stroke="var(--accent)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
    </g>
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {vp && (
        <svg
          ref={svgRef}
          data-testid={testId}
          width={size.w}
          height={size.h}
          viewBox={`${vp.xCm} ${vp.zCm} ${size.w / vp.pxPerCm} ${size.h / vp.pxPerCm}`}
          style={{ position: 'absolute', left: 0, top: 0, touchAction: 'none', background: 'var(--plan-bg)' }}
          onPointerDown={startPan}
        >
          <PlanGeometry drawing={drawing} />
          {surfaces?.filter((s) => s.roomId !== activeRoomId).map((s) => <SurfaceStrip key={s.key} s={s} />)}
          {activeRoomId && drawing.rooms.filter((r) => r.id !== activeRoomId).map((r) => (
            // Остальные комнаты приглушены; нажатие на них переводит в комнату (SPEC §10.1).
            <polygon
              key={r.id} data-pick-room={r.id} data-testid={`pick-room-${r.id}`} points={r.polygon.map((p) => `${p.x},${p.z}`).join(' ')}
              fill="rgb(8, 9, 12)" fillOpacity={0.6} pointerEvents="all" style={{ cursor: onPickRoom ? 'pointer' : 'default' }}
            />
          ))}
          {surfaces?.filter((s) => s.roomId === activeRoomId).map((s) => <SurfaceStrip key={s.key} s={s} pickable={!!onPickSurface} />)}
          {/* Настольные предметы рисуются поверх опоры и первыми получают нажатие. */}
          {Object.values(apt.furniture).sort((p, q) => p.elevationCm - q.elevationCm).map((f) => {
            const item = catalog[f.catalogItemId]
            if (!item) return null
            const dragging = draft?.id === f.id
            const foreign = !!activeRoomId && f.roomId !== activeRoomId
            return (
              <g
                key={f.id}
                data-testid={`plan-item-${f.id}`}
                data-room={f.roomId}
                style={{ cursor: foreign ? 'default' : 'grab', opacity: dragging ? 0.35 : foreign ? 0.4 : 1 }}
                pointerEvents={foreign ? 'none' : undefined}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  if (svgRef.current) beginDrag({ id: f.id }, screenToPlan(svgRef.current, e.clientX, e.clientY), 'plan')
                }}
              >
                {rect(f.xCm, f.zCm, f.angleDeg, item.widthCm, item.depthCm, {
                  fill: 'var(--plan-furniture)',
                  stroke: f.id === selectedId ? 'var(--accent)' : 'var(--plan-furniture-edge)',
                  strokeWidth: f.id === selectedId ? 3 : 1.5,
                })}
                <text x={f.xCm} y={f.zCm} fill="var(--text)" fontSize={px(11)} textAnchor="middle" dominantBaseline="middle" pointerEvents="none" stroke="var(--bg)" strokeWidth={px(2.5)} strokeLinejoin="round" paintOrder="stroke">
                  {item.name}
                </text>
                {f.id === selectedId && !foreign && (!draft || draft.id === f.id) && (
                  // Ручка поворота: за заднюю сторону предмета; привязка 15°, Alt — свободный угол (D-10).
                  <g transform={`translate(${f.xCm} ${f.zCm}) rotate(${-(draft?.id === f.id ? draft.angleDeg : f.angleDeg)})`}>
                    <line x1={0} y1={-item.depthCm / 2} x2={0} y2={-item.depthCm / 2 - px(20)} stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                    <circle
                      data-testid="rotate-handle" cx={0} cy={-item.depthCm / 2 - px(20)} r={px(7)} fill="var(--accent)" style={{ cursor: 'crosshair' }}
                      onPointerDown={(e) => { e.stopPropagation(); beginRotate(f.id, 'plan') }}
                    />
                  </g>
                )}
              </g>
            )
          })}
          {draft &&
            rect(draft.xCm, draft.zCm, draft.angleDeg, catalog[draft.catalogItemId].widthCm, catalog[draft.catalogItemId].depthCm, {
              fill: draft.result.valid ? 'rgba(79,209,139,0.35)' : 'rgba(255,93,93,0.45)',
              stroke: draft.result.valid ? 'var(--ok)' : 'var(--danger)',
              strokeWidth: 2.5,
              pointerEvents: 'none',
            })}
          <PlanLabels drawing={drawing} px={px} />
          {notes?.map((n) => {
            // Заметка: флажок с подписью; тянется мышью, нажатие выбирает её (D-35).
            const p = noteDrag?.id === n.id ? noteDrag : n
            const on = n.id === selectedNote
            return (
              <g
                key={n.id} data-testid={`plan-note-${n.id}`} style={{ cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onSelectNote?.(n.id)
                  const svg = svgRef.current
                  if (!svg || !onMoveNote) return
                  const move = (ev: PointerEvent) => { const q = screenToPlan(svg, ev.clientX, ev.clientY); setNoteDrag({ id: n.id, xCm: q.x, zCm: q.z }) }
                  const up = (ev: PointerEvent) => {
                    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
                    const q = screenToPlan(svg, ev.clientX, ev.clientY)
                    setNoteDrag(null)
                    if (Math.hypot(q.x - n.xCm, q.z - n.zCm) > px(3)) onMoveNote(n.id, Math.round(q.x), Math.round(q.z))
                  }
                  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
                }}
              >
                <path
                  d={`M ${p.xCm} ${p.zCm} v ${-px(22)} h ${px(16)} l ${-px(4)} ${px(5)} l ${px(4)} ${px(5)} h ${-px(16)}`}
                  fill="#ffd54a" stroke={on ? 'var(--accent)' : '#7a5c00'} strokeWidth={on ? 2.5 : 1.2} vectorEffect="non-scaling-stroke"
                />
                <text x={p.xCm + px(20)} y={p.zCm - px(14)} fill="var(--text)" fontSize={px(12)} dominantBaseline="central" stroke="var(--bg)" strokeWidth={px(3)} strokeLinejoin="round" paintOrder="stroke">{n.text}</text>
              </g>
            )
          })}
          {dims?.map((d, i) => {
            // Размеры от выбранного предмета до стен и соседей: линия с засечками и подпись по центру.
            const len = Math.hypot(d.x2 - d.x1, d.z2 - d.z1) || 1
            const nx = -(d.z2 - d.z1) / len, nz = (d.x2 - d.x1) / len
            const tick = (x: number, z: number) => <line x1={x - nx * px(4)} y1={z - nz * px(4)} x2={x + nx * px(4)} y2={z + nz * px(4)} stroke="#6cb6ff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            return (
              <g key={i} data-testid="plan-dim" data-cm={d.cm} pointerEvents="none">
                <line x1={d.x1} y1={d.z1} x2={d.x2} y2={d.z2} stroke="#6cb6ff" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                {tick(d.x1, d.z1)}{tick(d.x2, d.z2)}
                <text x={(d.x1 + d.x2) / 2} y={(d.z1 + d.z2) / 2} fill="#6cb6ff" fontSize={px(11)} textAnchor="middle" dominantBaseline="central" stroke="var(--bg)" strokeWidth={px(3)} strokeLinejoin="round" paintOrder="stroke">{d.cm} см</text>
              </g>
            )
          })}
          {markers?.map((m) => (
            // Замечания по проходам: янтарное кольцо с «!», не перехватывает указатель.
            <g key={m.key} data-testid={`plan-marker-${m.key}`} pointerEvents="none">
              <circle cx={m.xCm} cy={m.zCm} r={px(m.key === activeMarker ? 14 : 10)} fill="rgba(255,176,32,0.25)" stroke="#ffb020" strokeWidth={m.key === activeMarker ? 3 : 2} vectorEffect="non-scaling-stroke" />
              <text x={m.xCm} y={m.zCm} fill="#ffb020" fontSize={px(12)} fontWeight={700} textAnchor="middle" dominantBaseline="central" stroke="var(--bg)" strokeWidth={px(2.5)} strokeLinejoin="round" paintOrder="stroke">!</text>
            </g>
          ))}
        </svg>
      )}
      <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        <span data-testid={`${testId}-scale`}>{vp ? `${vp.pxPerCm.toFixed(2)} пикс/см` : ''}</span>
        <button onClick={fit} data-testid={`${testId}-fit`} style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', cursor: 'pointer', padding: '2px 8px' }}>Вписать</button>
      </div>
    </div>
  )
}

/** Полоса отделки вдоль стороны стены; невидимая область шире полосы, чтобы тонкую стену было легко выбрать. */
function SurfaceStrip({ s, pickable = false }: { s: PlanSurface; pickable?: boolean }) {
  const points = s.strip.map((p) => `${p.x},${p.z}`).join(' ')
  return (
    <polygon
      points={points} data-testid={`plan-surface-${s.roomId}-${s.wallId}`} data-room={s.roomId} data-color={s.color ?? ''} data-selected={s.selected ? 'true' : undefined}
      data-pick-surface={pickable ? s.wallId : undefined}
      fill={s.color ?? 'transparent'} stroke={s.selected ? 'var(--accent)' : 'transparent'} strokeWidth={s.selected ? 3 : 10}
      vectorEffect="non-scaling-stroke" pointerEvents={pickable ? 'all' : 'none'} style={{ cursor: pickable ? 'pointer' : 'default' }}
    />
  )
}

export { viewToPlan }
