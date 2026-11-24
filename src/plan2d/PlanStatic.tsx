import { formatCm, formatM2 } from '../geometry/units'
import type { PlanDrawing } from './drawing'

const toPoints = (pts: { x: number; z: number }[]) => pts.map((p) => `${p.x},${p.z}`).join(' ')

/** Пол, стены и проёмы из описания рисунка. Только отображение: интерактивных элементов нет. */
export function PlanGeometry({ drawing, selectedWallIds = [], selectedWallId = null, selectedOpeningId = null }: {
  drawing: PlanDrawing
  /** Выбранный проём обводится акцентным цветом. */
  selectedOpeningId?: string | null
  /** Вся выбранная прямая стена подсвечена, выбранный участок отмечен жирнее. */
  selectedWallIds?: string[]
  selectedWallId?: string | null
}) {
  return (
    <>
      {drawing.rooms.map((r) => <polygon key={r.id} data-testid={`room-fill-${r.id}`} data-floor={r.floorHex ?? undefined} points={toPoints(r.polygon)} fill={r.floorHex ?? 'var(--plan-room)'} />)}
      {drawing.walls.map((w) => (
        <polygon
          key={w.id}
          data-testid={`plan-wall-${w.id}`}
          data-selected={w.id === selectedWallId ? 'main' : selectedWallIds.includes(w.id) ? 'line' : undefined}
          points={toPoints(w.polygon)}
          fill={selectedWallIds.includes(w.id) ? 'var(--accent)' : 'var(--plan-wall)'}
          stroke={w.id === selectedWallId ? 'var(--text)' : 'none'}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {drawing.openings.map((o) => (
        <g key={o.id} data-testid={`plan-opening-${o.id}`} data-selected={o.id === selectedOpeningId ? 'true' : undefined}>
          <polygon points={toPoints(o.cut)} fill="var(--plan-room)" />
          {o.id === selectedOpeningId && (
            <polygon points={toPoints(o.cut)} fill="none" stroke="var(--accent)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
          )}
          {o.kind === 'window' && (
            <polygon points={toPoints(o.cut)} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          )}
          {o.leaf && (
            <g fill="none" stroke="var(--plan-furniture-edge)" strokeWidth={1.5} vectorEffect="non-scaling-stroke">
              <line x1={o.leaf.hinge.x} y1={o.leaf.hinge.z} x2={o.leaf.open.x} y2={o.leaf.open.z} vectorEffect="non-scaling-stroke" />
              <path
                d={`M ${o.leaf.open.x} ${o.leaf.open.z} A ${o.leaf.radiusCm} ${o.leaf.radiusCm} 0 0 ${o.leaf.sweep} ${o.leaf.closed.x} ${o.leaf.closed.z}`}
                strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </g>
      ))}
    </>
  )
}

/** Название, площадь и чистовые размеры (см) комнат; `px` переводит экранные пиксели в см плана. */
export function PlanLabels({ drawing, px }: { drawing: PlanDrawing; px: (n: number) => number }) {
  return (
    // Подписи с тёмным контуром: читаются и на светлом покрытии пола, и на тёмной комнате.
    <g fill="var(--text)" fontSize={px(12)} pointerEvents="none" stroke="var(--bg)" strokeWidth={px(3)} strokeLinejoin="round" paintOrder="stroke">
      {drawing.rooms.map((r) => (
        <g key={r.id} data-testid={`plan-room-${r.id}`}>
          <text x={r.bounds.minX + px(8)} y={r.bounds.minZ + px(16)} fill="var(--text)">{r.name}, {formatM2(r.areaM2)}</text>
          <text x={r.center.x} y={r.bounds.minZ + px(30)} textAnchor="middle" data-testid={`plan-dim-w-${r.id}`}>{formatCm(r.widthCm)}</text>
          <text
            x={r.bounds.maxX - px(8)} y={r.center.z} textAnchor="middle"
            transform={`rotate(90 ${r.bounds.maxX - px(8)} ${r.center.z})`} data-testid={`plan-dim-d-${r.id}`}
          >{formatCm(r.depthCm)}</text>
        </g>
      ))}
    </g>
  )
}
