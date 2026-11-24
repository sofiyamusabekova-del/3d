import { useEffect, useMemo, useState } from 'react'
import { MATERIALS, PAINTS, WALLPAPERS } from '../catalog/materials'
import { CATALOG } from '../catalog/catalog'
import { FURNISH_STYLE_NAMES, furnishSetFor, type FurnishStyle } from '../catalog/sets'
import { BOARD_CM, FLOOR_KINDS, FLOORS, floorColorOf } from '../catalog/floors'
import { setFloorCoveringCommand } from '../domain/floors'
import type { FloorCovering } from '../domain/types'
import { analyzeClearance, MIN_PASSAGE_CM } from '../domain/clearance'
import { dimensionLines, nearestDoorCm } from '../domain/dimensions'
import { patchNoteCommand } from '../domain/extras'
import { roomClearPolygon, roomNetAreaM2 } from '../domain/derive'
import { doorTarget, roomsOfWall } from '../domain/doors'
import { neighbourRooms, roomSides, setSideFinishCommand, sideLabel, sideMaterialId, textureRepeats } from '../domain/finishes'
import { selectApartment, selectCanRedo, selectCanUndo } from '../domain/store'
import { formatCm, formatM2 } from '../geometry/units'
import { PlanView, type PlanSurface } from '../plan2d/PlanView'
import { InteriorScene, interiorProbe } from '../scene3d/InteriorScene'
import { walkState } from '../scene3d/walkState'
import { TimeOfDay, WalkHint } from './TimeOfDay'
import { WebGLGuard } from '../scene3d/WebGLGuard'
import { useApartmentProject, useFlow } from '../scenario/flow'
import { useInterior } from '../scenario/interior'
import { useInteriorEditor } from '../scenario/interiorEditor'
import { CatalogPanel } from './CatalogPanel'
import { LayoutsPanel, NotesPanel } from './ExtrasPanels'
import { ShoppingPanel } from './ShoppingPanel'
import { QualityShot } from './QualityShot'
import { card, secondary } from './styles'

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

type PlanMode = 'room' | 'all'

/**
 * Шаг «Интерьер»: слева панель, в центре план (крупно активная комната или вся квартира), справа 3D
 * той же комнаты. План и 3D читают один проект и один редактор, поэтому выбор, положение и поворот
 * предметов совпадают (SPEC §10). Геометрия здесь не правится.
 */
export function InteriorStep() {
  const apt = useApartmentProject(selectApartment)
  const canUndo = useApartmentProject(selectCanUndo)
  const canRedo = useApartmentProject(selectCanRedo)
  const goTo = useFlow((s) => s.goTo)
  const { activeRoomId, selectedOpeningId, selectedSideWallId, notice, sync, enter, goThroughDoor, selectSide } = useInterior()
  const [furnishStyle, setFurnishStyle] = useState<FurnishStyle>('classic')
  const [finishMessage, setFinishMessage] = useState<string | null>(null)
  const [finishNotice, setFinishNotice] = useState<string | null>(null)
  const { selectedId, draft, message, addAtFreeSpot, removeSelected, rotate, quarterTurn, cancelDrag, nudge, beginDrag, setElevation, furnishRoom } = useInteriorEditor()
  const [mode, setMode] = useState<PlanMode>('room')
  const walking = useInterior((s) => s.walking)
  useEffect(() => { sync() }, [sync, apt])

  // Клавиши предметов (как в The Sims): R / Shift+R — четверть оборота (предмет сам отходит от стены, если не помещается),
  // Alt+R / Alt+Shift+R — точный шаг 15°, Delete — удалить, Esc — отменить перенос, Ctrl+Z / Ctrl+Y.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (useInterior.getState().walking) return // в прогулке клавиши принадлежат ходьбе (WalkController)
      const k = e.key.toLowerCase()
      // e.code — чтобы R работала и в русской раскладке (там на этой клавише «к»).
      if ((k === 'r' || e.code === 'KeyR') && !e.ctrlKey && !e.metaKey) { if (e.altKey) rotate(e.shiftKey ? -15 : 15); else quarterTurn(e.shiftKey ? -1 : 1) }
      else if (k === 'escape') cancelDrag()
      else if (k === 'delete') removeSelected()
      else if (k.startsWith('arrow') && !e.ctrlKey) {
        const step = e.shiftKey ? 10 : 1
        nudge(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0)
      }
      else if (e.ctrlKey && k === 'z') useApartmentProject.getState().undo()
      else if (e.ctrlKey && k === 'y') useApartmentProject.getState().redo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotate, quarterTurn, cancelDrag, removeSelected, nudge])

  // Потеря захвата (окно потеряло фокус, жест отменён) и отпускание вне плана и 3D отменяют перенос (14.6).
  useEffect(() => {
    const drop = (e: PointerEvent) => {
      const d = useInteriorEditor.getState().draft
      if (!d || d.view !== 'catalog') return
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-testid=interior-plan], [data-testid=interior-scene]')
      if (!over) useInteriorEditor.setState({ draft: null, message: 'Отпустите предмет над планом или 3D' })
    }
    const lost = () => { if (useInteriorEditor.getState().draft) cancelDrag() }
    window.addEventListener('pointerup', drop, true) // раньше обработчиков плана и 3D
    window.addEventListener('pointercancel', lost)
    window.addEventListener('blur', lost)
    return () => { window.removeEventListener('pointerup', drop, true); window.removeEventListener('pointercancel', lost); window.removeEventListener('blur', lost) }
  }, [cancelDrag])

  // Отладочный доступ для проверок: проект, редактор, состояние отрисовки и память видеокарты.
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__interior = {
      project: useApartmentProject,
      store: useInterior,
      editor: useInteriorEditor,
      probe: interiorProbe,
      walk: walkState,
      geometries: () => interiorProbe.gl?.info.memory.geometries ?? -1,
      scenePosition: (id: string) => {
        let found: { xCm: number; zCm: number; angleDeg: number } | null = null
        interiorProbe.scene?.traverse((o) => {
          if (o.name === `furniture-${id}`) found = { xCm: o.position.x * 100, zCm: o.position.z * 100, angleDeg: (o.rotation.y * 180) / Math.PI }
        })
        return found
      },
    }
  }, [])

  const room = activeRoomId ? apt.rooms[activeRoomId] : undefined
  const bounds = useMemo(() => {
    if (!room) return null
    const poly = roomClearPolygon(apt, room)
    const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
    const m = 40
    return { minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m, minZ: Math.min(...zs) - m, maxZ: Math.max(...zs) + m }
  }, [apt, room])
  const openings = useMemo(
    () => (room ? Object.values(apt.openings).filter((o) => room.boundary.some((b) => b.wallId === o.wallId)) : []),
    [apt, room],
  )
  const doors = openings.filter((o) => o.kind === 'door')
  const windows = openings.filter((o) => o.kind === 'window')
  const roomFurniture = room ? Object.values(apt.furniture).filter((f) => f.roomId === room.id) : []
  const selectedOpening = selectedOpeningId ? apt.openings[selectedOpeningId] : undefined
  const sel = selectedId ? apt.furniture[selectedId] : null

  // Проходы (D-31): подсказки, не запреты. Считаются по проекту; во время переноса не пересчитываются.
  const clearance = useMemo(() => (room ? analyzeClearance(apt, CATALOG, room.id).map((c, i) => ({ ...c, key: `${c.kind}-${i}` })) : []), [apt, room])
  const [activeIssue, setActiveIssue] = useState<string | null>(null)

  // Размеры (D-32): от выбранного предмета до стен и соседей; при переносе — от положения в руке.
  const [showDims, setShowDims] = useState(true)
  const [selectedNote, setSelectedNote] = useState<string | null>(null)
  const roomNotes = useMemo(() => (room ? Object.values(apt.notes ?? {}).filter((n) => n.roomId === room.id) : []), [apt, room])
  const dimSubject = useMemo(() => {
    if (!sel || !room || sel.roomId !== room.id) return null
    const d = draft && draft.id === sel.id && draft.mode !== 'lift' ? draft : null
    return { itemId: sel.catalogItemId, xCm: d?.xCm ?? sel.xCm, zCm: d?.zCm ?? sel.zCm, angleDeg: d?.angleDeg ?? sel.angleDeg, selfId: sel.id, roomId: room.id }
  }, [sel, room, draft])
  const dims = useMemo(() => (showDims && dimSubject ? dimensionLines(apt, CATALOG, dimSubject) : []), [apt, showDims, dimSubject])
  const doorDist = useMemo(() => (dimSubject ? nearestDoorCm(apt, CATALOG, dimSubject) : null), [apt, dimSubject])

  // Отделка (SPEC §13): стороны активной комнаты и полосы отделки на плане для всех комнат.
  const sides = useMemo(() => (room ? roomSides(apt, room.id) : []), [apt, room])
  const selSide = selectedSideWallId ? sides.find((s) => s.wallIds.includes(selectedSideWallId)) ?? null : null
  const surfaces = useMemo<PlanSurface[]>(() => Object.values(apt.rooms).flatMap((r) => roomSides(apt, r.id).map((side) => {
    const t = 8 // толщина полосы на плане, см
    const q = (p: { x: number; z: number }, k: number) => ({ x: p.x + side.nIn.x * k, z: p.z + side.nIn.z * k })
    const mat = sideMaterialId(apt, side)
    return {
      key: `${r.id}-${side.index}`, roomId: r.id, wallId: side.wallIds[0],
      strip: [side.a, side.b, q(side.b, t), q(side.a, t)],
      color: mat ? MATERIALS[mat]?.swatchHex ?? null : null,
      selected: r.id === activeRoomId && !!selSide && selSide.index === side.index,
    }
  })), [apt, activeRoomId, selSide])
  const selMaterial = selSide ? sideMaterialId(apt, selSide) : null
  const applyFinish = (materialId: string | null) => {
    if (!room || !selSide) return
    const r = useApartmentProject.getState().apply('Отделка', setSideFinishCommand(room.id, selSide.wallIds, materialId))
    if (!r.ok) { setFinishMessage(r.issues[0]?.message ?? 'Отделка не применена'); setFinishNotice(null); return }
    setFinishMessage(null)
    setFinishNotice(materialId ? `Отделка «${MATERIALS[materialId].name}» назначена: ${sideLabel(selSide).toLowerCase()}.` : 'Отделка снята.')
  }
  useEffect(() => { setFinishMessage(null); setFinishNotice(null) }, [activeRoomId, selectedSideWallId])

  // Покрытие пола комнаты (SPEC D-16): один вид и цвет на комнату, отдельный шаг истории.
  const floor = room ? apt.floorCoverings[room.id] : undefined
  const [floorMessage, setFloorMessage] = useState<string | null>(null)
  const applyFloor = (covering: FloorCovering | null) => {
    if (!room) return
    const r = useApartmentProject.getState().apply('Пол', setFloorCoveringCommand(room.id, covering))
    setFloorMessage(r.ok ? null : (r.issues[0]?.message ?? 'Покрытие не применено'))
  }
  useEffect(() => { setFloorMessage(null) }, [activeRoomId])

  if (!room) return <div style={card}>Нет комнаты для показа.</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--space-3)', height: '100%' }}>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignSelf: 'start', overflow: 'auto', maxHeight: '100%' }}>
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h1 data-testid="active-room" style={{ margin: 0, fontSize: 18 }}>{room.name}</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{formatM2(roomNetAreaM2(apt, room))}. Окон: {windows.length}, дверей: {doors.length}. Мебели в комнате: <span data-testid="room-furniture">{roomFurniture.length}</span>.</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Слева план, справа 3D той же комнаты. Нажмите на дверь в 3D или на другую комнату на плане, чтобы перейти. Предметы переносятся мышью в обоих видах, карточки из каталога можно тянуть на план или в 3D.</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button data-testid="undo" disabled={!canUndo} onClick={() => useApartmentProject.getState().undo()} style={{ ...secondary, flex: 1, opacity: canUndo ? 1 : 0.5 }}>Отменить</button>
            <button data-testid="redo" disabled={!canRedo} onClick={() => useApartmentProject.getState().redo()} style={{ ...secondary, flex: 1, opacity: canRedo ? 1 : 0.5 }}>Повторить</button>
          </div>
          <button data-testid="back-to-setup" onClick={() => goTo('setup')} style={secondary}>← Вернуться к настройке</button>
        </section>
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-label="Двери">
          <h2 style={{ margin: 0, fontSize: 15 }}>Двери</h2>
          {doors.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>В этой комнате нет дверей.</div>}
          {doors.map((d) => {
            const target = doorTarget(apt, d.id, room.id)
            const name = target ? apt.rooms[target].name : null
            return (
              <button key={d.id} data-testid={`go-${d.id}`} onClick={() => goThroughDoor(d.id)} style={secondary}>
                {name ? `Дверь в «${name}»` : roomsOfWall(apt, d.wallId).length === 1 ? 'Входная дверь (наружу)' : 'Дверь'}
              </button>
            )
          })}
        </section>
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-label="Отделка стен">
          <h2 style={{ margin: 0, fontSize: 15 }}>Отделка стен</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Выберите сторону стены в списке, на плане или в 3D. Отделка меняет только эту сторону.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sides.map((s) => {
              const mat = sideMaterialId(apt, s)
              const on = selSide?.index === s.index
              return (
                <button
                  key={s.index} data-testid={`side-${s.index}`} aria-pressed={on} onClick={() => selectSide(s.wallIds[0])}
                  style={{ ...secondary, padding: '4px 8px', fontSize: 12, borderColor: on ? 'var(--accent)' : 'var(--border)', display: 'inline-flex', gap: 6, alignItems: 'center' }}
                >
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, border: '1px solid var(--border)', background: (mat && MATERIALS[mat]?.swatchHex) || 'transparent' }} />
                  {sideLabel(s)}
                </button>
              )
            })}
          </div>
          {selSide && (
            <>
              <div data-testid="finish-title" style={{ fontSize: 13 }}><b>{sideLabel(selSide)}</b>, {formatCm(selSide.lengthCm)}. Сейчас: <span data-testid="finish-current">{selMaterial ? MATERIALS[selMaterial]?.name : 'без отделки'}</span>.</div>
              {neighbourRooms(apt, selSide).length > 0 && (
                <div data-testid="finish-shared" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Общая стена с {neighbourRooms(apt, selSide).map((id) => `«${apt.rooms[id].name}»`).join(', ')}: другая сторона не меняется.
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Краска</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PAINTS.map((p) => (
                  <button
                    key={p.id} data-testid={`paint-${p.id}`} title={p.name} aria-label={`Краска: ${p.name}`} aria-pressed={selMaterial === p.id} onClick={() => applyFinish(p.id)}
                    style={{ width: 30, height: 30, borderRadius: 'var(--radius)', cursor: 'pointer', background: p.colorHex, border: selMaterial === p.id ? '3px solid var(--accent)' : '1px solid var(--border)' }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Обои (ткани Poly Haven, CC0)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {WALLPAPERS.map((w) => (
                  <button
                    key={w.id} data-testid={`wallpaper-${w.id}`} title={w.name} aria-label={`Обои: ${w.name}`} aria-pressed={selMaterial === w.id} onClick={() => applyFinish(w.id)}
                    style={{ width: 44, height: 44, padding: 0, borderRadius: 'var(--radius)', cursor: 'pointer', overflow: 'hidden', border: selMaterial === w.id ? '3px solid var(--accent)' : '1px solid var(--border)', background: w.swatchHex }}
                  >
                    <img src={w.thumbUrl ?? w.textureUrl} alt="" width={44} height={44} style={{ objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
              {selMaterial && MATERIALS[selMaterial]?.tileSizeCm && (() => {
                const tile = MATERIALS[selMaterial].tileSizeCm!
                const rep = textureRepeats(selSide.lengthCm, apt.ceilingHeightCm, tile)
                const f = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
                return (
                  <div data-testid="repeat-info" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Образец {f(tile.widthCm)} × {f(tile.heightCm)} см; на стене {formatCm(selSide.lengthCm)} × {formatCm(apt.ceilingHeightCm)} рисунок повторяется {f(rep.across)} × {f(rep.up)} раза.
                  </div>
                )
              })()}
              <button data-testid="finish-clear" disabled={!selMaterial} onClick={() => applyFinish(null)} style={{ ...secondary, opacity: selMaterial ? 1 : 0.5 }}>Убрать отделку</button>
            </>
          )}
          {finishMessage && <div data-testid="finish-message" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{finishMessage}</div>}
          {finishNotice && <div data-testid="finish-notice" role="status" style={{ color: 'var(--ok)', fontSize: 13 }}>{finishNotice}</div>}
        </section>
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-label="Пол">
          <h2 style={{ margin: 0, fontSize: 15 }}>Пол</h2>
          <div data-testid="floor-current" style={{ fontSize: 13 }}>
            Сейчас: {floor && floorColorOf(floor) ? `${FLOORS[floor.kind].name}, ${floorColorOf(floor)!.name}` : 'без покрытия'}.
            {floor?.kind === 'laminate' ? ` Доски ${BOARD_CM.widthCm} × ${BOARD_CM.lengthCm} см.` : ''}
          </div>
          {/* Компактно: вид слева, три цвета в одну строку, чтобы каталог ниже не уезжал за край колонки. */}
          {FLOOR_KINDS.map((kind) => (
            <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', width: 78 }}>{FLOORS[kind].name}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {FLOORS[kind].colors.map((c) => {
                  const on = floor?.kind === kind && floor.colorId === c.id
                  return (
                    <button
                      key={c.id} data-testid={`floor-${kind}-${c.id}`} title={`${FLOORS[kind].name}: ${c.name}`} aria-label={`${FLOORS[kind].name}: ${c.name}`}
                      aria-pressed={on} onClick={() => applyFloor({ kind, colorId: c.id })}
                      style={{ width: 44, height: 30, borderRadius: 'var(--radius)', cursor: 'pointer', background: c.hex, border: on ? '3px solid var(--accent)' : '1px solid var(--border)' }}
                    />
                  )
                })}
              </div>
            </div>
          ))}
          <button data-testid="floor-clear" disabled={!floor} onClick={() => applyFloor(null)} style={{ ...secondary, opacity: floor ? 1 : 0.5 }}>Убрать покрытие</button>
          {floorMessage && <div data-testid="floor-message" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{floorMessage}</div>}
        </section>
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-label="Предметы">
          <h2 style={{ margin: 0, fontSize: 15 }}>Предметы</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Нажмите «+», предмет встанет на свободное место комнаты. R — повернуть на 90° (Shift+R — обратно, Alt+R — по 15°), работает и пока предмет в руке. Delete — удалить.</div>
          {furnishSetFor(room.type, furnishStyle) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                Стиль набора
                <select data-testid="furnish-style" value={furnishStyle} onChange={(e) => setFurnishStyle(e.target.value as FurnishStyle)}>
                  {(Object.keys(FURNISH_STYLE_NAMES) as FurnishStyle[]).map((s) => <option key={s} value={s}>{FURNISH_STYLE_NAMES[s]}</option>)}
                </select>
              </label>
              <button data-testid="furnish-room" onClick={() => furnishRoom(furnishSetFor(room.type, furnishStyle)!.entries)} title={furnishSetFor(room.type, furnishStyle)!.name} style={secondary}>
                Обставить комнату готовым набором
              </button>
            </div>
          )}
          <CatalogPanel roomType={room.type} onAdd={addAtFreeSpot} onDragStart={(id) => beginDrag({ catalogItemId: id }, { x: -1e5, z: -1e5 }, 'catalog')} />
          <div data-testid="selection" style={{ fontSize: 13 }}>
            {sel ? `${CATALOG[sel.catalogItemId].name}: x=${Math.round(sel.xCm)} см, z=${Math.round(sel.zCm)} см, угол=${Math.round(sel.angleDeg)}°` : 'Предмет не выбран'}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" data-testid="show-dims" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />
            Размеры на плане
          </label>
          {sel && doorDist && <div data-testid="door-distance" style={{ fontSize: 13, color: 'var(--text-muted)' }}>До ближайшей двери: {doorDist.cm} см</div>}
          {sel && CATALOG[sel.catalogItemId].mount === 'wall' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Высота от пола, см
              <button type="button" aria-label="Ниже на 5 см" data-testid="elevation-down" onClick={() => setElevation(sel.elevationCm - 5)} style={{ ...secondary, padding: '2px 8px' }}>−</button>
              <input
                key={`${sel.id}-${sel.elevationCm}`} data-testid="elevation" type="number" step={1} defaultValue={Math.round(sel.elevationCm)}
                style={{ width: 64 }}
                onBlur={(e) => { if (e.target.value.trim() !== '') setElevation(Number(e.target.value)) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); e.currentTarget.blur() } else e.stopPropagation() }}
              />
              <button type="button" aria-label="Выше на 5 см" data-testid="elevation-up" onClick={() => setElevation(sel.elevationCm + 5)} style={{ ...secondary, padding: '2px 8px' }} title="Или тяните предмет в 3D с зажатым Shift">+</button>
            </label>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button data-testid="rotate" disabled={!sel} onClick={() => quarterTurn(1)} title="R" style={{ ...secondary, flex: 1, opacity: sel ? 1 : 0.5 }}>Повернуть на 90°</button>
            <button data-testid="remove" disabled={!sel} onClick={removeSelected} style={{ ...secondary, flex: 1, opacity: sel ? 1 : 0.5 }}>Удалить</button>
          </div>
          {draft && !draft.result.valid && <div data-testid="reason" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{draft.result.message}</div>}
          {message && !draft && <div data-testid="message" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{message}</div>}
        </section>
        {roomFurniture.length > 0 && (
          <section data-testid="clearance" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Проходы">
            <h2 style={{ margin: 0, fontSize: 15 }}>Проходы</h2>
            {clearance.length === 0
              ? <div data-testid="clearance-ok" style={{ color: 'var(--ok)', fontSize: 13 }}>Проходы свободны: везде не меньше {MIN_PASSAGE_CM} см, двери доступны.</div>
              : clearance.map((c) => (
                <button
                  key={c.key} type="button" data-testid={`clearance-${c.kind}`} aria-pressed={activeIssue === c.key}
                  onClick={() => { setActiveIssue(activeIssue === c.key ? null : c.key); if (c.ids[0] && apt.furniture[c.ids[0]]) useInteriorEditor.getState().select(c.ids[0]) }}
                  style={{ ...secondary, textAlign: 'left', fontSize: 13, borderColor: activeIssue === c.key ? '#ffb020' : undefined }}
                >
                  ⚠ {c.message}
                </button>
              ))}
          </section>
        )}
        <NotesPanel apt={apt} room={room} selected={selectedNote} onSelect={setSelectedNote} />
        <LayoutsPanel apt={apt} />
        <ShoppingPanel apt={apt} />
        {selectedOpening && (
          <section data-testid="selected-opening" style={{ ...card, fontSize: 13 }}>
            Выбрано: {selectedOpening.kind === 'door' ? 'дверь' : 'окно'}, {selectedOpening.widthCm} × {selectedOpening.heightCm} см.
          </section>
        )}
        {notice && <div data-testid="notice" role="status" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{notice}</div>}
      </aside>
      <section style={{ minHeight: 400, ...card, padding: 0, position: 'relative', minWidth: 0 }}>
        <PlanView
          project={useApartmentProject} editor={useInteriorEditor} catalog={CATALOG} testId="interior-plan"
          activeRoomId={room.id} onPickRoom={(id) => enter(id)}
          focusBounds={mode === 'room' ? bounds : null} focusKey={`${mode}:${room.id}`}
          surfaces={surfaces} onPickSurface={(wallId) => selectSide(wallId || null)}
          markers={clearance} activeMarker={activeIssue} dims={dims}
          notes={roomNotes} selectedNote={selectedNote} onSelectNote={setSelectedNote}
          onMoveNote={(id, x, z) => useApartmentProject.getState().apply('Заметка', patchNoteCommand(id, { xCm: x, zCm: z }))}
        />
        <button
          data-testid="plan-mode" onClick={() => setMode(mode === 'room' ? 'all' : 'room')}
          style={{ ...secondary, position: 'absolute', left: 8, top: 8, padding: '2px 8px' }}
        >{mode === 'room' ? 'Показать всю квартиру' : 'Показать комнату'}</button>
      </section>
      <section data-fullscreen-root data-testid="scene-panel" className="scene-panel" style={{ minHeight: 400, ...card, padding: 0, position: 'relative', minWidth: 0 }}>
        <WebGLGuard>
          <InteriorScene />
          {!walking && <QualityShot apt={apt} roomId={room.id} />}
          <WalkHint />
          <TimeOfDay />
        </WebGLGuard>
      </section>
    </div>
  )
}
