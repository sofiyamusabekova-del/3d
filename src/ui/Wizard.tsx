import { lazy, Suspense, useEffect, useMemo } from 'react'
import { acceptOffer, startPersistence, useSaveStatus } from '../scenario/persistence'
import { useStart } from '../scenario/start'
import { ProjectMenu, ProjectNotices } from './ProjectMenu'
import { PlanPreview } from '../plan2d/PlanPreview'
import { formatM2 } from '../geometry/units'
import { MAX_AREA_M2, MIN_AREA_M2 } from '../scenario/input'
import { useFlow, type Step } from '../scenario/flow'
import { templateById } from '../scenario/layouts'
import { rankSchemes, schemeAreaRange } from '../scenario/match'
// Шаг «Интерьер» тянет весь 3D-движок: грузится только при переходе на него (этап 28).
const InteriorStep = lazy(() => import('./InteriorStep').then((m) => ({ default: m.InteriorStep })))
import { SetupStep } from './SetupStep'
import { card, primary, secondary } from './styles'
import './fonts'
import './wizard.css'

const STEPS: Array<{ id: Step; title: string }> = [
  { id: 'params', title: '1. Параметры' },
  { id: 'schemes', title: '2. Схема' },
  { id: 'setup', title: '3. Настройка' },
  { id: 'interior', title: '4. Интерьер' },
]


export function Wizard() {
  const step = useFlow((s) => s.step)
  const selected = useFlow((s) => s.selectedTemplateId)
  const areaM2 = useFlow((s) => s.areaM2)
  const goTo = useFlow((s) => s.goTo)
  // Сохранение проекта (этап 27): найденное сохранение предлагается восстановить, затем идёт автосохранение.
  // Выбор на стартовом экране (этап 29): продолжить найденное сохранение или не предлагать его повторно.
  useEffect(() => {
    const stop = startPersistence()
    const { after } = useStart.getState()
    if (after === 'restore') acceptOffer()
    else if (after === 'skipOffer') useSaveStatus.setState({ offer: null })
    return stop
  }, [])
  return (
    <div className="wz">
      <nav className="wz-nav">
        <span className="wz-brand" aria-hidden="true">Планировщик <em>квартиры</em></span>
        {STEPS.map((s) => {
          const reachable = s.id === 'params' || (s.id === 'schemes' && areaM2 !== null) || ((s.id === 'setup' || s.id === 'interior') && selected !== null)
          return (
            <button
              key={s.id}
              className="wz-step"
              data-testid={`step-${s.id}`}
              aria-current={step === s.id ? 'step' : undefined}
              disabled={!reachable}
              onClick={() => goTo(s.id)}
            >{s.title}</button>
          )
        })}
        <ProjectMenu />
      </nav>
      <main className={`wz-main${step === 'params' ? ' is-flush' : ''}`}>
        <ProjectNotices />
        {step === 'params' && <ParamsStep />}
        {step === 'schemes' && <SchemesStep />}
        {step === 'setup' && <SetupStep />}
        {step === 'interior' && <Suspense fallback={<p role="status" style={{ padding: 24 }}>Загружаем 3D…</p>}><InteriorStep /></Suspense>}
      </main>
    </div>
  )
}

function ParamsStep() {
  const { roomCount, areaText, areaError, setRoomCount, setAreaText, submitParams } = useFlow()
  const range = useMemo(() => schemeAreaRange(roomCount), [roomCount])
  return (
    <div className="pm">
      <div className="pm-visual" aria-hidden="true" />
      <div className="pm-form">
        <form className="pm-inner" onSubmit={(e) => { e.preventDefault(); submitParams() }}>
          <header>
            <p className="pm-eyebrow">Шаг 1 из 4 · Параметры</p>
            <h1 className="pm-title"><span>Какая квартира</span> <span><em>у вас?</em></span></h1>
            <p className="pm-lead">Укажите число жилых комнат и примерную площадь: подберём подходящие типовые планировки.</p>
          </header>
          <fieldset className="pm-fieldset">
            <legend className="pm-label">Число жилых комнат</legend>
            <div className="pm-rooms">
              {([1, 2, 3] as const).map((n) => (
                <label key={n} className={`pm-room${roomCount === n ? ' is-on' : ''}`}>
                  <input type="radio" name="rooms" value={n} checked={roomCount === n} onChange={() => setRoomCount(n)} data-testid={`room-count-${n}`} aria-label={`${n} ${n === 1 ? 'комната' : 'комнаты'}`} />
                  <span className="num" aria-hidden="true">{n}</span>
                  <span className="cap" aria-hidden="true">{n === 1 ? 'комната' : 'комнаты'}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            <span className="pm-label">Примерная площадь</span>
            <span className={`pm-area${areaError ? ' is-bad' : ''}`}>
              <input
                className="pm-input"
                data-testid="area-input"
                inputMode="decimal"
                value={areaText}
                placeholder="например, 45"
                aria-invalid={areaError ? true : undefined}
                aria-describedby="area-help"
                onChange={(e) => setAreaText(e.target.value)}
              />
              <span className="pm-unit" aria-hidden="true">м²</span>
            </span>
            <span className="pm-notes">
              {areaError && <span className="pm-error" data-testid="area-error" role="alert">{areaError}</span>}
              <span id="area-help" className="pm-help">
                Сумма площадей помещений без стен, от {MIN_AREA_M2} до {MAX_AREA_M2} м². Это ориентир для подбора схемы, а не жёсткое ограничение.
              </span>
              <span data-testid="scheme-range" className="pm-help">
                Готовые схемы на {roomCount} жил. комн.: от {Math.round(range.minM2)} до {Math.round(range.maxM2)} м². Если ввести другую площадь, подберётся ближайшая схема, размеры потом можно изменить.
              </span>
            </span>
          </label>
          <button type="submit" className="pm-submit" data-testid="submit-params">
            Подобрать схемы <span className="arrow" aria-hidden="true">→</span>
          </button>
        </form>
      </div>
    </div>
  )
}

function SchemesStep() {
  const { roomCount, areaM2, selectedTemplateId, pendingReplaceId, chooseScheme, confirmReplace, cancelReplace, goTo } = useFlow()
  const ranked = useMemo(() => rankSchemes(roomCount, areaM2 ?? 0), [roomCount, areaM2])
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Подходящие схемы: {roomCount} жил. комн., около {formatM2(areaM2 ?? 0)}</h1>
        <p data-testid="approx-note" style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Схемы примерные: это типовые планировки, а не точная копия вашей квартиры. Введённая площадь только помогает выбрать ближайшую. Размеры можно будет уточнить на следующем шаге.
        </p>
      </div>
      {pendingReplaceId && (
        <div role="alertdialog" data-testid="replace-dialog" style={{ ...card, borderColor: 'var(--danger)' }}>
          <p style={{ margin: '0 0 var(--space-2)' }}>
            Заменить текущую схему на «{templateById(pendingReplaceId)?.name}»? Внесённые правки квартиры будут потеряны, история отмены очистится.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button data-testid="replace-confirm" onClick={confirmReplace} style={primary}>Заменить</button>
            <button data-testid="replace-cancel" onClick={cancelReplace} style={secondary}>Оставить текущую</button>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-3)' }}>
        {ranked.map((s) => {
          const isSel = selectedTemplateId === s.template.id
          const diff = Math.round(Math.abs(s.diffM2) * 10) / 10
          return (
            <article key={s.template.id} data-testid={`scheme-${s.template.id}`} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderColor: isSel ? 'var(--accent)' : 'var(--border)' }}>
              <div style={{ height: 200 }}><PlanPreview apartment={s.apartment} testId={`preview-${s.template.id}`} /></div>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                {s.template.name}
                {s.closest && <span data-testid={`closest-${s.template.id}`} style={{ marginLeft: 8, color: 'var(--ok)', fontSize: 12 }}>ближе всего по площади</span>}
                {isSel && <span style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 12 }}>выбрана</span>}
              </h2>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{s.template.composition}</div>
              <div data-testid={`area-${s.template.id}`}>Площадь помещений: <b>{formatM2(s.netAreaM2)}</b> (без стен)</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Площадь по внешнему контуру (со стенами): {formatM2(s.outerAreaM2)}</div>
              <div style={{ fontSize: 13 }}>{diff === 0 ? 'Совпадает с введённой площадью' : `На ${formatM2(diff)} ${s.diffM2 > 0 ? 'больше' : 'меньше'} введённой`}</div>
              <button data-testid={`choose-${s.template.id}`} onClick={() => chooseScheme(s.template.id)} style={isSel ? secondary : primary}>
                {isSel ? 'Продолжить с этой схемой' : 'Выбрать эту схему'}
              </button>
            </article>
          )
        })}
      </div>
      <div><button data-testid="back-to-params" onClick={() => goTo('params')} style={secondary}>← Изменить параметры</button></div>
    </div>
  )
}

