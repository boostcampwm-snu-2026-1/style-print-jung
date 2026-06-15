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

  if (intentSpec.generationBrief) {
    const { prompt, screens, variantCount } = intentSpec.generationBrief

    sections.push('## User Brief')
    sections.push(
      prompt.trim() ||
        'No additional user brief was provided; rely on the IntentSpec facets.'
    )
    sections.push('')

    sections.push('## Screen Plan')
    if (screens.length > 0) {
      screens.forEach((screen, index) => {
        const notes = screen.notes?.trim()
        sections.push(
          `${index + 1}. ${screen.name} (${screen.type})${notes ? ` - ${notes}` : ''}`
        )
      })
    } else {
      sections.push('1. Main screen (home)')
    }
    sections.push(
      `Variant count requested: ${variantCount}.`,
      'If multiple screens are requested, implement them inside one default-exported React component using local state, tabs, segmented controls, or menu-driven screen switching instead of routing or multiple entry files.',
      'If multiple variants are requested, present them as selectable concepts inside the same component.',
      ''
    )
  }

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
    '9. Do not generate Next.js layout, metadata, routing, config, CSS, or analytics files.',
    '',
    'Generate the complete React component code now.'
  )

  return sections.join('\n')
}
