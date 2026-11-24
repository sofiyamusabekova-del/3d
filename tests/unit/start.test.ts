import { describe, expect, it } from 'vitest'
import { DAY_PRESET_HOUR, dayAmount, isNightHour, NIGHT_PRESET_HOUR } from '../../src/scene3d/hour'
import { CORD, CORD_LENGTH, PullCord } from '../../src/ui/pullCord'
import { formatClock, sceneMarkup } from '../../src/ui/StartScene'
import { HORIZON, skyState } from '../../src/ui/startSky'

describe('свет главного меню', () => {
  it('день плавный: ночью 0, днём 1, без разрывов между соседними часами', () => {
    expect(dayAmount(23)).toBe(0)
    expect(dayAmount(3)).toBe(0)
    expect(dayAmount(13)).toBe(1)
    let prev = dayAmount(0)
    for (let h = 0.05; h <= 24; h += 0.05) { const v = dayAmount(h); expect(Math.abs(v - prev), `час ${h.toFixed(2)}`).toBeLessThan(0.06); prev = v }
  })
  it('режим по часу и часы переключения', () => {
    expect(isNightHour(DAY_PRESET_HOUR)).toBe(false)
    expect(isNightHour(NIGHT_PRESET_HOUR)).toBe(true)
    expect(isNightHour(7)).toBe(true)
    expect(isNightHour(8.5)).toBe(false)
  })
  it('время как ЧЧ:ММ с шагом в полчаса', () => {
    expect(formatClock(13)).toBe('13:00')
    expect(formatClock(6.5)).toBe('06:30')
  })
  it('запасная картинка: день и ночь различаются, без NaN', () => {
    const day = sceneMarkup(13), night = sceneMarkup(23)
    expect(day).not.toBe(night)
    expect(night).toContain('<circle')
    expect(day + night).not.toMatch(/NaN|undefined/)
  })
})

describe('небо за окном меню', () => {
  it('днём солнце над холмами, луны нет; ночью наоборот', () => {
    const d = skyState(DAY_PRESET_HOUR), n = skyState(NIGHT_PRESET_HOUR)
    expect(d.sun.y).toBeGreaterThan(HORIZON + 0.8)
    expect(d.sun.opacity).toBe(1)
    expect(d.moon.opacity).toBe(0)
    expect(d.stars).toBe(0)
    expect(n.moon.y).toBeGreaterThan(HORIZON + 0.8)
    expect(n.moon.opacity).toBe(1)
    expect(n.sun.opacity).toBe(0)
    expect(n.stars).toBe(1)
    expect(n.clouds).toBe(0)
  })
  it('светила идут по дуге и без скачков уходят за холмы: солнце к вечеру, луна восходит', () => {
    let prev = skyState(6)
    for (let h = 6.05; h <= 30; h += 0.05) {
      const s = skyState(h)
      expect(Math.abs(s.sun.y - prev.sun.y), `солнце ${h.toFixed(2)}`).toBeLessThan(0.12)
      expect(Math.abs(s.moon.y - prev.moon.y), `луна ${h.toFixed(2)}`).toBeLessThan(0.12)
      if (s.sun.y > HORIZON) { expect(s.sun.z).toBeGreaterThan(-4.8); expect(s.sun.z).toBeLessThan(-1.2) }
      if (s.moon.y > HORIZON) { expect(s.moon.z).toBeGreaterThan(-4.8); expect(s.moon.z).toBeLessThan(-1.2) }
      prev = s
    }
    expect(skyState(18.5).sun.y).toBeLessThan(HORIZON) // солнце село
    expect(skyState(19).moon.y).toBeGreaterThan(skyState(18).moon.y - 0.01) // луна поднимается
    expect(skyState(21).moon.y).toBeGreaterThan(HORIZON)
    expect(skyState(5).moon.y).toBeGreaterThan(HORIZON - 0.1)
  })
  it('солнце и луна никогда не стоят высоко над холмами одновременно', () => {
    for (let h = 0; h < 24; h += 0.25) { const s = skyState(h); expect(s.sun.y > HORIZON + 0.25 && s.moon.y > HORIZON + 0.25, `час ${h}`).toBe(false) }
  })
})

/** Шаг физики как в приложении: 60 кадров в секунду. */
function run(c: PullCord, seconds: number, each?: (t: number) => void) {
  for (let i = 0; i < Math.round(seconds * 60); i++) { each?.(i / 60); c.update(1 / 60) }
}
const make = () => { let n = 0; const c = new PullCord(() => { n++ }); c.setAnchor(300, 100); return { c, flips: () => n } }

describe('шнур (Pull Cord)', () => {
  it('повисает вертикально под якорем, длина 12 звеньев по 9 px', () => {
    const { c } = make()
    run(c, 3)
    expect(c.bead.y - 100).toBeGreaterThan(CORD_LENGTH - 12)
    expect(c.bead.y - 100).toBeLessThan(CORD_LENGTH + 8)
    expect(Math.abs(c.bead.x - 300)).toBeLessThan(3)
  })
  it('короткое или случайное движение выключатель не трогает', () => {
    const { c, flips } = make()
    run(c, 1)
    c.down(300, 100 + CORD_LENGTH)
    run(c, 0.5, (t) => c.move(300, 100 + CORD_LENGTH + 14 * Math.min(1, t * 4)))
    c.up()
    run(c, 2)
    expect(flips()).toBe(0)
  })
  it('вытягивание дальше щелчка срабатывает ровно один раз, сколько ни держи', () => {
    const { c, flips } = make()
    run(c, 1)
    c.down(300, 100 + CORD_LENGTH)
    run(c, 1.2, (t) => c.move(300, 100 + CORD_LENGTH + 160 * Math.min(1, t * 3)))
    expect(flips()).toBe(1)
    c.up()
    run(c, 0.5)
    expect(flips()).toBe(1)
  })
  it('после отпускания шнур возвращается и успокаивается; растяжение не больше предела резины', () => {
    const { c } = make()
    run(c, 1)
    c.down(300, 100 + CORD_LENGTH)
    let maxLen = 0
    run(c, 1, (t) => { c.move(300, 100 + CORD_LENGTH + 400 * Math.min(1, t * 3)); maxLen = Math.max(maxLen, Math.hypot(c.bead.x - 300, c.bead.y - 100)) })
    expect(maxLen).toBeLessThan(CORD_LENGTH + CORD.MAXS + 12)
    c.up()
    run(c, 6)
    expect(c.bead.y - 100).toBeLessThan(CORD_LENGTH + 10)
    expect(c.active).toBe(false)
  })
  it('тап и Enter тянут свободной рукой и переключают; намёк (soft) не переключает', () => {
    const a = make()
    run(a.c, 1)
    a.c.pull()
    run(a.c, 2)
    expect(a.flips()).toBe(1)
    const b = make()
    run(b.c, 1)
    b.c.pull(true)
    run(b.c, 2)
    expect(b.flips()).toBe(0)
  })
  it('тап по бусине без сдвига превращается в движение руки', () => {
    const { c, flips } = make()
    run(c, 1)
    c.down(300, 100 + CORD_LENGTH)
    c.up()
    run(c, 2)
    expect(flips()).toBe(1)
  })
})
