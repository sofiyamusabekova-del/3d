import { describe, expect, it } from 'vitest'
import { cmToScene, sceneToCm } from '../../src/geometry/units'

// Проверяет только работоспособность окружения тестов (Tasks 2.4), не будущие функции.
describe('окружение тестов', () => {
  it('преобразует см в единицы сцены и обратно', () => {
    expect(cmToScene(100)).toBe(1)
    expect(sceneToCm(cmToScene(210))).toBeCloseTo(210, 10)
  })
})
