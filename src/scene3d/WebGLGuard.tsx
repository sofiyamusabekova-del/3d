import { Component, useState, type ReactNode } from 'react'

/** Проверка до создания 3D: WebGL2 нужен и редактору, и «Качественному снимку» (задача 18.5). */
export function webglProblem(): string | null {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) return 'браузер не дал контекст WebGL2 (отключено аппаратное ускорение или видеокарта не поддерживается)'
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  } catch (e) {
    return `ошибка WebGL: ${e instanceof Error ? e.message : String(e)}`
  }
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div data-testid="webgl-unavailable" role="alert" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, height: '100%', justifyContent: 'center' }}>
      <b>3D-вид недоступен</b>
      <span style={{ color: 'var(--text-muted)' }}>Причина: {reason}.</span>
      <span style={{ color: 'var(--text-muted)' }}>План, мебель, отделка, отмена и повтор работают как прежде. Чтобы включить 3D, откройте проект в актуальном Chrome или Edge и включите аппаратное ускорение в настройках браузера.</span>
    </div>
  )
}

class Boundary extends Component<{ children: ReactNode }, { reason: string | null }> {
  state = { reason: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { reason: `сбой отрисовки: ${e instanceof Error ? e.message : String(e)}` }
  }
  render() {
    return this.state.reason ? <Unavailable reason={this.state.reason} /> : this.props.children
  }
}

/** Показывает понятное сообщение вместо 3D, если WebGL2 нет или отрисовка упала; остальной шаг продолжает работать. */
export function WebGLGuard({ children }: { children: ReactNode }) {
  const [problem] = useState(webglProblem)
  if (problem) return <Unavailable reason={problem} />
  return <Boundary>{children}</Boundary>
}
