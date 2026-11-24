import type { Apartment, FurnitureInstance, FurnitureLayout, Id, PlanNote } from './types'

/** Заметки на плане (D-35) и варианты расстановки (D-36): команды проекта, каждая — один шаг истории. */
export const MAX_NOTE_LENGTH = 120
export const MAX_NOTES = 40
export const MAX_LAYOUTS = 4

const clean = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH)

export const addNoteCommand = (note: PlanNote) => (a: Apartment): Apartment => {
  const notes = a.notes ?? {}
  if (Object.keys(notes).length >= MAX_NOTES) return a // проверка числа — в notesIssues
  return { ...a, notes: { ...notes, [note.id]: { ...note, text: clean(note.text) } } }
}

export const patchNoteCommand = (id: Id, patch: Partial<Pick<PlanNote, 'xCm' | 'zCm' | 'text'>>) => (a: Apartment): Apartment => {
  const n = a.notes?.[id]
  if (!n) return a
  return { ...a, notes: { ...a.notes, [id]: { ...n, ...patch, text: patch.text === undefined ? n.text : clean(patch.text) } } }
}

export const removeNoteCommand = (id: Id) => (a: Apartment): Apartment => {
  if (!a.notes?.[id]) return a
  const { [id]: _gone, ...rest } = a.notes
  return { ...a, notes: rest }
}

/** Проверка заметок и вариантов: комната существует, координаты конечные, текст не пустой, пределы по числу. */
export function extrasIssues(a: Apartment): Array<{ code: string; message: string }> {
  const out: Array<{ code: string; message: string }> = []
  const notes = Object.values(a.notes ?? {})
  if (notes.length > MAX_NOTES) out.push({ code: 'notes-limit', message: `Заметок не больше ${MAX_NOTES}` })
  for (const n of notes) {
    if (!a.rooms[n.roomId]) out.push({ code: 'note-room', message: 'Заметка относится к несуществующей комнате' })
    else if (!Number.isFinite(n.xCm) || !Number.isFinite(n.zCm)) out.push({ code: 'note-pos', message: 'У заметки неверное положение' })
    else if (n.text.length === 0) out.push({ code: 'note-text', message: 'Текст заметки не может быть пустым' })
  }
  const layouts = Object.values(a.layouts ?? {})
  if (layouts.length > MAX_LAYOUTS) out.push({ code: 'layouts-limit', message: `Вариантов расстановки не больше ${MAX_LAYOUTS}` })
  return out
}

/** Снимок всей мебели как вариант расстановки. */
export const saveLayoutCommand = (layout: FurnitureLayout) => (a: Apartment): Apartment => {
  const layouts = a.layouts ?? {}
  if (Object.keys(layouts).length >= MAX_LAYOUTS && !layouts[layout.id]) return a
  return { ...a, layouts: { ...layouts, [layout.id]: { ...layout, name: clean(layout.name) || 'Вариант' } } }
}

/** Применяет вариант: мебель квартиры заменяется снимком (предметы несуществующих комнат отбрасываются). */
export const applyLayoutCommand = (id: Id) => (a: Apartment): Apartment => {
  const l = a.layouts?.[id]
  if (!l) return a
  const furniture: Record<Id, FurnitureInstance> = {}
  for (const f of Object.values(l.furniture)) if (a.rooms[f.roomId]) furniture[f.id] = f
  return { ...a, furniture }
}

export const removeLayoutCommand = (id: Id) => (a: Apartment): Apartment => {
  if (!a.layouts?.[id]) return a
  const { [id]: _gone, ...rest } = a.layouts
  return { ...a, layouts: rest }
}

/** Сколько предметов отличается между мебелью проекта и вариантом (добавлено, убрано, сдвинуто или повёрнуто). */
export function layoutDiff(a: Apartment, l: FurnitureLayout): number {
  const ids = new Set([...Object.keys(a.furniture), ...Object.keys(l.furniture)])
  let n = 0
  for (const id of ids) {
    const x = a.furniture[id], y = l.furniture[id]
    if (!x || !y || x.catalogItemId !== y.catalogItemId || x.roomId !== y.roomId || Math.abs(x.xCm - y.xCm) > 0.5 || Math.abs(x.zCm - y.zCm) > 0.5 || Math.abs(x.angleDeg - y.angleDeg) > 0.5 || Math.abs(x.elevationCm - y.elevationCm) > 0.5) n++
  }
  return n
}
