/**
 * Время суток без зависимости от three.js (этап 28): константы и перевод часа лежат отдельно от модели дня и ночи
 * (daylight.ts подтягивает three), чтобы шаги мастера без 3D не загружали движок. daylight.ts реэкспортирует их.
 */
export const DEFAULT_HOUR = 15

/** Час в пределах [0, 24): 24 равно 0. */
export const wrapHour = (h: number) => ((h % 24) + 24) % 24

export function formatHour(hour: number): string {
  const total = Math.round(wrapHour(hour) * 60) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const smooth01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/**
 * Сколько в комнате дневного света, 0 (ночь) … 1 (день): плавно растёт с 6 до 9 часов и падает с 18 до 21.
 * Без разрывов, поэтому подходит для плавной смены света на стартовом экране (этап 30).
 */
export const dayAmount = (hour: number): number => {
  const h = wrapHour(hour)
  return smooth01(6, 9, h) * (1 - smooth01(18, 21, h))
}

/** Режим по часу для переключателя лампы: ночь, если дневного света меньше половины. */
export const isNightHour = (hour: number) => dayAmount(hour) < 0.5

/** Часы, к которым шнур и щелчок по лампе переводят свет. */
export const DAY_PRESET_HOUR = 13
export const NIGHT_PRESET_HOUR = 23
