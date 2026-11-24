import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/catalog/catalog'
import { elevationOf, validateFurniturePlacement, validatePlacement } from '../../src/domain/placement'
import { resetFlowForTests, useApartmentProject } from '../../src/scenario/flow'
import { useInterior } from '../../src/scenario/interior'
import { useInteriorEditor } from '../../src/scenario/interiorEditor'
import { buildApartment, templateById } from '../../src/scenario/layouts'
import { MAX_ACTIVE_LIGHTS, roomLights } from '../../src/scene3d/roomLights'
import { roomCenter } from '../../src/scene3d/roomGeometry'

// Этап 21: потолочный свет, светильники, бра, люстры, предел источников (SPEC D-11, D-14).
const apt = () => useApartmentProject.getState().history.present
const ed = () => useInteriorEditor.getState()
const roomId = () => useInterior.getState().activeRoomId!
const items = (id: string) => Object.values(apt().furniture).filter((f) => f.catalogItemId === id)
const lights = () => roomLights(apt(), CATALOG, roomId(), roomCenter(apt(), roomId()))

beforeEach(() => {
  resetFlowForTests()
  useApartmentProject.getState().reset(buildApartment(templateById('1b')!))
  useInterior.setState({ activeRoomId: null, enteredVia: null, selectedOpeningId: null, notice: null, lightsOff: {} })
  useInteriorEditor.setState({ selectedId: null, draft: null, message: null })
  useInterior.getState().enter(Object.values(apt().rooms).find((r) => r.name === 'Комната')!.id)
})

describe('21.2 каталог светильников', () => {
  it('есть торшеры, настольные лампы, бра, люстры и плафон; у каждого свой способ установки и свет', () => {
    const lit = Object.values(CATALOG).filter((i) => i.light)
    expect(lit.length).toBeGreaterThanOrEqual(10)
    for (const id of ['kenney_lampRoundFloor', 'kenney_lampSquareFloor', 'fm_floor_lamp_arc']) expect(CATALOG[id].mount, id).toBe('floor')
    for (const id of ['kenney_lampRoundTable', 'kenney_lampSquareTable', 'fm_table_lamp_wood']) expect(CATALOG[id].mount, id).toBe('surface')
    expect(CATALOG.kenney_lampWall.mount).toBe('wall')
    expect(CATALOG.kenney_lampWall.mountHeightCm).toBe(160)
    for (const id of ['own_chandelier_classic', 'own_chandelier_round', 'kenney_lampSquareCeiling']) {
      expect(CATALOG[id].mount, id).toBe('ceiling')
      expect(CATALOG[id].light?.chandelier, id).toBe(true)
    }
    for (const i of lit) {
      expect(i.light!.intensityCd, i.id).toBeGreaterThan(0)
      expect(i.light!.offsetCm.y, i.id).toBeLessThanOrEqual(i.heightCm + 1)
    }
  })

  it('собственные модели люстр записаны в реестр как собственные работы без указания авторства', () => {
    for (const id of ['own_chandelier_classic', 'own_chandelier_round']) {
      expect(CATALOG[id].license.license).toContain('Собственная')
      expect(CATALOG[id].license.attribution).toBe('Не требуется')
    }
  })
})

describe('21.1 потолочный свет комнаты', () => {
  it('в комнате без люстры есть стандартный подвесной светильник под потолком по центру', () => {
    const l = lights()
    expect(l.all).toHaveLength(1)
    expect(l.all[0].kind).toBe('ceiling')
    expect(l.all[0].yCm).toBeLessThan(apt().ceilingHeightCm)
    expect(l.all[0].yCm).toBeGreaterThan(apt().ceilingHeightCm - 60)
    expect(l.dropped).toBe(0)
  })

  it('люстра заменяет стандартный светильник и берёт его роль (D-14)', () => {
    ed().addAtFreeSpot('own_chandelier_classic')
    const l = lights()
    expect(items('own_chandelier_classic')).toHaveLength(1)
    expect(l.all.map((e) => e.kind)).toEqual(['chandelier'])
    // Люстра висит от потолка вниз: верх по высоте потолка.
    const f = items('own_chandelier_classic')[0]
    expect(elevationOf(apt(), CATALOG[f.catalogItemId], f) + CATALOG[f.catalogItemId].heightCm).toBeCloseTo(apt().ceilingHeightCm, 6)
    expect(validatePlacement(apt(), CATALOG, { ...f, id: f.id })).toMatchObject({ valid: true })
  })

  it('высота потолка меняет высоту люстры: она не остаётся висеть в воздухе', () => {
    ed().addAtFreeSpot('own_chandelier_round')
    const f = items('own_chandelier_round')[0]
    const item = CATALOG[f.catalogItemId]
    const before = elevationOf(apt(), item, f)
    const raised = { ...apt(), ceilingHeightCm: apt().ceilingHeightCm + 30 }
    expect(elevationOf(raised, item, f)).toBeCloseTo(before + 30, 6)
    expect(validateFurniturePlacement(CATALOG)(raised)).toEqual([])
  })

  it('люстра ставится в центр комнаты, две люстры не пересекаются', () => {
    ed().addAtFreeSpot('own_chandelier_round')
    const c = roomCenter(apt(), roomId())
    const f = items('own_chandelier_round')[0]
    expect(Math.hypot(f.xCm - c.x, f.zCm - c.z)).toBeLessThan(25)
    const r = validatePlacement(apt(), CATALOG, { id: null, catalogItemId: 'own_chandelier_round', roomId: roomId(), xCm: f.xCm, zCm: f.zCm, angleDeg: 0 })
    expect(r.valid).toBe(false)
    expect(r.code).toBe('overlap')
  })
})

describe('21.2 бра, торшеры и настольные лампы', () => {
  it('бра встаёт на стену лицом в комнату на высоте 160 см и проходит проверку проекта', () => {
    ed().addAtFreeSpot('kenney_lampWall')
    const f = items('kenney_lampWall')[0]
    expect(f).toBeDefined()
    expect(f.elevationCm).toBe(160)
    expect(validateFurniturePlacement(CATALOG)(apt())).toEqual([])
    const l = lights()
    expect(l.all.some((e) => e.key === f.id && e.kind === 'lamp')).toBe(true)
  })

  it('бра при переносе притягивается к ближайшей стене, из середины комнаты оно не ставится', () => {
    const c = roomCenter(apt(), roomId())
    ed().beginDrag({ catalogItemId: 'kenney_lampWall' }, { x: c.x, z: c.z }, 'catalog')
    // Тянем в стороны от центра: положение притягивается к ближайшей стене под прямым углом лицом в комнату.
    // На части стен окно или дверь, там бра отклоняется, но хотя бы одна из четырёх сторон допустима.
    const valid: Array<{ x: number; z: number }> = []
    for (const [dx, dz] of [[-400, 0], [400, 0], [0, -400], [0, 400]]) {
      ed().moveDrag({ x: c.x + dx, z: c.z + dz }, true)
      const d = ed().draft!
      expect(d.angleDeg % 90, `угол ${d.angleDeg}`).toBeCloseTo(0, 3)
      if (d.result.valid) {
        expect(d.result.elevationCm).toBe(160)
        valid.push({ x: d.xCm, z: d.zCm })
      }
    }
    expect(valid.length).toBeGreaterThan(0)
    ed().moveDrag({ x: valid[0].x, z: valid[0].z }, true)
    ed().endDrag()
    expect(items('kenney_lampWall')).toHaveLength(1)
    expect(validateFurniturePlacement(CATALOG)(apt())).toEqual([])
  })

  it('настольная лампа ставится только на стол или тумбу, торшер на пол', () => {
    ed().addAtFreeSpot('kenney_lampRoundTable')
    expect(items('kenney_lampRoundTable')).toHaveLength(0)
    expect(ed().message).toContain('стол или тумбу')
    ed().addAtFreeSpot('modern_coffee_table_01')
    ed().addAtFreeSpot('kenney_lampRoundTable')
    expect(items('kenney_lampRoundTable')).toHaveLength(1)
    ed().addAtFreeSpot('kenney_lampRoundFloor')
    expect(items('kenney_lampRoundFloor')[0].elevationCm).toBe(0)
  })
})

describe('21.3 предел источников света', () => {
  it('светят не больше MAX_ACTIVE_LIGHTS, главный источник всегда в числе светящих', () => {
    for (let i = 0; i < 9; i++) ed().addAtFreeSpot('kenney_lampRoundFloor')
    const l = lights()
    expect(l.all.length).toBe(1 + items('kenney_lampRoundFloor').length)
    expect(l.active.length).toBeLessThanOrEqual(MAX_ACTIVE_LIGHTS)
    expect(l.active[0].kind).toBe('ceiling')
    expect(l.dropped).toBe(l.all.length - l.active.length)
    expect(l.all.length).toBeGreaterThan(MAX_ACTIVE_LIGHTS)
  })

  it('выключатель комнаты у каждой комнаты свой и не попадает в проект и историю', () => {
    const past = useApartmentProject.getState().history.past.length
    const before = JSON.stringify(apt())
    const a = roomId()
    const other = Object.values(apt().rooms).find((r) => r.id !== a)!.id
    useInterior.getState().toggleLights(a)
    expect(useInterior.getState().lightsOff[a]).toBe(true)
    expect(useInterior.getState().lightsOff[other]).toBeUndefined()
    useInterior.getState().enter(other)
    useInterior.getState().enter(a)
    expect(useInterior.getState().lightsOff[a]).toBe(true) // состояние сохраняется при переходах
    useInterior.getState().toggleLights(a)
    expect(useInterior.getState().lightsOff[a]).toBeUndefined()
    expect(JSON.stringify(apt())).toBe(before)
    expect(useApartmentProject.getState().history.past.length).toBe(past)
  })
})
