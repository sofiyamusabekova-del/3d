import { create } from 'zustand'

/**
 * Состояние загрузки моделей мебели (SPEC §12, AC-13): ошибка одной модели не останавливает редактор,
 * причина и повтор загрузки доступны в интерфейсе. Не часть проекта и истории.
 */
interface ModelStatus {
  /** id предмета каталога → причина последней ошибки загрузки. */
  failed: Record<string, string>
  /** Счётчик повторов по id: смена значения пересоздаёт границу ошибки и запускает загрузку заново. */
  attempts: Record<string, number>
  fail: (id: string, reason: string) => void
  ok: (id: string) => void
  /** Повтор: сбрасывает ошибку и кеш загрузчика этой модели. */
  retry: (id: string, url: string) => void
}

export const useModelStatus = create<ModelStatus>((set, get) => ({
  failed: {},
  attempts: {},
  fail: (id, reason) => { if (get().failed[id] !== reason) set({ failed: { ...get().failed, [id]: reason } }) },
  ok: (id) => { if (get().failed[id]) { const { [id]: _drop, ...rest } = get().failed; set({ failed: rest }) } },
  retry: (id, url) => {
    // Кеш хранит и неудачу: без очистки повтор вернул бы ту же ошибку.
    clearModel(url)
    const { [id]: _drop, ...rest } = get().failed
    set({ failed: rest, attempts: { ...get().attempts, [id]: (get().attempts[id] ?? 0) + 1 } })
  },
}))

let clear: (url: string) => void = () => {}
/** Подключает очистку кеша загрузчика (drei useGLTF.clear); вызывается из сцены. */
export const registerModelCacheClear = (fn: (url: string) => void) => { clear = fn }
const clearModel = (url: string) => clear(url)
