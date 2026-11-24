import { create } from 'zustand'
import { doorTarget, passageGraph } from '../domain/doors'
import { selectApartment } from '../domain/store'
import type { Apartment, Id } from '../domain/types'
import { DEFAULT_HOUR, wrapHour } from '../scene3d/hour'
import { useApartmentProject } from './flow'

/** Комната, с которой начинается интерьер: с входной дверью, иначе первая по порядку. */
export function startRoomId(apt: Apartment): Id | null {
  const { entrances } = passageGraph(apt)
  return entrances[0] ?? Object.keys(apt.rooms)[0] ?? null
}

/**
 * Состояние шага «Интерьер» (EditorState, SPEC §6): активная комната, выбранный проём и сообщение.
 * Не часть проекта и не попадает в историю. Мебель и отделка лежат в проекте, поэтому переходы
 * между комнатами их не затрагивают (AC-05).
 */
export interface InteriorState {
  activeRoomId: Id | null
  /** Дверь, через которую вошли в комнату: от неё строится начальный вид. */
  enteredVia: Id | null
  selectedOpeningId: Id | null
  /** Выбранная сторона стены активной комнаты: любой участок её цепочки стен (SPEC §13). */
  selectedSideWallId: Id | null
  notice: string | null
  /** Время суток, часы 0–24: управляет солнцем, небом и видом за окнами. Не часть проекта и не в истории. */
  hour: number
  setHour: (hour: number) => void
  /** Выключенные комнаты (выключатель комнаты, D-11): по умолчанию свет везде включён. Не часть проекта и не в истории. */
  lightsOff: Record<Id, true>
  toggleLights: (roomId: Id) => void
  /** Сколько источников светит и сколько всего в активной комнате (пишет сцена, читает панель). */
  lightSummary: { active: number; total: number }
  setLightSummary: (s: { active: number; total: number }) => void
  /** Режим «Прогулка» (D-17): вид от первого лица по всей квартире. Не часть проекта и не в истории; activeRoomId не меняется. */
  walking: boolean
  /** Комната, в которой сейчас стоит игрок (свет и подсказки); null в проёме. */
  walkRoomId: Id | null
  startWalk: () => void
  stopWalk: () => void
  setWalkRoom: (roomId: Id | null) => void
  /** Выбор стороны стены для отделки; сбрасывает выбор проёма. */
  selectSide: (wallId: Id | null) => void
  /** Привести состояние в соответствие с квартирой: начальная комната или сброс, если комнаты уже нет. */
  sync: () => void
  enter: (roomId: Id, via?: Id | null) => void
  select: (openingId: Id | null) => void
  /** Нажатие на дверь: переход в соседнюю комнату; входная дверь только выбирается. */
  goThroughDoor: (doorId: Id) => void
}

export const useInterior = create<InteriorState>((set, get) => ({
  activeRoomId: null,
  enteredVia: null,
  selectedOpeningId: null,
  selectedSideWallId: null,
  notice: null,
  hour: DEFAULT_HOUR,
  setHour: (hour) => set({ hour: Number.isFinite(hour) ? wrapHour(hour) : DEFAULT_HOUR }),
  lightsOff: {},
  toggleLights: (roomId) => set((s) => {
    const next = { ...s.lightsOff }
    if (next[roomId]) delete next[roomId]
    else next[roomId] = true
    return { lightsOff: next }
  }),
  walking: false,
  walkRoomId: null,
  startWalk: () => { const { activeRoomId } = get(); if (activeRoomId) set({ walking: true, walkRoomId: activeRoomId, selectedOpeningId: null, selectedSideWallId: null }) },
  stopWalk: () => set({ walking: false, walkRoomId: null }),
  setWalkRoom: (walkRoomId) => set((s) => (s.walkRoomId === walkRoomId ? s : { walkRoomId })),
  lightSummary: { active: 0, total: 0 },
  setLightSummary: (lightSummary) => set((s) => (s.lightSummary.active === lightSummary.active && s.lightSummary.total === lightSummary.total ? s : { lightSummary })),
  selectSide: (wallId) => set({ selectedSideWallId: wallId, selectedOpeningId: null, notice: null }),
  sync: () => {
    const apt = selectApartment(useApartmentProject.getState())
    const { activeRoomId } = get()
    if (activeRoomId && apt.rooms[activeRoomId]) return
    set({ activeRoomId: startRoomId(apt), enteredVia: null, selectedOpeningId: null, selectedSideWallId: null, notice: null })
  },
  enter: (roomId, via = null) => {
    const apt = selectApartment(useApartmentProject.getState())
    if (!apt.rooms[roomId]) return
    // Выбор сбрасывается при любой смене помещения: скрытые объекты ничего не перехватывают.
    set({ activeRoomId: roomId, enteredVia: via, selectedOpeningId: null, selectedSideWallId: null, notice: null, walking: false, walkRoomId: null })
  },
  select: (openingId) => set({ selectedOpeningId: openingId, selectedSideWallId: openingId ? null : get().selectedSideWallId, notice: null }),
  goThroughDoor: (doorId) => {
    const apt = selectApartment(useApartmentProject.getState())
    const { activeRoomId } = get()
    const door = apt.openings[doorId]
    if (!activeRoomId || !door || door.kind !== 'door') return
    const target = doorTarget(apt, doorId, activeRoomId)
    if (!target) {
      set({ selectedOpeningId: doorId, selectedSideWallId: null, notice: 'Входная дверь ведёт наружу: за ней нет комнаты.' })
      return
    }
    get().enter(target, doorId)
  },
}))
