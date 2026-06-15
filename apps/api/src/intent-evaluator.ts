import { nanoid } from 'nanoid'
import type {
  ConflictCard,
  IntentSpec,
  RepairPlan,
} from '@style-print-jung/shared'
import { adjustForContrast, calculateContrastRatio } from './color-extractor'

export function evaluateIntentSpec(intentSpec: IntentSpec): {
  conflicts: ConflictCard[]
  repairs: RepairPlan[]
  coherenceScore: number
} {
  const conflicts: ConflictCard[] = []
  const repairs: RepairPlan[] = []

  if (intentSpec.normalized.palette) {
    const palette = intentSpec.normalized.palette
    const textColor = palette.text
    const bgColor = palette.background

    if (textColor && bgColor) {
      const ratio = calculateContrastRatio(textColor, bgColor)

      if (ratio < 4.5) {
        const conflictId = nanoid()
        const adjustedText = adjustForContrast(textColor, bgColor, 4.5)
        const repairId = nanoid()

        conflicts.push({
          id: conflictId,
          type: 'contrast',
          severity: ratio < 3 ? 'error' : 'warn',
          message: `Text color contrast is insufficient (${ratio.toFixed(2)}:1)`,
          rationale: 'WCAG AA requires minimum 4.5:1 for normal text',
          affectedKeys: ['palette.text', 'palette.background'],
          suggestedRepairs: [repairId],
        })

        repairs.push({
          id: repairId,
          title: 'Adjust text color for contrast',
          description: `Change text color from ${textColor} to ${adjustedText}`,
          changes: [{ key: 'palette.text', from: textColor, to: adjustedText }],
          explanation: 'Adjusted text color to meet WCAG AA standard (4.5:1)',
          scoreDelta: 15,
        })
      }
    }

    const primaryColor = palette.primary
    if (primaryColor && bgColor) {
      const ratio = calculateContrastRatio(primaryColor, bgColor)
      if (ratio < 3) {
        conflicts.push({
          id: nanoid(),
          type: 'contrast',
          severity: 'warn',
          message: `Primary color has low contrast with background (${ratio.toFixed(2)}:1)`,
          rationale: 'Accent colors should have at least 3:1 contrast for visibility',
          affectedKeys: ['palette.primary', 'palette.background'],
          suggestedRepairs: [],
        })
      }
    }
  }

  if (intentSpec.normalized.typography && intentSpec.normalized.layout) {
    const bodySize = intentSpec.normalized.typography.scale.body
    const density = intentSpec.normalized.layout.density

    if (density === 'compact' && bodySize < 14) {
      const repairId = nanoid()
      conflicts.push({
        id: nanoid(),
        type: 'densityTypographyMismatch',
        severity: 'warn',
        message: 'Compact layout with small body text may hurt readability',
        rationale: 'Body text smaller than 14px in compact layouts is hard to read',
        affectedKeys: ['typography.scale.body', 'layout.density'],
        suggestedRepairs: [repairId],
      })

      repairs.push({
        id: repairId,
        title: 'Increase body font size',
        description: `Change body size from ${bodySize}px to 14px`,
        changes: [{ key: 'typography.scale.body', from: bodySize, to: 14 }],
        explanation: 'Increased to minimum readable size for compact layouts',
        scoreDelta: 10,
      })
    }
  }

  if (intentSpec.normalized.spacing) {
    const baseUnit = intentSpec.normalized.spacing.baseUnit
    const density = intentSpec.normalized.layout?.density

    if (density === 'compact' && baseUnit === 8) {
      conflicts.push({
        id: nanoid(),
        type: 'spacingScaleMismatch',
        severity: 'info',
        message: 'Spacing base unit (8px) might be too large for compact layout',
        rationale: 'Consider using 4px base unit for tighter spacing',
        affectedKeys: ['spacing.baseUnit', 'layout.density'],
        suggestedRepairs: [],
      })
    } else if (density === 'comfortable' && baseUnit === 4) {
      conflicts.push({
        id: nanoid(),
        type: 'spacingScaleMismatch',
        severity: 'info',
        message: 'Spacing base unit (4px) might be too tight for comfortable layout',
        rationale: 'Consider using 8px base unit for more breathing room',
        affectedKeys: ['spacing.baseUnit', 'layout.density'],
        suggestedRepairs: [],
      })
    }
  }

  let coherenceScore = 100
  conflicts.forEach((conflict) => {
    if (conflict.severity === 'error') coherenceScore -= 20
    else if (conflict.severity === 'warn') coherenceScore -= 10
    else coherenceScore -= 5
  })

  return {
    conflicts,
    repairs,
    coherenceScore: Math.max(0, Math.min(100, coherenceScore)),
  }
}
