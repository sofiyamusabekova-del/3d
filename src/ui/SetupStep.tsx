import { useEffect, useMemo, useState } from 'react'
import { CATALOG } from '../catalog/catalog'
import { apartmentNetAreaM2, apartmentOuterAreaM2 } from '../domain/derive'
import {
  CEILING_MAX_CM, CEILING_MIN_CM, ROOM_SIZE_MAX_CM, ROOM_SIZE_MIN_CM,
  deltaForRoomSize, proposeCeilingHeight, proposeWallMove, wallInfo, type WallInfo,
} from '../domain/geometryEdit'
import { OPENING_LIMITS, openingInfo, openingLabel, proposeOpeningChange, type OpeningInfo, type OpeningPatch } from '../domain/openingEdit'
import { selectApartment, selectCanRedo, selectCanUndo } from '../domain/store'
import type { Issue } from '../domain/types'
import { formatCm, formatM2 } from '../geometry/units'
import { PlanPreview } from '../plan2d/PlanPreview'
import { parseCmInput } from '../scenario/input'
import { useApartmentProject, useFlow } from '../scenario/flow'
import { useInterior } from '../scenario/interior'
import { useInteriorEditor } from '../scenario/interiorEditor'
import { templateById } from '../scenario/layouts'
import { card, field, primary, secondary } from './styles'

/**
 * Причина отказа. Если она касается предмета мебели (в том числе в скрытой комнате), рядом кнопка,
 * которая открывает эту комнату в интерьере с выбранным предметом: конфликт можно исправить без потерь (15.4).
 */
function IssueItem({ issue }: { issue: Issue }) {
  const goTo = useFlow((s) => s.goTo)
  const f = issue.objectId ? useApartmentProject.getState().history.present.furniture[issue.objectId] : undefined
  return (
    <li data-testid={f ? `conflict-${f.id}` : undefined}>
      {issue.message}
      {f && (
        <button
          data-testid={`show-conflict-${f.id}`}
          onClick={() => {
            useInterior.getState().enter(f.roomId)
            useInteriorEditor.getState().select(f.id)
            goTo('interior')
          }}
          style={{ ...secondary, marginLeft: 8, padding: '1px 8px', fontSize: 12 }}
        >Показать в интерьере</button>
      )}
    </li>
  )
}

const safeWallInfo = (apt: Parameters<typeof wallInfo>[0], id: string | null): WallInfo | null => {
  if (!id || !apt.walls[id]) return null
  try {
    return wallInfo(apt, id)
  } catch {
    return null
  }
}

const safeOpeningInfo = (apt: Parameters<typeof openingInfo>[0], id: string | null): OpeningInfo | null => {
  if (!id || !apt.openings[id]) return null
  try {
    return openingInfo(apt, id)
  } catch {
    return null
  }
}

type OpeningDraft = { from?: string; width?: string; height?: string }

/** Шаг «Настройка»: вся квартира на плане, выбор стены, размеры в см, предпросмотр и применение (SPEC §9). */
export function SetupStep() {
  const apt = useApartmentProject(selectApartment)
  const canUndo = useApartmentProject(selectCanUndo)
  const canRedo = useApartmentProject(selectCanRedo)
  const id = useFlow((s) => s.selectedTemplateId)!
  const goTo = useFlow((s) => s.goTo)
  const t = templateById(id)!

  const [wallId, setWallId] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ roomId: string; text: string } | null>(null)
  const [ceilingText, setCeilingText] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<{ title: string; issues: Issue[] } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const info = useMemo(() => safeWallInfo(apt, wallId), [apt, wallId])
  // Выбранная стена пропала (отмена, другая схема): выбор снимается.
  useEffect(() => { if (wallId && !info) setWallId(null) }, [wallId, info])

  const parsed = edit ? parseCmInput(edit.text, ROOM_SIZE_MIN_CM, ROOM_SIZE_MAX_CM, 'размер комнаты') : null
  const editedRoom = info && edit ? info.rooms.find((r) => r.roomId === edit.roomId) : undefined
  const delta = parsed?.ok && editedRoom ? deltaForRoomSize(editedRoom, parsed.valueCm) : null
  const proposal = useMemo(
    () => (info && delta !== null && delta !== 0 ? proposeWallMove(apt, info.wallId, delta, { catalog: CATALOG }) : null),
    [apt, info, delta],
  )

  // Проём: выбор, черновик значений, предпросмотр (9.1, 9.3).
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [odraft, setOdraft] = useState<OpeningDraft>({})
  const oinfo = useMemo(() => safeOpeningInfo(apt, openingId), [apt, openingId])
  useEffect(() => { if (openingId && !oinfo) setOpeningId(null) }, [openingId, oinfo])
  const olim = oinfo ? OPENING_LIMITS[oinfo.opening.kind] : null
  const odraftState = useMemo(() => {
    if (!oinfo || !olim) return { patch: null as OpeningPatch | null, errors: {} as Record<string, string>, proposal: null }
    const errors: Record<string, string> = {}
    const patch: OpeningPatch = {}
    const read = (key: keyof OpeningDraft, min: number, max: number, what: string) => {
      const text = odraft[key]
      if (text === undefined) return undefined
      const p = parseCmInput(text, min, max, what)
      if (!p.ok) { errors[key] = p.message; return undefined }
      return p.valueCm
    }
    const from = read('from', 0, ROOM_SIZE_MAX_CM, 'отступ от угла')
    const width = read('width', olim.width[0], olim.width[1], 'ширину')
    const height = read('height', olim.height[0], olim.height[1], 'высоту')
    if (from !== undefined) patch.fromRefCm = from
    if (width !== undefined) patch.widthCm = width
    if (height !== undefined) patch.heightCm = height
    const touched = Object.keys(patch).length > 0 && Object.keys(errors).length === 0
    return { patch: touched ? patch : null, errors, proposal: touched ? proposeOpeningChange(apt, oinfo.openingId, patch, { catalog: CATALOG }) : null }
  }, [apt, oinfo, olim, odraft])
  const oproposal = odraftState.proposal

  const shown = proposal?.ok && proposal.candidate ? proposal.candidate : oproposal?.ok && oproposal.candidate ? oproposal.candidate : apt
  const planLabelInfo = useMemo(() => safeOpeningInfo(shown, openingId), [shown, openingId])

  const clearDraft = () => { setEdit(null); setOdraft({}); setRefusal(null) }
  const selectWall = (next: string | null) => { setWallId(next); setOpeningId(null); clearDraft(); setNotice(null) }
  const selectOpening = (next: string) => { setOpeningId(next); setWallId(null); clearDraft(); setNotice(null) }

  const applyOpening = (patch: OpeningPatch | null, title: string, done: string) => {
    if (!oinfo || !patch) return
    const p = proposeOpeningChange(apt, oinfo.openingId, patch, { catalog: CATALOG })
    if (!p.ok || !p.candidate) {
      setRefusal({ title: `${title} не применено: квартира осталась прежней`, issues: p.issues })
      return
    }
    const candidate = p.candidate
    const r = useApartmentProject.getState().apply(title, () => candidate)
    if (!r.ok) {
      setRefusal({ title: `${title} не применено: квартира осталась прежней`, issues: r.issues })
      return
    }
    clearDraft()
    setNotice(done)
  }

  const applyMove = () => {
    if (!proposal || !info) return
    if (!proposal.ok || !proposal.candidate) {
      setRefusal({ title: 'Сдвиг не применён: квартира осталась прежней', issues: proposal.issues })
      return
    }
    const candidate = proposal.candidate
    const r = useApartmentProject.getState().apply(proposal.exterior ? 'Изменение внешнего контура' : 'Сдвиг стены', () => candidate)
    if (!r.ok) {
      setRefusal({ title: 'Сдвиг не применён: квартира осталась прежней', issues: r.issues })
      return
    }
    clearDraft()
    setNotice(proposal.exterior ? 'Внешний контур изменён, площадь пересчитана.' : 'Стена сдвинута.')
  }

  const ceilingParsed = parseCmInput(ceilingText ?? String(apt.ceilingHeightCm), CEILING_MIN_CM, CEILING_MAX_CM, 'высоту потолка')
  const applyCeiling = () => {
    if (!ceilingParsed.ok) {
      setRefusal({ title: 'Высота потолка не изменена', issues: [{ code: 'ceiling-range', message: ceilingParsed.message }] })
      return
    }
    const p = proposeCeilingHeight(apt, ceilingParsed.valueCm)
    if (!p.ok || !p.candidate) {
      setRefusal({ title: 'Высота потолка не изменена: квартира осталась прежней', issues: p.issues })
      return
    }
    const candidate = p.candidate
    const r = useApartmentProject.getState().apply('Высота потолка', () => candidate)
    if (!r.ok) {
      setRefusal({ title: 'Высота потолка не изменена: квартира осталась прежней', issues: r.issues })
      return
    }
    setCeilingText(null)
    setRefusal(null)
    setNotice(`Высота потолка: ${ceilingParsed.valueCm} см.`)
  }

  // Ctrl+Z / Ctrl+Y вне полей ввода и Esc (отмена черновика) на шаге настройки.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement | null)?.tagName === 'INPUT'
      if (e.key === 'Escape') { clearDraft(); setCeilingText(null) }
      if (inField || !(e.ctrlKey || e.metaKey)) return
      const store = useApartmentProject.getState()
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); clearDraft() }
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); store.redo(); clearDraft() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const net = apartmentNetAreaM2(apt)
  const outer = apartmentOuterAreaM2(apt)
  const dimLabel = (d: 'width' | 'depth') => (d === 'width' ? 'Ширина' : 'Длина')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 'var(--space-3)', height: '100%' }}>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignSelf: 'start', overflow: 'auto', maxHeight: '100%' }}>
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>{t.name}</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.composition}</div>
          <div data-testid="setup-area">Площадь помещений: <b>{formatM2(net)}</b> (без стен)</div>
          <div data-testid="setup-outer" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Площадь по внешнему контуру (со стенами): {formatM2(outer)}</div>
          <div data-testid="setup-furniture" style={{ fontSize: 13 }}>Мебель: {Object.keys(apt.furniture).length}</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button data-testid="undo" disabled={!canUndo} onClick={() => { useApartmentProject.getState().undo(); clearDraft() }} style={{ ...secondary, flex: 1, opacity: canUndo ? 1 : 0.5 }}>Отменить</button>
            <button data-testid="redo" disabled={!canRedo} onClick={() => { useApartmentProject.getState().redo(); clearDraft() }} style={{ ...secondary, flex: 1, opacity: canRedo ? 1 : 0.5 }}>Повторить</button>
          </div>
          <button data-testid="back-to-schemes" onClick={() => goTo('schemes')} style={secondary}>← Другая схема</button>
          <button data-testid="to-interior" onClick={() => goTo('interior')} style={primary}>К интерьеру →</button>
        </section>

        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-label="Стена">
          <h2 style={{ margin: 0, fontSize: 15 }}>Стены и размеры</h2>
          {!info && <p data-testid="wall-hint" style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Нажмите на стену на плане: она подсветится, а здесь появятся размеры комнат, которые зависят от её положения.</p>}
          {info && (
            <>
              <div data-testid="wall-title" style={{ fontSize: 13 }}>
                <b>{info.line.exterior ? 'Внешняя стена' : 'Общая стена'}</b>: {info.rooms.map((r) => `«${r.name}»`).join(' / ')}. Участок {formatCm(info.lengthCm)}, толщина {formatCm(info.thicknessCm)}.
              </div>
              {info.line.wallIds.length > 1 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Прямая стена идёт вдоль {info.line.wallIds.length} участков и сдвигается целиком.</div>
              )}
              {info.rooms.map((r) => {
                const shownRoom = proposal?.affected.find((a) => a.roomId === r.roomId)
                const derived = shownRoom ? Math.round(r.dimension === 'width' ? shownRoom.after.widthCm : shownRoom.after.depthCm) : r.sizeCm
                const value = edit?.roomId === r.roomId ? edit.text : String(derived)
                return (
                  <label key={r.roomId} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
                    <span>{dimLabel(r.dimension)} комнаты «{r.name}», см</span>
                    <input
                      data-testid={`size-${r.roomId}`}
                      inputMode="numeric"
                      value={value}
                      aria-invalid={edit?.roomId === r.roomId && parsed && !parsed.ok ? true : undefined}
                      onChange={(e) => { setEdit({ roomId: r.roomId, text: e.target.value }); setRefusal(null); setNotice(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyMove() } }}
                      style={field}
                    />
                  </label>
                )
              })}
              <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>Противоположная стена комнаты остаётся на месте; двигается выбранная стена.</p>
              {edit && parsed && !parsed.ok && <div data-testid="size-error" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{parsed.message}</div>}
              {proposal && !proposal.ok && (
                <div data-testid="move-issues" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>
                  Так сдвинуть нельзя:
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{proposal.issues.map((i, k) => <IssueItem key={k} issue={i} />)}</ul>
                </div>
              )}
              {proposal?.ok && proposal.candidate && proposal.after && (
                <div data-testid="move-preview" style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <b>Предпросмотр{proposal.exterior ? ' (внешний контур)' : ''}:</b>
                  {proposal.affected.map((a) => (
                    <div key={a.roomId} data-testid={`affected-${a.roomId}`}>
                      «{a.name}»: {formatCm(a.before.widthCm)} × {formatCm(a.before.depthCm)} → <b>{formatCm(a.after.widthCm)} × {formatCm(a.after.depthCm)}</b>, {formatM2(a.before.areaM2)} → {formatM2(a.after.areaM2)}
                    </div>
                  ))}
                  <div data-testid="area-change">Площадь помещений: {formatM2(proposal.before.netM2)} → <b>{formatM2(proposal.after.netM2)}</b></div>
                  {proposal.exterior && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Меняется внешний контур, поэтому изменится общая площадь (со стенами {formatM2(proposal.before.outerM2)} → {formatM2(proposal.after.outerM2)}). Мебель не масштабируется.</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button data-testid="move-apply" disabled={!proposal} onClick={applyMove} style={{ ...primary, flex: 1, opacity: proposal ? 1 : 0.5 }}>
                  {proposal?.exterior ? 'Изменить внешний контур' : 'Применить'}
                </button>
                <button data-testid="move-cancel" disabled={!edit} onClick={clearDraft} style={{ ...secondary, opacity: edit ? 1 : 0.5 }}>Отмена</button>
              </div>
            </>
          )}
        </section>

        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-label="Окно или дверь">
          <h2 style={{ margin: 0, fontSize: 15 }}>Окна и двери</h2>
          {!oinfo && <p data-testid="opening-hint" style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Нажмите на окно или дверь на плане, чтобы изменить положение и размер.</p>}
          {oinfo && olim && (() => {
            const o = oinfo.opening
            const corner = oinfo.refCorner === 'left' ? 'левого' : 'верхнего'
            const value = (key: keyof OpeningDraft, current: number) => odraft[key] ?? String(Math.round(current * 10) / 10)
            const setField = (key: keyof OpeningDraft) => (e: React.ChangeEvent<HTMLInputElement>) => { setOdraft((d) => ({ ...d, [key]: e.target.value })); setRefusal(null); setNotice(null) }
            const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); applyOpening(odraftState.patch, 'Изменение проёма', 'Проём изменён.') } }
            const fields: Array<[keyof OpeningDraft, string, number]> = [
              ['from', `Отступ от ${corner} угла, см`, oinfo.fromRefCm],
              ['width', `Ширина, см (${olim.width[0]}–${olim.width[1]})`, o.widthCm],
              ['height', `Высота, см (${olim.height[0]}–${olim.height[1]})`, o.heightCm],
            ]
            const other = oinfo.rooms.find((r) => r.id !== o.swingRoomId)
            const swingRoom = oinfo.rooms.find((r) => r.id === o.swingRoomId)
            return (
              <>
                <div data-testid="opening-title" style={{ fontSize: 13 }}>
                  <b>{o.kind === 'door' ? 'Дверь' : 'Окно'}</b>: {openingLabel(apt, o).replace(/^(Дверь|Окно) в стене комнаты /, 'стена комнаты ')}. Стена {formatCm(oinfo.wallLengthCm)}, свободно {formatCm(oinfo.clearSpanCm)}.
                  {oinfo.rooms.length === 2 && ' Это один общий проём: изменение видно в обеих комнатах.'}
                </div>
                {fields.map(([key, title, current]) => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
                    <span>{title}</span>
                    <input
                      data-testid={`opening-${key}`} inputMode="numeric" value={value(key, current)}
                      aria-invalid={odraftState.errors[key] ? true : undefined}
                      onChange={setField(key)} onKeyDown={enter} style={field}
                    />
                  </label>
                ))}
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Отступ считается по чистой стене до соседней стены. До другого угла: {formatCm(oinfo.fromOtherCm)}.</div>
                {Object.values(odraftState.errors).map((m, k) => <div key={k} data-testid="opening-error" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{m}</div>)}
                {oproposal && !oproposal.ok && (
                  <div data-testid="opening-issues" role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>
                    Так изменить нельзя:
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{oproposal.issues.map((i, k) => <IssueItem key={k} issue={i} />)}</ul>
                  </div>
                )}
                {oproposal?.ok && <div data-testid="opening-preview" style={{ fontSize: 13 }}><b>Предпросмотр:</b> изменение показано на плане, нажмите «Применить».</div>}
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button data-testid="opening-apply" disabled={!odraftState.patch} onClick={() => applyOpening(odraftState.patch, 'Изменение проёма', 'Проём изменён.')} style={{ ...primary, flex: 1, opacity: odraftState.patch ? 1 : 0.5 }}>Применить</button>
                  <button data-testid="opening-cancel" disabled={Object.keys(odraft).length === 0} onClick={clearDraft} style={{ ...secondary, opacity: Object.keys(odraft).length > 0 ? 1 : 0.5 }}>Отмена</button>
                </div>
                {o.kind === 'door' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div style={{ fontSize: 13 }}>Петли: {o.hinge === 'end' ? 'на конце стены' : 'в начале стены'}{swingRoom ? `, открывается в «${swingRoom.name}»` : ''}.</div>
                    <button data-testid="door-hinge" onClick={() => applyOpening({ hinge: o.hinge === 'end' ? 'start' : 'end' }, 'Сторона петель', 'Сторона петель изменена.')} style={secondary}>Переставить петли на другую сторону</button>
                    {other && <button data-testid="door-swing" onClick={() => applyOpening({ swingRoomId: other.id }, 'Направление открывания', `Дверь открывается в «${other.name}».`)} style={secondary}>Открывать в «{other.name}»</button>}
                    {!other && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Входная дверь открывается только внутрь квартиры.</div>}
                  </div>
                )}
              </>
            )
          })()}
        </section>

        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-label="Потолок">
          <h2 style={{ margin: 0, fontSize: 15 }}>Высота потолка</h2>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
            <span>На всю квартиру, см ({CEILING_MIN_CM}–{CEILING_MAX_CM})</span>
            <input
              data-testid="ceiling-input"
              inputMode="numeric"
              value={ceilingText ?? String(apt.ceilingHeightCm)}
              aria-invalid={!ceilingParsed.ok ? true : undefined}
              onChange={(e) => { setCeilingText(e.target.value); setRefusal(null); setNotice(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCeiling() } }}
              style={field}
            />
          </label>
          <button data-testid="ceiling-apply" onClick={applyCeiling} style={secondary}>Изменить высоту</button>
        </section>

        {refusal && (
          <section data-testid="refusal" role="alert" style={{ ...card, borderColor: 'var(--danger)', fontSize: 13 }}>
            <b>{refusal.title}</b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{refusal.issues.map((i, k) => <IssueItem key={k} issue={i} />)}</ul>
          </section>
        )}
        {notice && <div data-testid="notice" role="status" style={{ color: 'var(--ok)', fontSize: 13 }}>{notice}</div>}
      </aside>
      <section style={{ minHeight: 400, ...card, padding: 0 }}>
        <PlanPreview
          apartment={shown}
          interactive
          labels
          testId="setup-plan"
          selectedWallId={info?.wallId ?? null}
          selectedWallIds={info?.line.wallIds ?? []}
          onSelectWall={selectWall}
          selectedOpeningId={openingId}
          onSelectOpening={selectOpening}
          openingLabel={planLabelInfo ? formatCm(planLabelInfo.fromRefCm) : undefined}
        />
      </section>
    </div>
  )
}
