import { create } from 'zustand'
import { applyChange, canRedo, canUndo, createHistory, redo, undo, type ChangeResult, type History } from './history'
import type { Apartment, Issue } from './types'
import { validateApartment } from './validate'

interface ProjectStore {
  history: History
  /** Единственный способ изменить проект: общая команда с проверкой. */
  apply: (label: string, build: (current: Apartment) => Apartment) => ChangeResult
  undo: () => void
  redo: () => void
  /** Заменяет квартиру и очищает историю (например, выбор другой схемы). */
  reset: (apartment: Apartment) => void
}

export const createProjectStore = (initial: Apartment, extraValidate: (a: Apartment) => Issue[] = () => []) =>
  create<ProjectStore>((set, get) => ({
    history: createHistory(initial),
    apply: (label, build) => {
      const result = applyChange(get().history, label, build, (c) => [...validateApartment(c), ...extraValidate(c)])
      if (result.ok && result.history !== get().history) set({ history: result.history })
      return result
    },
    undo: () => set({ history: undo(get().history) }),
    redo: () => set({ history: redo(get().history) }),
    reset: (apartment) => set({ history: createHistory(apartment) }),
  }))

export const selectApartment = (s: ProjectStore): Apartment => s.history.present
export const selectCanUndo = (s: ProjectStore): boolean => canUndo(s.history)
export const selectCanRedo = (s: ProjectStore): boolean => canRedo(s.history)
