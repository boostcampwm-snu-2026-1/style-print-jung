import type { IntentSpec } from '@style-print-jung/shared'

export const INTENT_EXPORT_SYSTEM_PROMPT = [
  'You are the StylePrint export agent.',
  'Translate framework-neutral IntentSpecs into clean React + Tailwind exports.',
  'Preserve the supplied design intent over generic framework defaults.',
  'Return only the component code, without explanations.',
].join(' ')

export function buildIntentExportPrompt(
  intentSpec: IntentSpec,
  fallbackTarget: IntentSpec['targetExport']
): string {
  const { normalized } = intentSpec
  const targetExport = intentSpec.targetExport || fallbackTarget
  const sections: string[] = [
    'Translate the following framework-neutral IntentSpec into a UI code export.',
    `Current export target: ${targetExport.label} (${targetExport.format}).`,
    'Treat the IntentSpec as the source of truth. Do not replace it with a generic Tailwind aesthetic.',
    '',
  ]

  if (normalized.palette) {
    sections.push('## Color Palette', 'Use these exact colors with semantic roles:')
    Object.entries(normalized.palette).forEach(([role, hex]) => {
      sections.push(`- ${role}: ${hex}`)
    })
    sections.push('')
  }

  if (normalized.typography) {
    const typo = normalized.typography
    sections.push('## Typography')
    if (typo.fontCandidates?.[0]) {
      sections.push(`- Font family candidate: ${typo.fontCandidates[0].name}`)
    }
    sections.push(
      `- Heading 1: ${typo.scale.h1}px`,
      `- Heading 2: ${typo.scale.h2}px`,
      `- Body: ${typo.scale.body}px`,
      `- Caption: ${typo.scale.caption}px`,
      `- Display line height: ${typo.lineHeight.display}`,
      `- Body line height: ${typo.lineHeight.body}`,
      ''
    )
  }

  if (normalized.layout) {
    sections.push(
      '## Layout',
      `- Pattern: ${normalized.layout.pattern}`,
      `- Density: ${normalized.layout.density}`
    )
    if (normalized.layout.columns) {
      sections.push(`- Columns: ${normalized.layout.columns}`)
    }
    if (normalized.layout.notes) {
      sections.push(`- Notes: ${normalized.layout.notes}`)
    }
    sections.push('')
  }

  if (normalized.spacing) {
    sections.push(
      '## Spacing',
      `- Base unit: ${normalized.spacing.baseUnit}px`,
      `- Scale: ${normalized.spacing.scale.join(', ')}px`,
      `- Density: ${normalized.spacing.density}`,
      ''
    )
  }

  if (normalized.componentStyle) {
    sections.push(
      '## Component Style',
      `- Border radius: ${normalized.componentStyle.radius}`,
      `- Shadow: ${normalized.componentStyle.shadow}`,
      `- Border: ${normalized.componentStyle.border}`,
      ''
    )
  }

  sections.push(
    '## Export Requirements',
    '1. Create one complete default-exported React component.',
    '2. Use Tailwind CSS classes as the current export format.',
    '3. Use Tailwind arbitrary values when needed to preserve exact colors, sizes, spacing, radius, or shadows.',
    '4. Do not import external component libraries or remote assets.',
    '5. Ensure color combinations meet WCAG AA contrast requirements where text is rendered.',
    '6. Make the component responsive with mobile-first structure.',
    '7. Use semantic HTML and accessible labels for interactive elements.',
    '8. Preserve the IntentSpec style decisions instead of falling back to framework defaults.',
    '',
    'Generate the complete React component code now.'
  )

  return sections.join('\n')
}
