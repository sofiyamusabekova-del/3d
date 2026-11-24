import { useEffect, useRef } from 'react'
import { useFlow } from '../scenario/flow'
import {
  acceptOffer, cancelDialog, confirmDialog, copyShareLink, describeProject, discardOffer, downloadProject, importProjectText, requestNewProject, useSaveStatus,
} from '../scenario/persistence'
import { MAX_PROJECT_BYTES } from '../scenario/projectFile'
import { card, primary, secondary } from './styles'

const time = (ms: number) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** Меню проекта в шапке: сохранить в файл, открыть файл, новый проект и состояние автосохранения (этап 27). */
export function ProjectMenu() {
  const hasProject = useFlow((s) => s.selectedTemplateId !== null)
  const savedAt = useSaveStatus((s) => s.savedAt)
  const storageError = useSaveStatus((s) => s.storageError)
  const input = useRef<HTMLInputElement>(null)
  const open = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_PROJECT_BYTES) { useSaveStatus.setState({ importError: 'Файл слишком большой для проекта квартиры.', notice: null }); return }
    importProjectText(await file.text())
  }
  return (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }} data-testid="project-menu">
      <span className="wz-status" data-testid="project-status" aria-live="polite" style={storageError ? { color: 'var(--danger)' } : undefined}>
        {storageError ? 'Автосохранение недоступно' : savedAt ? `Сохранено в браузере в ${time(savedAt)}` : hasProject ? 'Сохранится автоматически' : ''}
      </span>
      <button className="wz-tool" data-testid="project-save-file" disabled={!hasProject} onClick={downloadProject} style={{ opacity: hasProject ? 1 : 0.45 }}>Сохранить в файл</button>
      <button className="wz-tool" data-testid="project-share-link" disabled={!hasProject} onClick={() => void copyShareLink()} style={{ opacity: hasProject ? 1 : 0.45 }} title="Весь проект в адресе ссылки, на сервер ничего не отправляется">Скопировать ссылку</button>
      <button className="wz-tool" data-testid="project-open-file" onClick={() => input.current?.click()}>Открыть файл</button>
      <input
        ref={input} data-testid="project-file-input" type="file" accept=".json,application/json" hidden aria-label="Файл проекта"
        onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }}
      />
      <button className="wz-tool" data-testid="project-new" disabled={!hasProject} onClick={requestNewProject} style={{ opacity: hasProject ? 1 : 0.45 }}>Новый проект</button>
    </div>
  )
}

/** Сообщения о проекте: найденное сохранение, подтверждение замены, ошибки и итоги операций. */
export function ProjectNotices() {
  const offer = useSaveStatus((s) => s.offer)
  const dialog = useSaveStatus((s) => s.dialog)
  const importError = useSaveStatus((s) => s.importError)
  const storageError = useSaveStatus((s) => s.storageError)
  const notice = useSaveStatus((s) => s.notice)
  // Итог операции показывается несколько секунд и не мешает.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => useSaveStatus.setState({ notice: null }), 6000)
    return () => clearTimeout(t)
  }, [notice])
  if (!offer && !dialog && !importError && !storageError && !notice) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: 1100, margin: '0 auto var(--space-3)' }}>
      {offer && (
        <section role="alertdialog" aria-label="Найден сохранённый проект" data-testid="restore-offer" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderColor: 'var(--accent)' }}>
          <div>
            <b>Найден сохранённый проект</b> от {new Date(offer.savedAt).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}: {describeProject(offer)}.
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Он хранится только в этом браузере. История отмены не сохраняется.</div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button data-testid="restore-continue" autoFocus onClick={acceptOffer} style={primary}>Продолжить работу</button>
            <button data-testid="restore-discard" onClick={discardOffer} style={secondary}>Удалить и начать заново</button>
          </div>
        </section>
      )}
      {dialog && (
        <section role="alertdialog" aria-label="Подтверждение" data-testid="project-dialog" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderColor: 'var(--danger)' }}>
          <div>
            {dialog.kind === 'new'
              ? 'Начать новый проект? Текущая работа будет удалена с экрана и из браузера. Если она нужна, сначала сохраните её в файл.'
              : 'Открыть проект из файла? Текущая работа будет заменена, история отмены очистится.'}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button data-testid="project-dialog-confirm" onClick={() => confirmDialog(dialog)} style={primary}>{dialog.kind === 'new' ? 'Начать новый' : 'Открыть файл'}</button>
            <button data-testid="project-dialog-cancel" autoFocus onClick={cancelDialog} style={secondary}>Отмена</button>
          </div>
        </section>
      )}
      {importError && <div data-testid="project-error" role="alert" style={{ color: 'var(--danger)' }}>Файл не открыт: {importError} Текущий проект не изменён.</div>}
      {storageError && <div data-testid="storage-error" role="status" style={{ color: 'var(--warning)' }}>{storageError}</div>}
      {notice && <div data-testid="project-notice" role="status" style={{ color: 'var(--ok)' }}>{notice}</div>}
    </div>
  )
}
