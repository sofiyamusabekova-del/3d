import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setFloorCoveringCommand } from '../../src/domain/floors'
import { setSideFinishCommand } from '../../src/domain/finishes'
import { addFurnitureCommand } from '../../src/domain/placement'
import { selectApartment } from '../../src/domain/store'
import { apartmentIssues, resetFlowForTests, useApartmentProject, useFlow } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { buildApartment, templateById } from '../../src/scenario/layouts'
import {
  STORAGE_KEY, acceptOffer, clearBrowserSave, confirmDialog, discardOffer, importProjectText, projectFile, readBrowserSave, requestNewProject,
  restoreProject, saveToBrowser, startPersistence, useSaveStatus,
} from '../../src/scenario/persistence'
import { MAX_PROJECT_BYTES, PROJECT_FORMAT, PROJECT_VERSION, parseProject, serializeProject, type ProjectDocument } from '../../src/scenario/projectFile'

// Этап 27: сохранение проекта: формат файла, проверки, автосохранение, восстановление, замена проекта.
const apt = () => selectApartment(useApartmentProject.getState())
const room = (name: string) => Object.values(apt().rooms).find((r) => r.name === name)!

/** Рабочее состояние: схема 1Б, шаг «интерьер», мебель, отделка, пол, время суток и выключатель. */
function buildWork() {
  const a = buildApartment(templateById('1b')!)
  useApartmentProject.getState().reset(a)
  useFlow.setState({ selectedTemplateId: '1b', roomCount: 1, areaM2: 43, areaText: '43', step: 'interior' })
  const living = room('Комната')
  useApartmentProject.getState().apply('Добавление', addFurnitureCommand({ id: 'sofa1', catalogItemId: 'sofa_02', assetVersion: '1', roomId: living.id, xCm: 200, zCm: 250, elevationCm: 0, angleDeg: 90 }))
  useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(living.id, { kind: 'laminate', colorId: 'oak_light' }))
  const wall = living.boundary[0].wallId
  useApartmentProject.getState().apply('Отделка', setSideFinishCommand(living.id, [wall], 'paint_sage'))
  useInterior.setState({ hour: 22.5, lightsOff: { [living.id]: true }, activeRoomId: living.id })
}

/** Хранилище браузера в памяти; failSet имитирует переполнение. */
function fakeStorage(opts: { failSet?: boolean } = {}) {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { if (opts.failSet) throw new Error('QuotaExceededError'); m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    raw: m,
  }
}

beforeEach(() => {
  resetFlowForTests()
  useInterior.setState({ hour: 15, lightsOff: {}, activeRoomId: null, walking: false, walkRoomId: null })
  useSaveStatus.setState({ savedAt: null, storageError: null, importError: null, notice: null, offer: null, dialog: null })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('27.1 формат файла', () => {
  it('запись и разбор возвращают тот же проект, сценарий и состояние интерфейса', () => {
    buildWork()
    const text = serializeProject(apt(), { roomCount: 1, areaM2: 43, templateId: '1b', step: 'interior' }, { hour: 22.5, lightsOff: useInterior.getState().lightsOff, activeRoomId: room('Комната').id }, new Date('2026-11-19T12:00:00Z'))
    const r = parseProject(text, apartmentIssues)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.doc.format).toBe(PROJECT_FORMAT)
    expect(r.doc.version).toBe(PROJECT_VERSION)
    expect(r.doc.savedAt).toBe('2026-11-19T12:00:00.000Z')
    expect(r.doc.apartment).toEqual(apt())
    expect(r.doc.flow).toEqual({ roomCount: 1, areaM2: 43, templateId: '1b', step: 'interior' })
    expect(r.doc.ui.hour).toBe(22.5)
    expect(Object.keys(r.doc.apartment.furniture)).toEqual(['sofa1'])
    expect(r.doc.apartment.floorCoverings[room('Комната').id]).toEqual({ kind: 'laminate', colorId: 'oak_light' })
  })

  it('понятные причины отказа для неподходящих файлов', () => {
    const ok = (o: object) => JSON.stringify({ format: PROJECT_FORMAT, version: 1, savedAt: 'x', apartment: buildApartment(templateById('1b')!), flow: { roomCount: 1, areaM2: 43, templateId: '1b', step: 'setup' }, ui: {}, ...o })
    const msg = (t: string) => { const r = parseProject(t, apartmentIssues); expect(r.ok).toBe(false); return r.ok ? '' : r.message }
    expect(msg('не json {')).toContain('JSON')
    expect(msg('{"a":1}')).toContain('не файл проекта')
    expect(msg('[]')).toContain('не файл проекта')
    expect(msg(ok({ version: 99 }))).toContain('более новой версией')
    expect(msg(ok({ version: 0 }))).toContain('версия')
    expect(msg(ok({ version: 'x' }))).toContain('версия')
    expect(msg(ok({ apartment: null }))).toContain('нет квартиры')
    expect(msg(ok({ apartment: { id: 'a', ceilingHeightCm: 270 } }))).toContain('повреждена')
    expect(msg(ok({ flow: null }))).toContain('состояния сценария')
    expect(msg(ok({ flow: { roomCount: 5, areaM2: 43, templateId: '1b', step: 'setup' } }))).toContain('числ')
    expect(msg(ok({ flow: { roomCount: 1, areaM2: -3, templateId: '1b', step: 'setup' } }))).toContain('площадь')
    expect(msg(ok({ flow: { roomCount: 1, areaM2: 43, templateId: 'zz', step: 'setup' } }))).toContain('неизвестная схема')
    expect(msg(ok({ flow: { roomCount: 1, areaM2: 43, templateId: '1b', step: 'params' } }))).toContain('шаг')
    expect(msg('x'.repeat(MAX_PROJECT_BYTES + 1))).toContain('слишком большой')
  })

  it('проект с битыми ссылками не открывается: предмет в несуществующей комнате, неизвестный предмет каталога, неизвестный материал, покрытие', () => {
    const base = buildApartment(templateById('1b')!)
    const living = Object.values(base.rooms).find((r) => r.name === 'Комната')!
    const furniture = (catalogItemId: string, roomId: string) => ({ f1: { id: 'f1', catalogItemId, assetVersion: '1', roomId, xCm: 200, zCm: 250, elevationCm: 0, angleDeg: 0 } })
    const withApt = (patch: object) => JSON.stringify({ format: PROJECT_FORMAT, version: 1, savedAt: 'x', apartment: { ...base, ...patch }, flow: { roomCount: 1, areaM2: 43, templateId: '1b', step: 'setup' }, ui: {} })
    const bad = (patch: object) => { const r = parseProject(withApt(patch), apartmentIssues); expect(r.ok).toBe(false); return r.ok ? '' : r.message }
    expect(bad({ furniture: furniture('sofa_02', 'нет-комнаты') })).toContain('не проходит проверку')
    expect(bad({ furniture: furniture('нет-такого-предмета', living.id) })).toContain('не проходит проверку')
    expect(bad({ surfaceMaterials: { [`${living.boundary[0].wallId}|${living.id}`]: 'нет-материала' } })).toContain('не проходит проверку')
    expect(bad({ floorCoverings: { [living.id]: { kind: 'laminate', colorId: 'нет-цвета' } } })).toContain('не проходит проверку')
    expect(bad({ floorCoverings: { ghost: { kind: 'carpet', colorId: 'carpet_gray' } } })).toContain('не проходит проверку')
  })

  it('лишнее в состоянии интерфейса отбрасывается: неизвестные комнаты, час приводится в диапазон', () => {
    const a = buildApartment(templateById('1b')!)
    const living = Object.values(a.rooms)[0]
    const text = JSON.stringify({
      format: PROJECT_FORMAT, version: 1, savedAt: '2026-01-01T00:00:00Z', apartment: a,
      flow: { roomCount: 1, areaM2: null, templateId: '1b', step: 'interior' }, ui: { hour: 25.5, lightsOff: { [living.id]: true, ghost: true, other: false }, activeRoomId: 'ghost' },
    })
    const r = parseProject(text, apartmentIssues)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.doc.ui.hour).toBeCloseTo(1.5, 6)
    expect(r.doc.ui.lightsOff).toEqual({ [living.id]: true })
    expect(r.doc.ui.activeRoomId).toBeNull()
    expect(r.doc.flow.areaM2).toBeNull()
  })

  it('файл для скачивания: имя с датой и временем, расширение json, нет проекта — нет файла', () => {
    expect(projectFile()).toBeNull()
    buildWork()
    const f = projectFile(new Date(2026, 10, 19, 14, 5))!
    expect(f.name).toBe('kvartira-2026-11-19-1405.json')
    expect(JSON.parse(f.text).format).toBe(PROJECT_FORMAT)
  })
})

describe('27.2 автосохранение и восстановление', () => {
  it('запись в хранилище и чтение обратно; восстановление возвращает всё, кроме истории отмены', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    buildWork()
    const before = JSON.stringify(apt())
    expect(saveToBrowser()).toBe(true)
    const r = readBrowserSave()!
    expect(r.ok).toBe(true)
    // Другое состояние, затем восстановление.
    resetFlowForTests()
    useInterior.setState({ hour: 3, lightsOff: {} })
    if (r.ok) restoreProject(r.doc)
    expect(JSON.stringify(apt())).toBe(before)
    expect(useFlow.getState()).toMatchObject({ step: 'interior', selectedTemplateId: '1b', roomCount: 1, areaM2: 43, areaText: '43' })
    expect(useInterior.getState().hour).toBe(22.5)
    expect(useInterior.getState().lightsOff[room('Комната').id]).toBe(true)
    expect(useInterior.getState().activeRoomId).toBe(room('Комната').id)
    expect(useApartmentProject.getState().history.past).toHaveLength(0) // история отмены не сохраняется
  })

  it('без проекта ничего не пишется; при закрытом хранилище причина в статусе, работа продолжается', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    expect(saveToBrowser()).toBe(false)
    buildWork()
    vi.stubGlobal('window', { localStorage: fakeStorage({ failSet: true }) })
    expect(saveToBrowser()).toBe(false)
    expect(useSaveStatus.getState().storageError).toContain('не хватает места')
    vi.stubGlobal('window', undefined)
    expect(saveToBrowser()).toBe(false)
    expect(useSaveStatus.getState().storageError).toContain('недоступно')
  })

  it('автосохранение срабатывает после паузы и только при изменении', () => {
    vi.useFakeTimers()
    const st = fakeStorage()
    vi.stubGlobal('window', { localStorage: st })
    const stop = startPersistence()
    expect(st.raw.has(STORAGE_KEY)).toBe(false) // пустой старт ничего не пишет
    buildWork()
    vi.advanceTimersByTime(300)
    expect(st.raw.has(STORAGE_KEY)).toBe(false) // пауза ещё не прошла
    vi.advanceTimersByTime(400)
    expect(st.raw.has(STORAGE_KEY)).toBe(true)
    expect(useSaveStatus.getState().savedAt).not.toBeNull()
    const first = st.raw.get(STORAGE_KEY)
    useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(room('Комната').id, { kind: 'carpet', colorId: 'carpet_blue' }))
    vi.advanceTimersByTime(700)
    expect(st.raw.get(STORAGE_KEY)).not.toBe(first)
    expect(JSON.parse(st.raw.get(STORAGE_KEY)!).apartment.floorCoverings[room('Комната').id].colorId).toBe('carpet_blue')
    stop()
  })

  it('найденное сохранение предлагается, автоматически не применяется и не затирается, пока нет решения', () => {
    vi.useFakeTimers()
    const st = fakeStorage()
    vi.stubGlobal('window', { localStorage: st })
    buildWork()
    saveToBrowser()
    const saved = st.raw.get(STORAGE_KEY)!
    resetFlowForTests()
    const stop = startPersistence()
    expect(useSaveStatus.getState().offer).not.toBeNull()
    expect(useFlow.getState().selectedTemplateId).toBeNull() // само не применилось
    // Пока решения нет, правки (выбор новой схемы) не затирают сохранение.
    useFlow.setState({ selectedTemplateId: '2a' })
    useApartmentProject.getState().reset(buildApartment(templateById('2a')!))
    vi.advanceTimersByTime(2000)
    expect(st.raw.get(STORAGE_KEY)).toBe(saved)
    useFlow.setState({ selectedTemplateId: null })
    acceptOffer()
    expect(useSaveStatus.getState().offer).toBeNull()
    expect(useFlow.getState().selectedTemplateId).toBe('1b')
    expect(Object.keys(apt().furniture)).toEqual(['sofa1'])
    stop()
  })

  it('отказ от сохранения удаляет его из хранилища; повреждённое сохранение не ломает запуск и удаляется с объяснением', () => {
    const st = fakeStorage()
    vi.stubGlobal('window', { localStorage: st })
    buildWork()
    saveToBrowser()
    resetFlowForTests()
    let stop = startPersistence()
    discardOffer()
    expect(st.raw.has(STORAGE_KEY)).toBe(false)
    expect(useSaveStatus.getState().offer).toBeNull()
    stop()
    st.raw.set(STORAGE_KEY, '{"format":"interior-planner-project","version":1,"битый')
    stop = startPersistence()
    expect(useSaveStatus.getState().offer).toBeNull()
    expect(useSaveStatus.getState().storageError).toContain('не открыт')
    expect(st.raw.has(STORAGE_KEY)).toBe(false)
    stop()
    clearBrowserSave()
  })
})

describe('27.3 новый проект и открытие файла', () => {
  it('новый проект: при наличии работы сначала подтверждение, отмена ничего не меняет, подтверждение очищает всё и сохранение', () => {
    const st = fakeStorage()
    vi.stubGlobal('window', { localStorage: st })
    buildWork()
    saveToBrowser()
    const before = JSON.stringify(apt())
    requestNewProject()
    expect(useSaveStatus.getState().dialog).toEqual({ kind: 'new' })
    useSaveStatus.setState({ dialog: null }) // отмена
    expect(JSON.stringify(apt())).toBe(before)
    expect(st.raw.has(STORAGE_KEY)).toBe(true)
    requestNewProject()
    confirmDialog({ kind: 'new' })
    expect(useFlow.getState().selectedTemplateId).toBeNull()
    expect(useFlow.getState().step).toBe('params')
    expect(Object.keys(apt().furniture)).toHaveLength(0)
    expect(useInterior.getState().hour).toBe(15)
    expect(st.raw.has(STORAGE_KEY)).toBe(false)
  })

  it('открытие файла: плохой файл показывает причину и не трогает проект; хороший при наличии работы просит подтверждения', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    buildWork()
    const before = JSON.stringify(apt())
    importProjectText('это не проект')
    expect(useSaveStatus.getState().importError).toContain('JSON')
    expect(JSON.stringify(apt())).toBe(before)
    // Хороший файл другого проекта.
    const other = buildApartment(templateById('2a')!)
    const text = serializeProject(other, { roomCount: 2, areaM2: 52, templateId: '2a', step: 'setup' }, { hour: 8, lightsOff: {}, activeRoomId: null })
    importProjectText(text)
    const d = useSaveStatus.getState().dialog as { kind: 'open'; doc: ProjectDocument }
    expect(d.kind).toBe('open')
    expect(JSON.stringify(apt())).toBe(before) // до подтверждения не заменено
    confirmDialog(d)
    expect(useFlow.getState().selectedTemplateId).toBe('2a')
    expect(apt().id).toBe(other.id)
    expect(useInterior.getState().hour).toBe(8)
    expect(useSaveStatus.getState().importError).toBeNull()
  })

  it('открытие файла без текущей работы применяется сразу', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    const other = buildApartment(templateById('3a')!)
    importProjectText(serializeProject(other, { roomCount: 3, areaM2: null, templateId: '3a', step: 'interior' }, { hour: 12, lightsOff: {}, activeRoomId: null }))
    expect(useSaveStatus.getState().dialog).toBeNull()
    expect(useFlow.getState()).toMatchObject({ selectedTemplateId: '3a', step: 'interior', roomCount: 3, areaM2: null, areaText: '' })
    expect(useSaveStatus.getState().notice).toContain('открыт')
  })
})
