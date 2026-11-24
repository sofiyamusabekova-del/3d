import { useMemo, useState } from 'react'
import { CATALOG, CATALOG_ITEMS, ROOM_LABELS, categoriesOf, itemsForRoom } from '../catalog/catalog'
import type { CatalogItem, RoomType } from '../domain/types'
import { useModelStatus } from '../scene3d/modelStatus'
import { field, secondary } from './styles'

const fmt = (n: number) => String(Math.round(n))

/**
 * Каталог мебели (SPEC §12, задача 13.5): карточки с превью, категориями, названием и габаритами в см;
 * по умолчанию предметы, подходящие для типа активной комнаты, переключатель показывает все.
 * Показывает ошибки загрузки моделей и повтор (AC-13).
 */
export function CatalogPanel({ roomType, onAdd, onDragStart, items = CATALOG_ITEMS }: { roomType: RoomType; onAdd: (id: string) => void; /** Карточку можно тянуть на план или в 3D (задачи 14.1, 14.2). */ onDragStart?: (id: string) => void; items?: CatalogItem[] }) {
  const [scope, setScope] = useState<'room' | 'all'>('room')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const failed = useModelStatus((s) => s.failed)
  const retry = useModelStatus((s) => s.retry)

  const pool = scope === 'room' ? itemsForRoom(roomType, items) : items
  const categories = useMemo(() => categoriesOf(pool), [pool])
  const q = query.trim().toLowerCase()
  const shown = pool.filter((i) => (!category || i.category === category) && (!q || i.name.toLowerCase().includes(q)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button data-testid="catalog-scope-room" aria-pressed={scope === 'room'} onClick={() => { setScope('room'); setCategory('') }} style={{ ...secondary, flex: 1, padding: '4px 6px', fontSize: 12, borderColor: scope === 'room' ? 'var(--accent)' : 'var(--border)' }}>Для «{ROOM_LABELS[roomType]}»</button>
        <button data-testid="catalog-scope-all" aria-pressed={scope === 'all'} onClick={() => { setScope('all'); setCategory('') }} style={{ ...secondary, flex: 1, padding: '4px 6px', fontSize: 12, borderColor: scope === 'all' ? 'var(--accent)' : 'var(--border)' }}>Все предметы</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <select data-testid="catalog-category" aria-label="Категория" value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...field, flex: 1, padding: '4px 6px', fontSize: 12 }}>
          <option value="">Все категории</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input data-testid="catalog-search" aria-label="Поиск по названию" placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...field, flex: 1, padding: '4px 6px', fontSize: 12, minWidth: 0 }} />
      </div>
      <div data-testid="catalog-count" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Показано {shown.length} из {pool.length}</div>
      {Object.entries(failed).map(([id, reason]) => (
        <div key={id} data-testid={`model-error-${id}`} role="alert" style={{ color: 'var(--danger)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Не удалось загрузить модель «{CATALOG[id]?.name ?? id}»: {reason}. Остальные предметы работают.
          <button data-testid={`retry-${id}`} onClick={() => retry(id, CATALOG[id].modelUrl)} style={{ ...secondary, padding: '2px 8px', fontSize: 12 }}>Повторить загрузку</button>
        </div>
      ))}
      {shown.length === 0 && <div data-testid="catalog-empty" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{pool.length === 0 ? 'Для этого помещения в каталоге нет предметов.' : 'Ничего не найдено: измените категорию или поиск.'}</div>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflow: 'auto' }}>
        {shown.map((it) => (
          <li
            key={it.id} data-testid={`card-${it.id}`} title={onDragStart ? 'Перетащите на план или в 3D' : undefined}
            onPointerDown={(e) => {
              if (!onDragStart || e.button !== 0 || (e.target as HTMLElement).closest('button')) return
              e.preventDefault() // без выделения текста во время переноса
              onDragStart(it.id)
            }}
            style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 6, cursor: onDragStart ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }}
          >
            <img src={it.previewUrl} alt="" width={52} height={52} loading="lazy" style={{ objectFit: 'contain', borderRadius: 4, background: 'var(--surface-2)', flex: 'none' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div>
              <div data-testid={`dims-${it.id}`} style={{ color: 'var(--text-muted)' }}>{fmt(it.widthCm)} × {fmt(it.depthCm)} × {fmt(it.heightCm)} см</div>
              <div style={{ color: 'var(--text-muted)' }}>{it.category}</div>
            </div>
            <button data-testid={`add-${it.id}`} aria-label={`Добавить: ${it.name}`} onClick={() => onAdd(it.id)} style={{ ...secondary, padding: '4px 8px', fontSize: 12, flex: 'none' }}>+</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
