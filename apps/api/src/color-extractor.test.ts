import { describe, expect, test } from 'vitest'
import {
  adjustForContrast,
  assignColorRoles,
  calculateContrastRatio,
  checkWCAGCompliance,
} from './color-extractor'

describe('color extractor utilities', () => {
  test('calculates WCAG contrast ratios and compliance thresholds', () => {
    const ratio = calculateContrastRatio('#000000', '#ffffff')

    expect(ratio).toBeCloseTo(21, 1)
    expect(checkWCAGCompliance(ratio)).toEqual({
      aa: true,
      aaLarge: true,
      aaa: true,
      aaaLarge: true,
    })
  })

  test('adjusts a foreground color until it meets target contrast', () => {
    const adjusted = adjustForContrast('#eeeeee', '#ffffff', 4.5)

    expect(calculateContrastRatio(adjusted, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  test('assigns deterministic semantic roles from extracted colors', () => {
    const tokens = assignColorRoles([
      { hex: '#ffffff', frequency: 0.55 },
      { hex: '#111111', frequency: 0.25 },
      { hex: '#e0005a', frequency: 0.12 },
      { hex: '#3876d6', frequency: 0.08 },
    ])
    const byRole = Object.fromEntries(
      tokens.map((token) => [token.value.role, token.value.hex])
    )

    expect(byRole.background).toBe('#ffffff')
    expect(byRole.text).toBe('#111111')
    expect(byRole.primary).toBe('#e0005a')
    expect(byRole.surface).toBeDefined()
  })
})
