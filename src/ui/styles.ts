import type { CSSProperties } from 'react'

/** Общие стили компонентов (SPEC D-13): значения только из переменных tokens.css; состояния наведения и фокуса — в index.css. */
export const card: CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', boxShadow: 'var(--shadow-1)',
}
export const primary: CSSProperties = {
  background: 'var(--accent)', color: 'var(--accent-ink)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '8px 16px',
  cursor: 'pointer', font: 'inherit', fontWeight: 'var(--weight-strong)',
}
export const secondary: CSSProperties = {
  background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '8px 16px', cursor: 'pointer', font: 'inherit',
}
export const field: CSSProperties = {
  padding: 8, font: 'inherit', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', width: '100%', boxSizing: 'border-box',
}
