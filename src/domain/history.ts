import { validateApartment } from './validate'
import type { Apartment, Issue } from './types'

/** Один шаг истории равен одному атомарно применённому изменению (Tasks 3.6). */
interface Entry {
  label: string
  before: Apartment
  after: Apartment
}

export interface History {
  present: Apartment
  past: Entry[]
  future: Entry[]
}

export type ChangeResult = { ok: true; history: History } | { ok: false; issues: Issue[]; history: History }

export const createHistory = (initial: Apartment): History => ({ present: initial, past: [], future: [] })

/**
 * Предложение изменения → проверка → атомарное применение.
 * `build` получает действующее состояние и возвращает НОВОЕ (иммутабельно).
 * При ошибке проверки или исключении действующее состояние не меняется.
 */
export function applyChange(
  h: History,
  label: string,
  build: (current: Apartment) => Apartment,
  validate: (candidate: Apartment) => Issue[] = validateApartment,
): ChangeResult {
  let candidate: Apartment
  try {
    candidate = build(h.present)
  } catch (e) {
    return { ok: false, history: h, issues: [{ code: 'build-failed', message: `Изменение не построено: ${(e as Error).message}` }] }
  }
  if (candidate === h.present) return { ok: true, history: h }
  const issues = validate(candidate)
  if (issues.length > 0) return { ok: false, issues, history: h }
  return { ok: true, history: { present: candidate, past: [...h.past, { label, before: h.present, after: candidate }], future: [] } }
}

export function undo(h: History): History {
  const entry = h.past[h.past.length - 1]
  if (!entry) return h
  return { present: entry.before, past: h.past.slice(0, -1), future: [entry, ...h.future] }
}

export function redo(h: History): History {
  const [entry, ...rest] = h.future
  if (!entry) return h
  return { present: entry.after, past: [...h.past, entry], future: rest }
}

export const canUndo = (h: History): boolean => h.past.length > 0
export const canRedo = (h: History): boolean => h.future.length > 0
