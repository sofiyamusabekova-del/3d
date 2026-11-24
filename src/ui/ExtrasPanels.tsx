import { useMemo, useState } from 'react'
import { roomClearPolygon } from '../domain/derive'
import {
  addNoteCommand, applyLayoutCommand, layoutDiff, MAX_LAYOUTS, MAX_NOTE_LENGTH, MAX_NOTES, patchNoteCommand, removeLayoutCommand, removeNoteCommand, saveLayoutCommand,
} from '../domain/extras'
import type { Apartment, Id, Room } from '../domain/types'
import { useApartmentProject } from '../scenario/flow'
import { card, secondary } from './styles'

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

/** Заметки комнаты (D-35): добавить, переименовать, удалить; на плане флажок тянется мышью. */
export function NotesPanel({ apt, room, selected, onSelect }: { apt: Apartment; room: Room; selected: Id | null; onSelect: (id: Id | null) => void }) {
  const notes = useMemo(() => Object.values(apt.notes ?? {}).filter((n) => n.roomId === room.id), [apt, room])
  const [error, setError] = useState<string | null>(null)
  const apply = (label: string, cmd: Parameters<ReturnType<typeof useApartmentProject.getState>['apply']>[1]) => {
    const r = useApartmentProject.getState().apply(label, cmd)
    setError(r.ok ? null : (r.issues[0]?.message ?? 'Не удалось'))
    return r.ok
  }
  const add = () => {
    const poly = roomClearPolygon(apt, room)
    const x = Math.round(poly.reduce((s, p) => s + p.x, 0) / poly.length), z = Math.round(poly.reduce((s, p) => s + p.z, 0) / poly.length)
    const id = uid('n')
    if (Object.keys(apt.notes ?? {}).length >= MAX_NOTES) { setError(`Заметок не больше ${MAX_NOTES}`); return }
    if (apply('Заметка', addNoteCommand({ id, roomId: room.id, xCm: x, zCm: z, text: 'Заметка' }))) onSelect(id)
  }
  return (
    <section data-testid="notes" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Заметки">
      <h2 style={{ margin: 0, fontSize: 15 }}>Заметки на плане</h2>
      <button data-testid="note-add" onClick={add} style={secondary}>Добавить заметку</button>
      {notes.map((n) => (
        <div key={n.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            key={`${n.id}-${n.text}`} data-testid={`note-text-${n.id}`} defaultValue={n.text} maxLength={MAX_NOTE_LENGTH} aria-label="Текст заметки"
            onFocus={() => onSelect(n.id)}
            onBlur={(e) => { const v = e.target.value.trim(); if (v === '') { e.target.value = n.text; setError('Текст заметки не может быть пустым') } else if (v !== n.text) apply('Заметка', patchNoteCommand(n.id, { text: v })) }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }}
            style={{ flex: 1, minWidth: 0, outline: n.id === selected ? '2px solid var(--accent)' : undefined }}
          />
          <button data-testid={`note-remove-${n.id}`} aria-label="Удалить заметку" onClick={() => { apply('Заметка', removeNoteCommand(n.id)); if (selected === n.id) onSelect(null) }} style={{ ...secondary, padding: '2px 8px' }}>×</button>
        </div>
      ))}
      {notes.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Например: «здесь розетка», «сюда шкаф». Флажок на плане можно перетащить.</div>}
      {error && <div data-testid="note-error" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
    </section>
  )
}

/** Варианты расстановки (D-36): сохранить снимок всей мебели, переключаться между вариантами, видеть различия. */
export function LayoutsPanel({ apt }: { apt: Apartment }) {
  const layouts = Object.values(apt.layouts ?? {})
  const [error, setError] = useState<string | null>(null)
  const apply = (label: string, cmd: Parameters<ReturnType<typeof useApartmentProject.getState>['apply']>[1]) => {
    const r = useApartmentProject.getState().apply(label, cmd)
    setError(r.ok ? null : (r.issues[0]?.message ?? 'Не удалось'))
  }
  const save = () => {
    if (layouts.length >= MAX_LAYOUTS) { setError(`Вариантов не больше ${MAX_LAYOUTS}: удалите один`); return }
    apply('Вариант расстановки', saveLayoutCommand({ id: uid('l'), name: `Вариант ${layouts.length + 1}`, furniture: structuredClone(apt.furniture) }))
  }
  return (
    <section data-testid="layouts" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Варианты расстановки">
      <h2 style={{ margin: 0, fontSize: 15 }}>Варианты расстановки</h2>
      <button data-testid="layout-save" onClick={save} style={secondary}>Сохранить текущую как вариант</button>
      {layouts.map((l) => {
        const diff = layoutDiff(apt, l)
        return (
          <div key={l.id} data-testid={`layout-${l.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{l.name}</b>
              <span data-testid={`layout-diff-${l.id}`} style={{ color: diff === 0 ? 'var(--ok)' : 'var(--text-muted)', marginLeft: 6 }}>{diff === 0 ? 'сейчас' : `отличается: ${diff}`}</span>
            </span>
            <button data-testid={`layout-show-${l.id}`} disabled={diff === 0} onClick={() => apply('Показать вариант', applyLayoutCommand(l.id))} style={{ ...secondary, padding: '2px 8px', opacity: diff === 0 ? 0.5 : 1 }}>Показать</button>
            <button data-testid={`layout-remove-${l.id}`} aria-label="Удалить вариант" onClick={() => apply('Удаление варианта', removeLayoutCommand(l.id))} style={{ ...secondary, padding: '2px 8px' }}>×</button>
          </div>
        )
      })}
      {layouts.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Расставьте мебель, сохраните вариант, затем попробуйте другую расстановку и переключайтесь между ними (Ctrl+Z тоже работает).</div>}
      {error && <div data-testid="layout-error" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
    </section>
  )
}
