import type { Apartment, Issue } from '../domain/types'
import { templateById } from './layouts'

/**
 * Файл проекта (этап 27): версионированный JSON с квартирой и состоянием сценария. Хранится только текущее состояние:
 * история отмены в файл не входит. Чистые функции: запись и разбор с проверкой, без обращения к браузеру и хранилищам.
 */
export const PROJECT_FORMAT = 'interior-planner-project'
export const PROJECT_VERSION = 1
/** Файл больше этого размера не читается: проект с мебелью занимает десятки килобайт. */
export const MAX_PROJECT_BYTES = 5 * 1024 * 1024

export interface ProjectFlowState {
  roomCount: 1 | 2 | 3
  areaM2: number | null
  templateId: string
  /** Шаг, на котором работали: «настройка» или «интерьер». */
  step: 'setup' | 'interior'
}

export interface ProjectUiState {
  /** Время суток, часы 0–24. */
  hour: number
  /** Выключенные комнаты (выключатель). */
  lightsOff: Record<string, true>
  activeRoomId: string | null
}

export interface ProjectDocument {
  format: typeof PROJECT_FORMAT
  version: number
  savedAt: string
  apartment: Apartment
  flow: ProjectFlowState
  ui: ProjectUiState
}

export function serializeProject(apartment: Apartment, flow: ProjectFlowState, ui: ProjectUiState, now: Date = new Date()): string {
  const doc: ProjectDocument = { format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt: now.toISOString(), apartment, flow, ui }
  return JSON.stringify(doc, null, 2)
}

export type ParseResult = { ok: true; doc: ProjectDocument } | { ok: false; message: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const RECORD_KEYS = ['vertices', 'walls', 'rooms', 'openings', 'furniture', 'surfaceMaterials', 'floorCoverings'] as const

/**
 * Разбор и проверка файла. Любая ошибка даёт понятную причину, ничего не применяя: проект остаётся прежним.
 * check — полная проверка квартиры (та же, что при каждом изменении проекта).
 */
export function parseProject(text: string, check: (a: Apartment) => Issue[]): ParseResult {
  if (text.length > MAX_PROJECT_BYTES) return { ok: false, message: 'Файл слишком большой для проекта квартиры.' }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, message: 'Это не файл проекта: содержимое не читается как JSON.' } }
  if (!isObj(raw) || raw.format !== PROJECT_FORMAT) return { ok: false, message: 'Это не файл проекта этого приложения.' }
  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, message: 'В файле не указана версия формата.' }
  if (version > PROJECT_VERSION) return { ok: false, message: `Файл создан более новой версией приложения (формат ${version}), эта версия читает формат ${PROJECT_VERSION}.` }

  const a = raw.apartment
  if (!isObj(a)) return { ok: false, message: 'В файле нет квартиры.' }
  if (typeof a.ceilingHeightCm !== 'number' || typeof a.id !== 'string') return { ok: false, message: 'Квартира в файле повреждена: нет высоты потолка или идентификатора.' }
  for (const k of RECORD_KEYS) if (!isObj(a[k])) return { ok: false, message: `Квартира в файле повреждена: нет раздела «${k}».` }
  const apartment = a as unknown as Apartment

  const flow = raw.flow
  if (!isObj(flow)) return { ok: false, message: 'В файле нет состояния сценария.' }
  if (flow.roomCount !== 1 && flow.roomCount !== 2 && flow.roomCount !== 3) return { ok: false, message: 'В файле неверное число комнат.' }
  if (!(flow.areaM2 === null || (typeof flow.areaM2 === 'number' && Number.isFinite(flow.areaM2) && flow.areaM2 > 0))) return { ok: false, message: 'В файле неверная площадь.' }
  if (typeof flow.templateId !== 'string' || !templateById(flow.templateId)) return { ok: false, message: 'В файле указана неизвестная схема квартиры.' }
  if (flow.step !== 'setup' && flow.step !== 'interior') return { ok: false, message: 'В файле неверный шаг сценария.' }

  const issues = check(apartment)
  if (issues.length > 0) return { ok: false, message: `Проект в файле не проходит проверку: ${issues[0].message}${issues.length > 1 ? ` (и ещё ${issues.length - 1})` : ''}.` }

  const ui = isObj(raw.ui) ? raw.ui : {}
  const hour = typeof ui.hour === 'number' && Number.isFinite(ui.hour) ? ((ui.hour % 24) + 24) % 24 : 15
  const lightsOff: Record<string, true> = {}
  if (isObj(ui.lightsOff)) for (const [id, v] of Object.entries(ui.lightsOff)) if (v === true && apartment.rooms[id]) lightsOff[id] = true
  const activeRoomId = typeof ui.activeRoomId === 'string' && apartment.rooms[ui.activeRoomId] ? ui.activeRoomId : null

  return {
    ok: true,
    doc: {
      format: PROJECT_FORMAT, version, savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date(0).toISOString(), apartment,
      flow: { roomCount: flow.roomCount, areaM2: flow.areaM2 as number | null, templateId: flow.templateId, step: flow.step },
      ui: { hour, lightsOff, activeRoomId },
    },
  }
}

/** Краткое описание сохранённого проекта для окна восстановления. */
export function describeProject(doc: ProjectDocument): string {
  const t = templateById(doc.flow.templateId)
  const items = Object.keys(doc.apartment.furniture).length
  return `${t?.name ?? 'схема'}, предметов: ${items}`
}
