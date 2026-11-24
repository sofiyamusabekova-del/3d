import { useEffect } from 'react'
import { TECH_CATALOG_ITEMS, TECH_CATALOG } from '../catalog/techCatalog'
import { selectApartment, selectCanRedo, selectCanUndo } from '../domain/store'
import { PlanView, screenToPlan } from '../plan2d/PlanView'
import { useEditor, useProject } from '../prototype/session'
import { RoomScene, sceneRegistry, screenPositionOf } from '../scene3d/RoomScene'

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

export function TechPrototype() {
  const apt = useProject(selectApartment)
  const canUndo = useProject(selectCanUndo)
  const canRedo = useProject(selectCanRedo)
  const { selectedId, draft, message, addAtFreeSpot, removeSelected, rotate, cancelDrag, beginDrag } = useEditor()
  const sel = selectedId ? apt.furniture[selectedId] : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'r') rotate(e.shiftKey ? -15 : 15)
      else if (k === 'escape') cancelDrag()
      else if (k === 'delete') removeSelected()
      else if (e.ctrlKey && k === 'z') useProject.getState().undo()
      else if (e.ctrlKey && k === 'y') useProject.getState().redo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotate, cancelDrag, removeSelected])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__tech = {
      furniture: () => useProject.getState().history.present.furniture,
      scenePosition: (id: string) => {
        const o = sceneRegistry.objects.get(id)
        return o ? { xCm: o.position.x * 100, zCm: o.position.z * 100, angleDeg: (o.rotation.y * 180) / Math.PI } : null
      },
      measured: () => Object.fromEntries(sceneRegistry.measured),
      screenPosition: (id: string) => screenPositionOf(id),
      draft: () => useEditor.getState().draft,
    }
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr', gridTemplateRows: '1fr auto', height: '100%' }}>
      <aside style={{ padding: 'var(--space-3)', borderRight: '1px solid var(--border)', overflow: 'auto' }}>
        <h1 style={{ fontSize: 16, margin: '0 0 var(--space-2)' }}>Техническая сцена</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 var(--space-3)' }}>
          Этап 4: проверка основы. Каталог технический, не утверждённый.
        </p>
        {TECH_CATALOG_ITEMS.map((it) => (
          <div key={it.id} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <button data-testid={`add-${it.id}`} onClick={() => addAtFreeSpot(it.id)} style={{ ...btn, marginBottom: 0, flex: 1 }}>
              <b>{it.name}</b>
              <span style={{ color: 'var(--text-muted)' }}>{it.widthCm} × {it.depthCm} × {it.heightCm} см</span>
            </button>
            <span
              data-testid={`drag-${it.id}`}
              title="Перетащите на план"
              style={{ ...btn, marginBottom: 0, width: 36, justifyContent: 'center', alignItems: 'center', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
              onPointerDown={(e) => {
                const svg = document.querySelector<SVGSVGElement>('[data-testid=plan]')
                if (svg) beginDrag({ catalogItemId: it.id }, screenToPlan(svg, e.clientX, e.clientY), 'plan')
              }}
            >
              ⠿
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <button style={btn} disabled={!canUndo} onClick={() => useProject.getState().undo()}>Отмена</button>
          <button style={btn} disabled={!canRedo} onClick={() => useProject.getState().redo()}>Повтор</button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Перетаскивание: мышь на плане или в 3D. Alt — без сетки 5 см. R / Shift+R — поворот 15°. Delete — удалить. Ctrl+Z / Ctrl+Y.
        </p>
      </aside>
      <section style={{ minWidth: 0 }}><PlanView /></section>
      <section style={{ minWidth: 0, borderLeft: '1px solid var(--border)' }}><RoomScene /></section>
      <footer data-testid="status" style={{ gridColumn: '1 / -1', padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border)', display: 'flex', gap: 'var(--space-3)', minHeight: 20 }}>
        <span data-testid="selection">
          {sel ? `${TECH_CATALOG[sel.catalogItemId].name}: x=${Math.round(sel.xCm)} см, z=${Math.round(sel.zCm)} см, угол=${Math.round(sel.angleDeg)}°` : 'Предмет не выбран'}
        </span>
        {draft && !draft.result.valid && <span data-testid="reason" style={{ color: 'var(--danger)' }}>{draft.result.message}</span>}
        {message && !draft && <span data-testid="message" style={{ color: 'var(--danger)' }}>{message}</span>}
      </footer>
    </div>
  )
}

const btn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'left', marginBottom: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-3)', background: 'var(--surface-2)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', font: 'inherit',
}
