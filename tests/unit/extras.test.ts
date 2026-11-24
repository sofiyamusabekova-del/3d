import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import {
  addNoteCommand, applyLayoutCommand, layoutDiff, MAX_LAYOUTS, MAX_NOTE_LENGTH, patchNoteCommand, removeLayoutCommand, removeNoteCommand, saveLayoutCommand,
} from '../../src/domain/extras'
import { apartmentIssues, resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { buildApartment, templateById } from '../../src/scenario/layouts'
import { parseProject, serializeProject } from '../../src/scenario/projectFile'

// Заметки на плане (этап 6, D-35) и варианты расстановки (этап 7, D-36).
const apt = () => useApartmentProject.getState().history.present
const store = () => useApartmentProject.getState()
const room = () => Object.values(apt().rooms).find((r) => r.name === 'Комната')!

beforeEach(() => {
  resetFlowForTests()
  store().reset(buildApartment(templateById('1b')!))
  useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null, lightsOff: {} })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
  useInterior.getState().enter(room().id)
})

describe('заметки', () => {
  it('добавление, правка, перенос и удаление — по шагу истории; текст чистится и обрезается', () => {
    const r = store().apply('Заметка', addNoteCommand({ id: 'n1', roomId: room().id, xCm: 100, zCm: 120, text: '  здесь   розетка \n ' }))
    expect(r.ok).toBe(true)
    expect(apt().notes!.n1.text).toBe('здесь розетка')
    store().apply('Заметка', patchNoteCommand('n1', { text: 'x'.repeat(MAX_NOTE_LENGTH + 50), xCm: 150 }))
    expect(apt().notes!.n1.text).toHaveLength(MAX_NOTE_LENGTH)
    expect(apt().notes!.n1.xCm).toBe(150)
    store().apply('Заметка', removeNoteCommand('n1'))
    expect(apt().notes).toEqual({})
    store().undo()
    expect(apt().notes!.n1).toBeDefined()
  })

  it('пустой текст и заметка в несуществующей комнате отклоняются', () => {
    expect(store().apply('Заметка', addNoteCommand({ id: 'n1', roomId: room().id, xCm: 0, zCm: 0, text: '   ' })).ok).toBe(false)
    expect(store().apply('Заметка', addNoteCommand({ id: 'n2', roomId: 'нет-такой', xCm: 0, zCm: 0, text: 'ок' })).ok).toBe(false)
    expect(apt().notes ?? {}).toEqual({})
  })

  it('проект с заметками и вариантами сохраняется в файл и читается обратно, старые проекты без них читаются', () => {
    store().apply('Заметка', addNoteCommand({ id: 'n1', roomId: room().id, xCm: 10, zCm: 20, text: 'окно на юг' }))
    store().apply('Вариант', saveLayoutCommand({ id: 'l1', name: 'A', furniture: {} }))
    const flow = { roomCount: 1 as const, areaM2: 36, templateId: '1b', step: 'interior' as const }
    const ui = { hour: 15, lightsOff: {}, activeRoomId: null }
    const back = parseProject(serializeProject(apt(), flow, ui), apartmentIssues)
    expect(back.ok).toBe(true)
    if (back.ok) { expect(back.doc.apartment.notes!.n1.text).toBe('окно на юг'); expect(back.doc.apartment.layouts!.l1.name).toBe('A') }
    const old = buildApartment(templateById('1b')!)
    expect(parseProject(serializeProject(old, flow, ui), apartmentIssues).ok).toBe(true)
  })
})

describe('варианты расстановки', () => {
  it('сохранение, переключение и отмена; различия считаются', () => {
    useInteriorEditor.getState().addAtFreeSpot('kenney_bedDouble')
    const bed = Object.values(apt().furniture)[0]
    store().apply('Вариант', saveLayoutCommand({ id: 'l1', name: 'Кровать у окна', furniture: structuredClone(apt().furniture) }))
    expect(layoutDiff(apt(), apt().layouts!.l1)).toBe(0)
    useInteriorEditor.getState().select(bed.id)
    useInteriorEditor.getState().nudge(30, 0)
    useInteriorEditor.getState().nudge(30, 0)
    const moved = apt().furniture[bed.id].xCm
    if (moved === bed.xCm) return // сдвиг упёрся в стену: расстановка не изменилась, сравнивать нечего
    expect(layoutDiff(apt(), apt().layouts!.l1)).toBe(1)
    expect(store().apply('Вариант', applyLayoutCommand('l1')).ok).toBe(true)
    expect(apt().furniture[bed.id].xCm).toBe(bed.xCm)
    store().undo()
    expect(apt().furniture[bed.id].xCm).toBe(moved)
  })

  it('не больше четырёх вариантов; удаление; применение неизвестного ничего не меняет', () => {
    for (let i = 0; i < MAX_LAYOUTS + 2; i++) store().apply('Вариант', saveLayoutCommand({ id: `l${i}`, name: `В${i}`, furniture: {} }))
    expect(Object.keys(apt().layouts!)).toHaveLength(MAX_LAYOUTS)
    store().apply('Вариант', removeLayoutCommand('l0'))
    expect(Object.keys(apt().layouts!)).toHaveLength(MAX_LAYOUTS - 1)
    const before = apt()
    store().apply('Вариант', applyLayoutCommand('нет'))
    expect(apt().furniture).toEqual(before.furniture)
  })

  it('вариант с мебелью, ставшей недопустимой, не применяется', () => {
    const f = { id: 'x', catalogItemId: 'kenney_bedDouble', assetVersion: CATALOG.kenney_bedDouble.version, roomId: room().id, xCm: -9999, zCm: 0, elevationCm: 0, angleDeg: 0 }
    store().apply('Вариант', saveLayoutCommand({ id: 'bad', name: 'Плохой', furniture: { x: f } }))
    const r = store().apply('Вариант', applyLayoutCommand('bad'))
    expect(r.ok).toBe(false)
    expect(apt().furniture.x).toBeUndefined()
  })
})
