import { create } from 'zustand'
import { CATALOG } from '../catalog/catalog'
import { MATERIALS } from '../catalog/materials'
import { isKnownFloor } from '../catalog/floors'
import { extrasIssues } from '../domain/extras'
import { validateFloorCoverings } from '../domain/floors'
import { validateSurfaceMaterials } from '../domain/finishes'
import { canUndo } from '../domain/history'
import { validateFurniturePlacement } from '../domain/placement'
import { createProjectStore } from '../domain/store'
import { validateApartment } from '../domain/validate'
import type { Apartment } from '../domain/types'
import { buildApartment, templateById } from './layouts'
import { parseAreaInput } from './input'

export type Step = 'params' | 'schemes' | 'setup' | 'interior'

const emptyApartment = (): Apartment => ({
  id: 'empty', schemaVersion: 1, ceilingHeightCm: 270, vertices: {}, walls: {}, rooms: {}, openings: {}, furniture: {}, surfaceMaterials: {}, floorCoverings: {},
})

const furnitureCheck = validateFurniturePlacement(CATALOG)
const surfaceCheck = validateSurfaceMaterials(MATERIALS)
const floorCheck = validateFloorCoverings(isKnownFloor)

/** Проект стартового сценария: единственный источник квартиры для плана и последующих этапов. */
export const useApartmentProject = createProjectStore(emptyApartment(), (a) => [...furnitureCheck(a), ...surfaceCheck(a), ...floorCheck(a), ...extrasIssues(a)])

/** Полная проверка квартиры, как при каждом изменении проекта; ею же проверяется загруженный файл (этап 27). */
export const apartmentIssues = (a: Apartment) => [...validateApartment(a), ...furnitureCheck(a), ...surfaceCheck(a), ...floorCheck(a), ...extrasIssues(a)]

/** Пустая квартира для нового проекта. */
export const newEmptyApartment = emptyApartment

export interface FlowState {
  step: Step
  roomCount: 1 | 2 | 3
  areaText: string
  /** Принятое значение площади; null, пока ввод не прошёл проверку. */
  areaM2: number | null
  areaError: string | null
  selectedTemplateId: string | null
  /** Схема, замену на которую ждёт подтверждения пользователя (есть правки). */
  pendingReplaceId: string | null
  setRoomCount: (n: 1 | 2 | 3) => void
  setAreaText: (text: string) => void
  submitParams: () => void
  chooseScheme: (id: string) => void
  confirmReplace: () => void
  cancelReplace: () => void
  goTo: (step: Step) => void
}

/** Есть ли в проекте правки пользователя, которые замена схемы уничтожит. */
const hasEdits = () => canUndo(useApartmentProject.getState().history)

export const useFlow = create<FlowState>((set, get) => {
  const apply = (id: string) => {
    const t = templateById(id)
    if (!t) return
    useApartmentProject.getState().reset(buildApartment(t)) // замена очищает историю отмены
    set({ selectedTemplateId: id, pendingReplaceId: null, step: 'setup' })
  }
  return {
    step: 'params',
    roomCount: 1,
    areaText: '',
    areaM2: null,
    areaError: null,
    selectedTemplateId: null,
    pendingReplaceId: null,
    setRoomCount: (n) => set({ roomCount: n }),
    // Ввод не теряется при возврате: текст хранится как есть, проверка — при переходе.
    setAreaText: (text) => set({ areaText: text, areaError: null }),
    submitParams: () => {
      const r = parseAreaInput(get().areaText)
      if (!r.ok) {
        set({ areaError: r.message, areaM2: null })
        return
      }
      set({ areaM2: r.valueM2, areaText: r.text, areaError: null, step: 'schemes' })
    },
    chooseScheme: (id) => {
      const { selectedTemplateId } = get()
      if (id === selectedTemplateId) return set({ step: 'setup' }) // повторный выбор продолжает работу
      if (selectedTemplateId && hasEdits()) return set({ pendingReplaceId: id }) // замена только после подтверждения
      apply(id)
    },
    confirmReplace: () => {
      const id = get().pendingReplaceId
      if (id) apply(id)
    },
    cancelReplace: () => set({ pendingReplaceId: null }),
    goTo: (step) => {
      if ((step === 'setup' || step === 'interior') && !get().selectedTemplateId) return
      if (step === 'schemes' && get().areaM2 === null) return
      set({ step, pendingReplaceId: null })
    },
  }
})

export const resetFlowForTests = () => {
  useApartmentProject.getState().reset(emptyApartment())
  useFlow.setState({ step: 'params', roomCount: 1, areaText: '', areaM2: null, areaError: null, selectedTemplateId: null, pendingReplaceId: null })
}
