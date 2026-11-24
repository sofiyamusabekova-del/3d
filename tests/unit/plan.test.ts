import { describe, expect, it } from 'vitest'
import { roomNetAreaM2, wallLengthCm } from '../../src/domain/derive'
import { planDrawing } from '../../src/plan2d/drawing'
import { fitViewport, panBy, planToScreen, screenToPlan, zoomAt, type Viewport } from '../../src/plan2d/view'
import { twoRoomApartment } from './fixtures'

describe('6.1 рисунок плана из общей модели', () => {
  const apt = twoRoomApartment()
  const d = planDrawing(apt)

  it('комнаты: чистовые размеры и площадь совпадают с моделью (см, м²)', () => {
    const A = d.rooms.find((r) => r.id === 'A')!
    const B = d.rooms.find((r) => r.id === 'B')!
    expect([A.widthCm, A.depthCm]).toEqual([400, 300])
    expect([B.widthCm, B.depthCm]).toEqual([200, 300])
    expect(A.areaM2).toBeCloseTo(roomNetAreaM2(apt, apt.rooms.A), 9)
    expect(A.areaM2 + B.areaM2).toBeCloseTo(18, 9)
  })
  it('стены: одна общая перегородка рисуется один раз, толщина и длина из модели', () => {
    expect(d.walls).toHaveLength(Object.keys(apt.walls).length)
    const shared = d.walls.find((w) => w.id === 'wShared')!
    expect(shared.lengthCm).toBeCloseTo(wallLengthCm(apt, apt.walls.wShared), 9)
    const xs = shared.polygon.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 9) // толщина 10 см
  })
  it('проём общей двери: вырез на всю толщину перегородки, створка в комнате открывания', () => {
    const door = d.openings.find((o) => o.id === 'door1')!
    const xs = door.cut.map((p) => p.x)
    const zs = door.cut.map((p) => p.z)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([400, 410])
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([85, 165])
    expect(door.leaf!.hinge).toEqual({ x: 400, z: 85 })
    expect(door.leaf!.open.x).toBeCloseTo(320, 9) // открыта в комнату А (к −x), ширина 80 см
    expect(door.leaf!.radiusCm).toBe(80)
  })
  it('предмет шириной 100 см рисуется шириной 100 ед. плана (AC-02): единицы плана — см', () => {
    // Рисунок не масштабирует: всё в см, масштаб вносится только видом (viewport).
    const vp: Viewport = { xCm: 0, zCm: 0, pxPerCm: 2 }
    const a = planToScreen(vp, { x: 0, z: 0 })
    const b = planToScreen(vp, { x: 100, z: 0 })
    expect(b.x - a.x).toBe(200)
  })
  it('границы рисунка охватывают внешние стороны стен', () => {
    expect(d.bounds.minX).toBeCloseTo(-30, 9) // ось −15 минус половина толщины 15, ещё на 15 из-за продления конца
    expect(d.bounds.maxX).toBeGreaterThanOrEqual(640)
  })
})

describe('6.2 перевод указателя: масштаб и сдвиг', () => {
  const vps: Viewport[] = [
    { xCm: 0, zCm: 0, pxPerCm: 1 },
    { xCm: -120, zCm: 45, pxPerCm: 0.37 },
    { xCm: 300, zCm: -80, pxPerCm: 6.5 },
  ]
  it('экран → проект → экран возвращает ту же точку при любом масштабе и сдвиге', () => {
    for (const vp of vps) {
      const p = screenToPlan(vp, 333, 217)
      const s = planToScreen(vp, p)
      expect(s.x).toBeCloseTo(333, 9)
      expect(s.y).toBeCloseTo(217, 9)
    }
  })
  it('одна и та же точка плана даёт одни и те же координаты после масштабирования и сдвига', () => {
    const start: Viewport = { xCm: -50, zCm: -50, pxPerCm: 1.2 }
    const target = { x: 210, z: 175 }
    let vp = start
    const where = () => planToScreen(vp, target)
    for (const f of [1.5, 0.4, 2, 0.8, 3]) {
      const s = where()
      vp = zoomAt(vp, s.x, s.y, f) // масштаб вокруг самой точки: она не уезжает
      expect(where().x).toBeCloseTo(s.x, 9)
      expect(where().y).toBeCloseTo(s.y, 9)
      const back = screenToPlan(vp, where().x, where().y)
      expect(back.x).toBeCloseTo(210, 9)
      expect(back.z).toBeCloseTo(175, 9)
    }
    vp = panBy(vp, 80, -35)
    const back = screenToPlan(vp, where().x, where().y)
    expect([back.x, back.z].map((n) => Math.round(n))).toEqual([210, 175])
  })
  it('масштаб вокруг указателя оставляет под ним ту же точку проекта', () => {
    const vp: Viewport = { xCm: 0, zCm: 0, pxPerCm: 1 }
    const before = screenToPlan(vp, 400, 300)
    const z = zoomAt(vp, 400, 300, 2.5)
    const after = screenToPlan(z, 400, 300)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.z).toBeCloseTo(before.z, 9)
    expect(z.pxPerCm).toBe(2.5)
  })
  it('предел масштаба не нарушает инвариант', () => {
    const vp: Viewport = { xCm: 0, zCm: 0, pxPerCm: 7 }
    const z = zoomAt(vp, 100, 100, 10)
    expect(z.pxPerCm).toBe(8)
    expect(screenToPlan(z, 100, 100).x).toBeCloseTo(screenToPlan(vp, 100, 100).x, 9)
  })
  it('вписывание: прямоугольник помещается с полем и центрируется', () => {
    const vp = fitViewport({ minX: 0, minZ: 0, maxX: 600, maxZ: 300 }, 1000, 500, 20)
    expect(vp.pxPerCm).toBeCloseTo(460 / 300, 9) // ограничивает высота
    const tl = planToScreen(vp, { x: 0, z: 0 })
    const br = planToScreen(vp, { x: 600, z: 300 })
    expect(tl.y).toBeCloseTo(20, 6)
    expect(500 - br.y).toBeCloseTo(20, 6)
    expect(tl.x).toBeCloseTo(1000 - br.x, 6) // по горизонтали центрирован
  })
})
