import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useInterior } from '../scenario/interior'
import { clearBrowserSave, describeProject, importProjectText, readBrowserSave, useSaveStatus } from '../scenario/persistence'
import { MAX_PROJECT_BYTES } from '../scenario/projectFile'
import { useStart } from '../scenario/start'
import { isNightHour } from '../scene3d/hour'
import './fonts'
import './start.css'

/** Снимки живой комнаты (день и ночь) на время загрузки 3D и для браузеров без WebGL: node scripts/shot-fallback.mjs. */
const FALLBACK = { day: `${import.meta.env.BASE_URL}start/room-day.jpg`, night: `${import.meta.env.BASE_URL}start/room-night.jpg` }

// Живая 3D-комната (three.js, R3F) грузится после показа меню и не мешает первому экрану.
const StartRoom3D = lazy(() => import('./StartRoom3D'))

const canWebGL2 = () => { try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false } }

/**
 * Главное меню (этапы 29–30): слева крупная живая комната с подвесным плафоном (щелчок и шнур меняют день и ночь, час общий
 * с ползунком), справа тёмная колонка с фразой и кнопками. Продолжить найденный проект, начать новый, открыть файл.
 * Сохранённый проект заменяется только после подтверждения. Автосохранение запускает мастер, поэтому до выбора
 * в хранилище ничего не пишется. Без WebGL остаётся запасная картинка и ползунок.
 */
export function StartMenu() {
  const enter = useStart((s) => s.enter)
  const hour = useInterior((s) => s.hour)
  const night = isNightHour(hour)
  const found = useMemo(() => readBrowserSave(), [])
  const saved = found?.ok ? found.doc : null
  const [confirmNew, setConfirmNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [load3d, setLoad3d] = useState(false)
  const [roomReady, setRoomReady] = useState(false)
  const webgl = useMemo(() => canWebGL2(), [])
  const input = useRef<HTMLInputElement>(null)

  // Меню рисуется сразу; движок и комната подгружаются сразу после первого кадра.
  useEffect(() => {
    if (!canWebGL2()) return
    const t = setTimeout(() => setLoad3d(true), 60)
    return () => clearTimeout(t)
  }, [])

  const openFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_PROJECT_BYTES) { setError('Файл слишком большой для проекта квартиры.'); return }
    useSaveStatus.setState({ importError: null })
    importProjectText(await file.text())
    const { importError } = useSaveStatus.getState()
    if (importError) { setError(importError); return }
    enter('skipOffer')
  }
  const startNew = () => {
    if (saved && !confirmNew) { setConfirmNew(true); return }
    clearBrowserSave()
    enter('skipOffer')
  }

  return (
    <div className={`start${night ? ' is-night' : ''}`} data-testid="start-menu" data-mode={night ? 'night' : 'day'} data-hour={hour.toFixed(1)}>
      <div className="start-strip" />
      <svg className="start-plant" viewBox="0 0 340 300" aria-hidden="true">
        <g fill="currentColor">
          <path d="M200 300 C205 230 215 170 245 100 L249 102 C225 170 214 230 210 300Z" />
          <ellipse cx="262" cy="80" rx="12" ry="46" transform="rotate(25 262 80)" />
          <ellipse cx="232" cy="120" rx="10" ry="40" transform="rotate(-35 232 120)" />
          <ellipse cx="270" cy="130" rx="10" ry="42" transform="rotate(50 270 130)" />
          <ellipse cx="226" cy="170" rx="9" ry="36" transform="rotate(-55 226 170)" />
          <ellipse cx="268" cy="180" rx="9" ry="38" transform="rotate(65 268 180)" />
          <ellipse cx="240" cy="225" rx="8" ry="30" transform="rotate(-70 240 225)" />
        </g>
      </svg>
      <section className="start-card" data-testid="start-scene" aria-label="Интерактивная комната">
        <div className="start-view">
          <div className={`start-fallbackbox${roomReady ? ' is-hidden' : ''}`}>
            <img className="start-fallback" src={night ? FALLBACK.night : FALLBACK.day} alt="Светлая столовая с тёмным столом, белыми стульями, подвесной лампой и панорамным окном" decoding="async" />
          </div>
          {load3d && (
            <Suspense fallback={null}>
              <StartRoom3D onReady={() => setRoomReady(true)} />
            </Suspense>
          )}
          {webgl && (
            <div className={`start-loading${roomReady ? ' is-hidden' : ''}`} role="status" aria-live="polite" data-testid="start-loading">
              <i className="start-loading-bulb" aria-hidden="true" />
              <span>{roomReady ? '' : 'Загружаем комнату… лампа заработает через пару секунд'}</span>
            </div>
          )}
        </div>
      </section>

      <main className="start-text">
        <h1 className="start-statement start-reveal" style={{ '--d': '0.25s' } as React.CSSProperties}>
          <span>Планировщик</span>{' '}
          <span><em>квартиры</em></span>
        </h1>
        <p className="start-lead start-reveal" style={{ '--d': '0.45s' } as React.CSSProperties}>
          Создайте интерьер, который отражает ваш стиль. Настраивайте пространство, экспериментируйте с материалами и наблюдайте, как освещение меняет атмосферу вашего дома.
        </p>
        <div className="start-actions start-reveal" style={{ '--d': '0.65s' } as React.CSSProperties}>
          {saved && (
            <button className="start-btn main" data-testid="start-continue" onClick={() => enter('restore')}>
              <span>Продолжить проект<small>{describeProject(saved)}, {new Date(saved.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</small></span>
            </button>
          )}
          {confirmNew ? (
            <div className="start-confirm" role="alertdialog" aria-label="Начать новый проект" data-testid="start-new-confirm">
              Сохранённый в браузере проект будет удалён без возможности вернуть. Начать новый?
              <div className="row">
                <button className="start-btn main" data-testid="start-new-yes" onClick={startNew}>Начать новый</button>
                <button className="start-btn" data-testid="start-new-no" onClick={() => setConfirmNew(false)}>Отмена</button>
              </div>
            </div>
          ) : (
            <button className={`start-btn${saved ? '' : ' main'}`} data-testid="start-new" onClick={startNew}>Новый проект</button>
          )}
          <button className="start-btn" data-testid="start-open-file" onClick={() => input.current?.click()}>Открыть проект</button>
          <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Файл проекта" data-testid="start-file-input" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = '' }} />
          {error && <p className="start-error" role="alert" data-testid="start-error">{error}</p>}
        </div>
        <p className="start-note start-reveal" style={{ '--d': '0.8s' } as React.CSSProperties}>— проект хранится в вашем браузере</p>
      </main>
    </div>
  )
}
