/**
 * Единицы (SPEC §5). Проект хранится в см. Преобразование в метры сцены выполняется
 * один раз на границе визуализации: 100 см = 1 единица сцены. Нормализованный ассет
 * (размеры в см) повторно не масштабируется.
 */
export const CM_PER_SCENE_UNIT = 100
export const CM2_PER_M2 = 10_000

export const cmToScene = (cm: number): number => cm / CM_PER_SCENE_UNIT
export const sceneToCm = (units: number): number => units * CM_PER_SCENE_UNIT

export const cm2ToM2 = (cm2: number): number => cm2 / CM2_PER_M2
export const m2ToCm2 = (m2: number): number => m2 * CM2_PER_M2

/**
 * Коэффициент масштаба модели при загрузке: измеренный размер модели в единицах сцены
 * -> размер из карточки каталога в см. Применяется один раз; для уже нормализованной
 * модели результат равен 1.
 */
export function fitScale(measuredSceneSize: number, catalogSizeCm: number): number {
  if (!(measuredSceneSize > 0) || !(catalogSizeCm > 0)) throw new Error('fitScale: размеры должны быть положительными')
  return cmToScene(catalogSizeCm) / measuredSceneSize
}

/** Подпись в целых сантиметрах; не участвует в проверках столкновений. */
export const formatCm = (cm: number): string => `${Math.round(cm)} см`
export const formatM2 = (m2: number): string => `${m2.toFixed(1).replace('.', ',')} м²`
