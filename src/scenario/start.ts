import { create } from 'zustand'

/**
 * Стартовый экран (этап 29): показывается при каждом открытии сайта до мастера. Не часть проекта и не в истории.
 * Ключ в localStorage выключает экран для автотестов (Playwright кладёт его в storageState): мастер открывается сразу.
 */
export const SKIP_START_KEY = 'interior-planner:skip-start'

/** Что мастер должен сделать при запуске после выбора на стартовом экране. */
export type AfterStart = 'restore' | 'skipOffer' | null

const initiallyShown = () => {
  try { return typeof window === 'undefined' ? false : window.localStorage.getItem(SKIP_START_KEY) !== '1' } catch { return true }
}

interface StartState {
  shown: boolean
  /** restore — восстановить найденное сохранение; skipOffer — не предлагать сохранение (проект уже открыт или начат заново). */
  after: AfterStart
  enter: (after?: AfterStart) => void
  show: () => void
}

export const useStart = create<StartState>((set) => ({
  shown: initiallyShown(),
  after: null,
  enter: (after = null) => set({ shown: false, after }),
  show: () => set({ shown: true, after: null }),
}))
