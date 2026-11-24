export const MIN_AREA_M2 = 15
export const MAX_AREA_M2 = 150

export type CmParse = { ok: true; valueCm: number; text: string } | { ok: false; message: string }

/**
 * Ввод размера в сантиметрах (SPEC §3.2): целые см, запятая и точка принимаются,
 * суффикс «см» допускается, дробь округляется, поле показывает результат.
 */
export function parseCmInput(raw: string, min: number, max: number, what: string): CmParse {
  const s = raw.trim().replace(/\s*см$/i, '').replace(',', '.')
  if (s === '') return { ok: false, message: `Введите ${what} в сантиметрах` }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, message: `${what[0].toUpperCase()}${what.slice(1)}: введите число в см, например 420` }
  const value = Math.round(Number(s))
  if (value < min) return { ok: false, message: `Слишком мало: минимум ${min} см` }
  if (value > max) return { ok: false, message: `Слишком много: максимум ${max} см` }
  return { ok: true, valueCm: value, text: String(value) }
}

export type AreaParse ={ ok: true; valueM2: number; text: string } | { ok: false; message: string }

/**
 * Ввод примерной площади (м²). Запятая и точка принимаются как десятичный разделитель,
 * суффикс «м²»/«м2» допускается; значение округляется до 0,1 м², поле показывает результат.
 * Это сумма чистых площадей помещений без стен (SPEC §5).
 */
export function parseAreaInput(raw: string): AreaParse {
  const s = raw.trim().replace(/\s*(м²|м2|кв\.?\s*м\.?)$/i, '').replace(',', '.')
  if (s === '') return { ok: false, message: 'Введите примерную площадь в м²' }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, message: 'Введите число в м², например 45 или 45,5' }
  const value = Math.round(Number(s) * 10) / 10
  if (!Number.isFinite(value)) return { ok: false, message: `Слишком много: максимум ${MAX_AREA_M2} м²` } // очень длинное число
  if (value <= 0) return { ok: false, message: 'Площадь должна быть больше нуля' }
  if (value < MIN_AREA_M2) return { ok: false, message: `Слишком мало: минимум ${MIN_AREA_M2} м²` }
  if (value > MAX_AREA_M2) return { ok: false, message: `Слишком много: максимум ${MAX_AREA_M2} м²` }
  return { ok: true, valueM2: value, text: String(value).replace('.', ',') }
}
