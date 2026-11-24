import { useMemo, useState } from 'react'
import { CATALOG } from '../catalog/catalog'
import { shoppingCsv, shoppingList, shoppingText } from '../domain/shopping'
import type { Apartment } from '../domain/types'
import { card, secondary } from './styles'

/** Список покупок: мебель всей квартиры по предметам, выгрузка в CSV (для Excel) и в буфер обмена (D-34). */
export function ShoppingPanel({ apt }: { apt: Apartment }) {
  const rows = useMemo(() => shoppingList(apt, CATALOG), [apt])
  const [note, setNote] = useState<string | null>(null)
  const total = rows.reduce((n, r) => n + r.count, 0)
  if (total === 0) return null
  const download = () => {
    // BOM, чтобы Excel сразу читал UTF-8.
    const blob = new Blob(['﻿', shoppingCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'spisok-pokupok.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNote('Файл spisok-pokupok.csv сохранён.')
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(shoppingText(rows)); setNote('Список скопирован.') } catch { setNote('Не удалось скопировать: браузер не разрешил доступ к буферу обмена.') }
  }
  return (
    <details data-testid="shopping" style={{ ...card }}>
      <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>Список покупок ({total})</summary>
      <table data-testid="shopping-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} data-testid={`shopping-row-${r.itemId}`} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '4px 4px 4px 0', whiteSpace: 'nowrap' }}>{r.count} ×</td>
              <td style={{ padding: 4 }}>{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{r.name}</a> : r.name}</td>
              <td style={{ padding: 4, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.widthCm}×{r.depthCm}×{r.heightCm}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 8 }}>
        <button data-testid="shopping-csv" onClick={download} style={{ ...secondary, flex: 1 }}>Скачать CSV</button>
        <button data-testid="shopping-copy" onClick={() => void copy()} style={{ ...secondary, flex: 1 }}>Копировать</button>
      </div>
      {note && <div data-testid="shopping-note" role="status" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{note}</div>}
    </details>
  )
}
