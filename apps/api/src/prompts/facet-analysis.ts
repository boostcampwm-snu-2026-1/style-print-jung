type FacetAnalysisPromptInput = {
  colorPalette: Record<string, string>
  assetDimensions?: {
    width?: number
    height?: number
  }
}

export const FACET_ANALYSIS_INSTRUCTIONS = [
  'You are the StylePrint facet extraction agent.',
  'Return JSON that exactly matches the supplied schema.',
  'Extract only visual evidence that is observable in the uploaded design asset.',
  'The asset may be a UI screenshot, web/app capture, logo, color palette, brand moodboard, or simple design asset.',
  'When the asset is not a full UI screen, avoid inventing screen layout details; use unknown layout values unless a layout is visible.',
  'Do not infer colors from the image yourself; use only the palette supplied by the deterministic extractor.',
].join('\n')

export function buildFacetAnalysisPrompt({
  colorPalette,
  assetDimensions,
}: FacetAnalysisPromptInput): string {
  const dimensions =
    assetDimensions?.width && assetDimensions?.height
      ? `${assetDimensions.width}x${assetDimensions.height}px`
      : 'unknown'

  return [
    'Analyze the uploaded design asset and return structured design facets.',
    '',
    'Asset handling rules:',
    '- UI screenshot or web/app capture: extract typography, layout pattern, spacing density, component style, and mood.',
    '- Logo image: extract visible typography cues, brand mood, radius/border/shadow cues only if present; set layout to unknown if no screen layout exists.',
    '- Color palette image: prioritize mood and palette interpretation; do not invent typography or component styling beyond visible evidence.',
    '- Brand moodboard image: summarize recurring visual rules visible within this uploaded asset, not one-off decorative details.',
    '- Simple SVG/PNG/JPEG/WebP asset: extract reusable style cues and mark uncertain facets conservatively.',
    '',
    'Facet quality rules:',
    '- Prefer stable reusable rules over scene-specific details.',
    '- Use compact/comfortable density based on visible spacing rhythm.',
    '- Use componentStyle only for visible UI or asset styling cues such as radius, border, and shadow.',
    '- Mood keywords should be specific, design-oriented, and limited to 3-6 terms.',
    `- Asset dimensions: ${dimensions}. Use this only to calibrate approximate typography and spacing scale; do not overfit to screenshot resolution.`,
    '',
    `Sharp palette by semantic role: ${JSON.stringify(colorPalette)}`,
  ].join('\n')
}
