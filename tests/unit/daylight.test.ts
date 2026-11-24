import { describe, expect, it } from 'vitest'
import { daylightAt, formatHour, lightRig, smooth, sunPosition, wrapHour } from '../../src/scene3d/daylight'
import { worldLayout } from '../../src/scene3d/worldLayout'

// Этап 20: время суток, положение солнца и луны, плавность переходов, внешний мир.
const len = (v: readonly number[]) => Math.hypot(...v)

describe('20.1 солнце', () => {
  it('в полдень солнце на юге и высоко, утром на востоке, вечером на западе', () => {
    const noon = sunPosition(12)
    expect(noon.altitudeDeg).toBeCloseTo(50, 0) // 90° − 50° широты + 10° склонения
    expect(noon.azimuthDeg).toBeCloseTo(180, 0)
    expect(noon.direction[2]).toBeGreaterThan(0) // юг — это +Z сцены (север — вверх плана, −Z)
    const morning = sunPosition(8)
    expect(morning.direction[0]).toBeGreaterThan(0.4) // восток — +X
    const evening = sunPosition(17)
    expect(evening.direction[0]).toBeLessThan(-0.4)
  })

  it('направление — единичный вектор, ночью солнце под горизонтом', () => {
    for (let h = 0; h < 24; h += 0.5) expect(len(sunPosition(h).direction)).toBeCloseTo(1, 6)
    expect(sunPosition(0).altitudeDeg).toBeLessThan(-30)
    expect(sunPosition(0).direction[1]).toBeLessThan(0)
  })

  it('тень движется: от утра до вечера направление света заметно меняется, а высота растёт до полудня', () => {
    const a = daylightAt(8).light.direction, b = daylightAt(12).light.direction, c = daylightAt(17).light.direction
    expect(b[1]).toBeGreaterThan(a[1])
    expect(b[1]).toBeGreaterThan(c[1])
    expect(a[0] * c[0]).toBeLessThan(0) // с разных сторон
  })

  it('час приводится в диапазон, формат ЧЧ:ММ', () => {
    expect(wrapHour(24)).toBe(0)
    expect(wrapHour(-1)).toBe(23)
    expect(formatHour(8.25)).toBe('08:15')
    expect(formatHour(24)).toBe('00:00')
  })
})

describe('20.1 свет и небо по времени суток', () => {
  it('днём светит солнце, ночью луна, свет всегда направлен сверху', () => {
    expect(daylightAt(13).light.isMoon).toBe(false)
    expect(daylightAt(13).light.intensity).toBeGreaterThan(3)
    expect(daylightAt(23).light.isMoon).toBe(true)
    expect(daylightAt(23).light.intensity).toBeGreaterThan(0.05)
    expect(daylightAt(23).light.intensity).toBeLessThan(daylightAt(13).light.intensity / 3)
    for (const h of [3, 8, 13, 18.5, 23]) expect(daylightAt(h).light.direction[1], `час ${h}`).toBeGreaterThan(0)
  })

  it('на закате свет красный и слабый, в полдень белый и сильный', () => {
    const color = (h: number) => daylightAt(h).light.color
    const r = (hex: string) => parseInt(hex.slice(1, 3), 16), b = (hex: string) => parseInt(hex.slice(5, 7), 16)
    expect(r(color(17.5)) - b(color(17.5))).toBeGreaterThan(r(color(12)) - b(color(12)))
    expect(daylightAt(17.5).light.intensity).toBeLessThan(daylightAt(12).light.intensity)
  })

  it('звёзды и огни в окнах только ночью', () => {
    expect(daylightAt(13).night).toBe(0)
    expect(daylightAt(1).night).toBe(1)
    expect(daylightAt(23).night).toBeGreaterThan(0.9)
  })

  it('переходы плавные: соседние четверти часа различаются мало (нет скачков света)', () => {
    let prev = daylightAt(0)
    for (let h = 0.25; h <= 24; h += 0.25) {
      const cur = daylightAt(h)
      // Восход идёт быстро (солнце поднимается на градус за 4 минуты), но без скачка на всю силу света за четверть часа.
      expect(Math.abs(cur.light.intensity - prev.light.intensity), `свет ${h}`).toBeLessThan(1.4)
      expect(Math.abs(cur.hemisphere.intensity - prev.hemisphere.intensity), `полусфера ${h}`).toBeLessThan(0.1)
      expect(Math.abs(cur.environmentIntensity - prev.environmentIntensity), `окружение ${h}`).toBeLessThan(0.15)
      expect(Math.abs(cur.night - prev.night), `ночь ${h}`).toBeLessThan(0.5)
      prev = cur
    }
  })

  it('в момент смены солнца на луну сила света близка к нулю (нет вспышки)', () => {
    for (let h = 4; h < 8; h += 0.05) {
      const a = daylightAt(h), b = daylightAt(h + 0.05)
      if (a.light.isMoon !== b.light.isMoon) { expect(Math.max(a.light.intensity, b.light.intensity)).toBeLessThan(0.1); return }
    }
    throw new Error('смена солнца на луну не найдена на утреннем отрезке')
  })

  it('цвета неба и силы света — конечные числа и корректные цвета', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const d = daylightAt(h)
      for (const hex of [d.sky.top, d.sky.horizon, d.hemisphere.sky, d.hemisphere.ground, d.light.color]) expect(hex, `час ${h}`).toMatch(/^#[0-9a-f]{6}$/)
      expect(Number.isFinite(d.light.intensity) && Number.isFinite(d.environmentIntensity)).toBe(true)
    }
  })

  it('smooth: монотонный переход, в том числе в обратную сторону', () => {
    expect(smooth(0, 10, -5)).toBe(0)
    expect(smooth(0, 10, 15)).toBe(1)
    expect(smooth(-3, -12, 0)).toBe(0)
    expect(smooth(-3, -12, -20)).toBe(1)
  })
})

describe('20.4 камера теней', () => {
  const bounds = { minX: 0, maxX: 500, minZ: 0, maxZ: 400 }
  it('солнце над центром комнаты на нужной стороне, у горизонта камера не вырождается', () => {
    const east = lightRig(bounds, daylightAt(8).light.direction)
    expect(east.position[0]).toBeGreaterThan(east.target[0])
    const west = lightRig(bounds, daylightAt(17).light.direction)
    expect(west.position[0]).toBeLessThan(west.target[0])
    const low = lightRig(bounds, [1, 0, 0])
    expect(low.position[1]).toBeGreaterThan(0)
    expect(Number.isFinite(low.radius)).toBe(true)
  })
})

describe('20.3 мир за окнами', () => {
  it('одинаков при каждом запуске, дома и деревья не стоят в зоне квартиры', () => {
    const a = worldLayout(10), b = worldLayout(10)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.houses.length).toBeGreaterThan(10)
    expect(a.trees.length).toBeGreaterThan(30)
    for (const h of a.houses) expect(Math.hypot(h.x, h.z)).toBeGreaterThan(10)
    for (const t of a.trees) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(10)
  })

  it('дома не пересекаются друг с другом и в каждом есть окна', () => {
    const { houses } = worldLayout(10)
    for (let i = 0; i < houses.length; i++) {
      expect(houses[i].windows.length).toBeGreaterThan(0)
      for (let j = i + 1; j < houses.length; j++) {
        expect(Math.hypot(houses[i].x - houses[j].x, houses[i].z - houses[j].z)).toBeGreaterThan(8)
      }
    }
  })
})
