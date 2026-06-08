import type { IntentSpec } from '@style-print-jung/shared'

type CodeAuditPromptInput = {
  code: string
  intentSpec: IntentSpec
}

export const CODE_AUDIT_INSTRUCTIONS = [
  'You are the StylePrint generated-code audit agent.',
  'Return JSON that exactly matches the supplied schema.',
  'Audit the code as rendered UI intent, not as prose.',
  'Report only facets that are materially expressed in the generated code.',
  'Mark missing or approximate values conservatively; do not give credit for absent style rules.',
].join('\n')

export function buildCodeAuditPrompt({
  code,
  intentSpec,
}: CodeAuditPromptInput): string {
  return [
    'Audit the generated code export against the expected framework-neutral IntentSpec.',
    '',
    'Audit focus:',
    '- Palette: exact hex usage, semantic role mapping, and missing colors.',
    '- Typography: font family, weight hints, scale, and line height where visible in code.',
    '- Spacing: base unit, repeated scale, and compact vs comfortable density.',
    '- Component style: radius, shadow, and border treatment.',
    '- Ignore unrelated implementation details unless they affect the visual result.',
    '',
    `Expected IntentSpec normalized facets: ${JSON.stringify(intentSpec.normalized)}`,
    '',
    'Generated code:',
    code,
  ].join('\n')
}
