import { create } from 'zustand'
import { canUndo } from '../domain/history'
import { selectApartment } from '../domain/store'
import { DEFAULT_HOUR } from '../scene3d/hour'
import { apartmentIssues, newEmptyApartment, useApartmentProject, useFlow } from './flow'
import { useInterior } from './interior'
import { useInteriorEditor } from './interiorEditor'
import { describeProject, parseProject, serializeProject, type ProjectDocument, type ProjectFlowState, type ProjectUiState } from './projectFile'
import { SHARE_SOFT_LIMIT, shareUrl, tokenFromHash, tokenToProject } from './shareLink'

/**
 * Сохранение проекта (этап 27): автосохранение в браузере (localStorage), выгрузка и загрузка файла, новый проект.
 * Сохраняется текущее состояние, история отмены нет. Без сервера и сетевых запросов: проект не покидает компьютер,
 * пока пользователь сам не сохранит файл.
 */
export const STORAGE_KEY = 'interior-planner:project:v1'
const AUTOSAVE_DELAY_MS = 600

/** Подтверждение, которого ждёт действие, заменяющее текущий проект. */
export type PendingDialog = { kind: 'new' } | { kind: 'open'; doc: ProjectDocument } | null

interface SaveStatus {
  /** Время последнего автосохранения, мс; null — ещё не сохраняли. */
  savedAt: number | null
  /** Автосохранение в браузере недоступно (хранилище закрыто или переполнено). */
  storageError: string | null
  /** Ошибка последней загрузки файла. */
  importError: string | null
  /** Сообщение об удачной загрузке или выгрузке файла. */
  notice: string | null
  /** Найденное при запуске сохранение, по которому пользователь ещё не решил. Пока оно есть, автосохранение стоит. */
  offer: ProjectDocument | null
  dialog: PendingDialog
}

export const useSaveStatus = create<SaveStatus>(() => ({ savedAt: null, storageError: null, importError: null, notice: null, offer: null, dialog: null }))

const storage = (): Storage | null => { try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null } }

/** Состояние сценария и интерфейса для записи; null, пока проекта нет (схема не выбрана). */
export function collectProject(): { apartment: ReturnType<typeof selectApartment>; flow: ProjectFlowState; ui: ProjectUiState } | null {
  const flow = useFlow.getState()
  if (!flow.selectedTemplateId) return null
  const ui = useInterior.getState()
  return {
    apartment: selectApartment(useApartmentProject.getState()),
    flow: { roomCount: flow.roomCount, areaM2: flow.areaM2, templateId: flow.selectedTemplateId, step: flow.step === 'interior' ? 'interior' : 'setup' },
    ui: { hour: ui.hour, lightsOff: ui.lightsOff, activeRoomId: ui.activeRoomId },
  }
}

/** Есть ли в проекте работа, которую заменяющее действие уничтожит (правки или мебель). */
export const hasWork = () => {
  const apt = selectApartment(useApartmentProject.getState())
  return canUndo(useApartmentProject.getState().history) || Object.keys(apt.furniture).length > 0
}

/** Применяет документ: заменяет проект, сценарий и состояние интерфейса. История отмены начинается заново. */
export function restoreProject(doc: ProjectDocument) {
  useApartmentProject.getState().reset(doc.apartment)
  useFlow.setState({
    step: doc.flow.step, roomCount: doc.flow.roomCount, areaM2: doc.flow.areaM2, areaText: doc.flow.areaM2 === null ? '' : String(doc.flow.areaM2).replace('.', ','),
    areaError: null, selectedTemplateId: doc.flow.templateId, pendingReplaceId: null,
  })
  useInterior.setState({
    hour: doc.ui.hour, lightsOff: doc.ui.lightsOff, activeRoomId: doc.ui.activeRoomId, enteredVia: null, selectedOpeningId: null,
    selectedSideWallId: null, notice: null, walking: false, walkRoomId: null,
  })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
}

/** Пустой проект: как при первом запуске. */
export function resetProject() {
  useApartmentProject.getState().reset(newEmptyApartment())
  useFlow.setState({ step: 'params', roomCount: 1, areaText: '', areaM2: null, areaError: null, selectedTemplateId: null, pendingReplaceId: null })
  useInterior.setState({ hour: DEFAULT_HOUR, lightsOff: {}, activeRoomId: null, enteredVia: null, selectedOpeningId: null, selectedSideWallId: null, notice: null, walking: false, walkRoomId: null })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
}

/** Записывает проект в браузер; false и причина в статусе, если хранилище недоступно. */
export function saveToBrowser(now: Date = new Date()): boolean {
  const p = collectProject()
  if (!p) return false
  const s = storage()
  if (!s) { useSaveStatus.setState({ storageError: 'Автосохранение недоступно: браузер закрыл хранилище (например, приватное окно). Сохраняйте проект в файл.' }); return false }
  try {
    s.setItem(STORAGE_KEY, serializeProject(p.apartment, p.flow, p.ui, now))
    useSaveStatus.setState({ savedAt: now.getTime(), storageError: null })
    return true
  } catch {
    useSaveStatus.setState({ storageError: 'Автосохранение недоступно: в хранилище браузера не хватает места. Сохраняйте проект в файл.' })
    return false
  }
}

/** Сохранение браузера: документ, ошибка чтения или null, если сохранения нет. */
export function readBrowserSave(): { ok: true; doc: ProjectDocument } | { ok: false; message: string } | null {
  const s = storage()
  if (!s) return null
  let text: string | null = null
  try { text = s.getItem(STORAGE_KEY) } catch { return null }
  if (text === null) return null
  return parseProject(text, apartmentIssues)
}

export function clearBrowserSave() {
  try { storage()?.removeItem(STORAGE_KEY) } catch { /* хранилище недоступно: нечего очищать */ }
  useSaveStatus.setState({ savedAt: null })
}

/**
 * Запуск при открытии приложения: если есть сохранение, предлагает продолжить (автоматически ничего не заменяется),
 * затем включает автосохранение. Возвращает функцию остановки.
 */
export function startPersistence(): () => void {
  const found = readBrowserSave()
  if (found?.ok) useSaveStatus.setState({ offer: found.doc })
  else if (found && !found.ok) { useSaveStatus.setState({ storageError: `Сохранённый в браузере проект не открыт: ${found.message}` }); clearBrowserSave() }
  void openSharedLink(found?.ok === true)

  let timer: ReturnType<typeof setTimeout> | null = null
  let last = ''
  const signature = () => { const p = collectProject(); return p ? JSON.stringify([p.apartment, p.flow, p.ui]) : '' }
  const schedule = () => {
    if (useSaveStatus.getState().offer) return // решение по найденному сохранению ещё не принято: не затираем его
    const sig = signature()
    if (!sig || sig === last) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { if (saveToBrowser()) last = signature() }, AUTOSAVE_DELAY_MS)
  }
  // Уход со страницы (закрытие вкладки, перезагрузка, переключение): последние правки записываются сразу, не дожидаясь паузы.
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (useSaveStatus.getState().offer) return
    const sig = signature()
    if (sig && sig !== last && saveToBrowser()) last = sig
  }
  const onHide = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush() }
  const canListen = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
  if (canListen) { window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', onHide) }
  const unsub = [useApartmentProject.subscribe(schedule), useFlow.subscribe(schedule), useInterior.subscribe(schedule), useSaveStatus.subscribe((s, prev) => { if (prev.offer && !s.offer) schedule() })]
  return () => {
    unsub.forEach((u) => u())
    if (timer) clearTimeout(timer)
    if (canListen) { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide) }
  }
}

export const acceptOffer = () => {
  const { offer } = useSaveStatus.getState()
  if (!offer) return
  restoreProject(offer)
  useSaveStatus.setState({ offer: null, savedAt: Date.parse(offer.savedAt) || null, notice: 'Проект восстановлен.' })
}
export const discardOffer = () => { clearBrowserSave(); useSaveStatus.setState({ offer: null, notice: 'Сохранённый проект удалён.' }) }

/** Новый проект: сразу, если работы нет, иначе после подтверждения. */
export function requestNewProject() {
  if (hasWork()) useSaveStatus.setState({ dialog: { kind: 'new' } })
  else confirmDialog({ kind: 'new' })
}

/** Выполняет действие, подтверждённое пользователем. */
export function confirmDialog(d: NonNullable<PendingDialog>) {
  if (d.kind === 'new') {
    clearBrowserSave()
    resetProject()
    useSaveStatus.setState({ dialog: null, notice: 'Начат новый проект.', importError: null })
  } else {
    restoreProject(d.doc)
    saveToBrowser()
    useSaveStatus.setState({ dialog: null, notice: 'Проект открыт из файла.', importError: null, offer: null })
  }
}
export const cancelDialog = () => useSaveStatus.setState({ dialog: null })

/** Файл проекта для скачивания: текст и имя. */
export function projectFile(now: Date = new Date()): { name: string; text: string } | null {
  const p = collectProject()
  if (!p) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return { name: `kvartira-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`, text: serializeProject(p.apartment, p.flow, p.ui, now) }
}

export function downloadProject() {
  const f = projectFile()
  if (!f) return
  const url = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = f.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  useSaveStatus.setState({ notice: `Проект сохранён в файл ${f.name}.`, importError: null })
}

/** Загрузка файла проекта: при ошибке текущий проект не меняется, причина показывается пользователю. */
export function importProjectText(text: string) {
  const r = parseProject(text, apartmentIssues)
  if (!r.ok) { useSaveStatus.setState({ importError: r.message, notice: null }); return }
  if (hasWork()) useSaveStatus.setState({ dialog: { kind: 'open', doc: r.doc }, importError: null })
  else confirmDialog({ kind: 'open', doc: r.doc })
}

/** Ссылка на проект (D-37): строка адреса вида «#p=…». */
export async function copyShareLink() {
  const f = projectFile()
  if (!f) return
  const url = await shareUrl(f.text, `${location.origin}${location.pathname}`)
  const kb = Math.max(1, Math.round(url.length / 1024))
  try {
    await navigator.clipboard.writeText(url)
    useSaveStatus.setState({
      notice: url.length > SHARE_SOFT_LIMIT ? `Ссылка скопирована (${kb} КБ): она длинная и может не пройти через мессенджер, тогда лучше отправить файл.` : `Ссылка на проект скопирована (${kb} КБ).`,
      importError: null,
    })
  } catch {
    useSaveStatus.setState({ importError: 'Не удалось скопировать ссылку: браузер не дал доступ к буферу обмена.', notice: null })
  }
}

/**
 * Открытие проекта по ссылке «#p=…». Адрес сразу очищается, чтобы перезагрузка не открывала проект заново. Если в браузере
 * уже есть сохранённая работа, замена идёт через подтверждение: она не пропадает молча.
 */
async function openSharedLink(hasSaved: boolean) {
  if (typeof location === 'undefined') return
  const token = tokenFromHash(location.hash)
  if (token === null) return
  history.replaceState(null, '', location.pathname + location.search)
  const text = await tokenToProject(token)
  if (text === null) { useSaveStatus.setState({ importError: 'Ссылка повреждена или обрезана.', notice: null }); return }
  const r = parseProject(text, apartmentIssues)
  if (!r.ok) { useSaveStatus.setState({ importError: r.message, notice: null }); return }
  if (hasSaved || hasWork()) useSaveStatus.setState({ dialog: { kind: 'open', doc: r.doc }, offer: null, importError: null })
  else { restoreProject(r.doc); saveToBrowser(); useSaveStatus.setState({ notice: 'Проект открыт по ссылке.', importError: null }) }
}

export { describeProject }
