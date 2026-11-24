/**
 * Шнур выключателя (этап 30): физика перенесена из компонента Pull Cord (designbookmark.com/motion, pull-cord/cord.js и
 * shared/motion.js) без изменений чисел. Шнур — цепочка из 12 точек с весом и мягкими связями постоянной длины: он висит,
 * раскачивается и хлещет как верёвка. В руке бусина идёт за указателем, пока шнур не натянется, дальше тянется как резина
 * и тянет за собой лампу, которая наклоняется к натяжению. Потянули дальше щелчка — выключатель срабатывает один раз.
 * Отпустили — шнур возвращается с пружиной, лампа качается и успокаивается. Тап или Enter тянут «свободная рука».
 * Класс не знает про DOM и three.js: якорь шнура (точка выхода из плафона, пиксели) задаёт владелец каждый кадр.
 */

interface Spring { x: number; v: number; t: number; k: number; c: number }
interface Pt { x: number; y: number; vx: number; vy: number }
interface Held { x: number; y: number; ox: number; oy: number; moved: number; sx: number; sy: number; flipped: boolean }

const S = (x: number, k = 400, c = 30): Spring => ({ x, v: 0, t: x, k, c })
const step = (s: Spring, dt: number) => { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export const CORD = { N: 12, SEG: 9, CLICK: 22, MAXS: 54, SUB: 4 } as const
export const CORD_LENGTH = CORD.N * CORD.SEG

export class PullCord {
  readonly pts: Pt[] = []
  /** Угол лампы (рад, по часовой в экранных осях) и просадка на проводе (px) — для 3D-лампы. */
  readonly th: Spring
  readonly tug: Spring
  /** Сколько раз сработал выключатель (для тестов и подписок). */
  flips = 0
  private readonly k: Spring
  private readonly hx: Spring
  private readonly hy: Spring
  private ax = 0
  private ay = 0
  private armed = true
  private held: Held | null = null
  private ghost = false
  private stretch = 0
  private lean = 0
  private clock = 0
  private side = 1
  private timers: Array<{ t: number; fn: () => void }> = []
  private readonly reduce: boolean

  private readonly onFlip: () => void

  constructor(onFlip: () => void, reduceMotion = false) {
    this.onFlip = onFlip
    this.reduce = reduceMotion
    const tune = (s: Spring, k: number, c: number) => { s.k = k; s.c = reduceMotion ? 2 * Math.sqrt(k) : c }
    this.th = S(0, 46, 3); tune(this.th, 46, 3)
    this.tug = S(0, 300, 13); tune(this.tug, 300, 13)
    this.k = S(1, 300, 17); tune(this.k, 300, 17)
    this.hx = S(0, 210, 22); tune(this.hx, 210, 22)
    this.hy = S(0, 210, 22); tune(this.hy, 210, 22)
  }

  private after(sec: number, fn: () => void) { this.timers.push({ t: sec, fn }) }

  /** Якорь: где шнур выходит из плафона. Первый вызов выстраивает шнур вертикально. */
  setAnchor(x: number, y: number) {
    this.ax = x; this.ay = y
    if (!this.pts.length) for (let i = 0; i <= CORD.N; i++) this.pts.push({ x, y: y + i * CORD.SEG, vx: 0, vy: 0 })
  }

  get bead(): Pt { return this.pts[CORD.N] }
  get isHeld() { return this.held !== null }

  /** Точка, которую держит рука: указатель или свободная рука. */
  private pin(): [number, number] | null { return this.held ? [this.held.x, this.held.y] : this.ghost ? [this.hx.x, this.hy.x] : null }

  private flip() {
    this.flips++
    this.tug.v += 150
    this.onFlip()
  }

  down(x: number, y: number) {
    if (!this.pts.length) return
    const b = this.bead
    this.held = { x: b.x, y: b.y, ox: b.x - x, oy: b.y - y, moved: 0, sx: x, sy: y, flipped: false }
    this.ghost = false; this.armed = true
  }

  move(x: number, y: number) {
    const h = this.held
    if (!h) return
    h.x = x + h.ox; h.y = y + h.oy
    h.moved = Math.max(h.moved, Math.hypot(x - h.sx, y - h.sy))
  }

  /** Отпустили. Короткое касание без сдвига — тап: шнур тянет свободная рука. */
  up(): boolean {
    const h = this.held
    if (!h) return false
    const tap = h.moved < 5 && !h.flipped
    this.held = null
    if (tap) this.pull()
    return tap
  }

  cancel() { this.held = null }

  /** Одно движение свободной руки (тап, Enter, Пробел). soft — лёгкий намёк ниже щелчка, выключатель не срабатывает. */
  pull(soft = false) {
    if (this.ghost || this.held || !this.pts.length) return
    const b = this.bead
    this.ghost = true; this.armed = !soft; this.side = -this.side
    this.hx.x = b.x; this.hy.x = b.y; this.hx.v = b.vx; this.hy.v = b.vy
    this.hx.t = this.ax + this.side * 26; this.hy.t = this.ay + CORD_LENGTH + (soft ? 10 : 64)
    this.after(1.1, () => { this.ghost = false })
  }

  /** Шнур ещё движется (владелец продолжает кадры), иначе можно остановить отрисовку. */
  get active(): boolean {
    if (this.held || this.ghost || this.timers.length) return true
    if (Math.abs(this.th.v) > 0.01 || Math.abs(this.th.x) > 0.002 || Math.abs(this.tug.v) > 0.5 || Math.abs(this.tug.x) > 0.05) return true
    return this.pts.some((p, i) => i > 0 && (Math.abs(p.vx) + Math.abs(p.vy) > 2.5))
  }

  /** Шаг по реальному времени (с): таймеры и четыре подшага физики, как в оригинале. */
  update(dtReal: number) {
    if (!this.pts.length) return
    const dt = Math.min(dtReal, 1 / 30)
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt
      if (this.timers[i].t <= 0) this.timers.splice(i, 1)[0].fn()
    }
    for (let k = 0; k < CORD.SUB; k++) this.frame(dt / CORD.SUB)
  }

  private frame(dt: number) {
    const { N, SEG, CLICK, MAXS } = CORD
    const L = CORD_LENGTH, pts = this.pts, b = pts[N]
    this.clock += dt
    ;[this.th, this.tug, this.hx, this.hy, this.k].forEach((s) => step(s, dt))
    if (dt <= 0) return
    const ax = this.ax, ay = this.ay, p = this.pin()

    // Держимая точка: свободна в пределах длины шнура, дальше резина.
    let px = 0, py = 0
    this.stretch = 0; this.lean = 0
    if (p) {
      const dx = p[0] - ax, dy = p[1] - ay, d = Math.hypot(dx, dy) || 1
      const over = Math.max(0, d - L), give = MAXS * (1 - Math.exp(-over / 70)), r = Math.min(d, L) + give
      px = ax + dx / d * r; py = ay + dy / d * r
      this.stretch = give; this.lean = over > 0 ? dx / d : 0
      if (over > 0) { this.k.x = this.k.t = r / L; this.k.v = 0 }
      if (this.armed && give > CLICK) {
        this.armed = false; this.flip()
        if (this.held) this.held.flipped = true; else this.after(0.12, () => { this.ghost = false })
      }
    }
    if (!p || !this.stretch) this.k.t = 1
    const seg = SEG * Math.max(1, this.k.x)
    this.tug.t = this.stretch * 0.22
    this.th.t = clamp(-this.lean * this.stretch / MAXS * 0.5, -0.3, 0.3)

    // Верёвка: сила тяжести, затем несколько раз связи возвращаются к длине.
    const prev = pts.map((q) => [q.x, q.y])
    for (let i = 1; i <= N; i++) {
      const q = pts[i], kk = Math.exp(-(i === N ? 1.1 : 2.4) * dt)
      q.vy += 2600 * dt; q.vx *= kk; q.vy *= kk
      const sp = Math.hypot(q.vx, q.vy)
      if (sp > 2600) { q.vx *= 2600 / sp; q.vy *= 2600 / sp }
      q.x += q.vx * dt; q.y += q.vy * dt
    }
    for (let it = 0; it < 8; it++) {
      pts[0].x = ax; pts[0].y = ay
      if (p) { b.x = px; b.y = py }
      for (let i = 0; i < N; i++) {
        const a = pts[i], c = pts[i + 1], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1e-6, f = (d - seg) / d * 0.5
        const wa = i === 0 ? 0 : 1, wc = i + 1 === N ? (p ? 0 : 0.3) : 1, sum = wa + wc || 1 // бусина тяжёлая
        a.x += dx * f * wa / sum * 2; a.y += dy * f * wa / sum * 2
        c.x -= dx * f * wc / sum * 2; c.y -= dy * f * wc / sum * 2
      }
    }
    pts[0].x = ax; pts[0].y = ay
    if (p) { b.x = px; b.y = py }
    for (let i = 1; i <= N; i++) { pts[i].vx = (pts[i].x - prev[i][0]) / dt; pts[i].vy = (pts[i].y - prev[i][1]) / dt }
  }

  /** Путь шнура для SVG (квадратичные сглаживания по точкам, как в оригинале). */
  path(): string {
    const pts = this.pts, N = CORD.N, b = pts[N]
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 1; i < N; i++) d += `Q${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${((pts[i].x + pts[i + 1].x) / 2).toFixed(1)} ${((pts[i].y + pts[i + 1].y) / 2).toFixed(1)}`
    return d + `L${b.x.toFixed(1)} ${b.y.toFixed(1)}`
  }

  /** Угол бусины (рад): вдоль последнего звена. */
  beadAngle(): number {
    const b = this.pts[CORD.N], e = this.pts[CORD.N - 1]
    return Math.atan2(e.x - b.x, b.y - e.y)
  }

  get reduceMotion() { return this.reduce }
}
