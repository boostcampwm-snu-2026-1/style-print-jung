import { createHash } from 'crypto'
import type {
  CoherenceEvaluation,
  CoherenceJudgePromptVersion,
  IntentSpec,
} from '@style-print-jung/shared'

type CoherenceJudgePromptInput = {
  intentSpec: IntentSpec
  baseline: CoherenceEvaluation
}

const RUBRIC = [
  'Evaluate whether the selected facets can produce one internally consistent UI.',
  'Judge facts before judging quality: list concrete findings and checklist outcomes first.',
  'Do not use a 0-100 scale. Return dimension ratings only: strong, adequate, weak, or fail.',
  'Reward traceable source evidence, complete core facets, and cross-source harmony.',
  'Penalize accessibility issues, mismatched density, unclear hierarchy, missing provenance, weak source harmony, and underspecified generation intent.',
  'Use rule findings only as factual hints. Do not anchor on any rule-based numeric score.',
  'Return concrete findings tied to affected IntentSpec keys.',
].join('\n')

const BAND_ANCHORS = [
  'strong: no material issue; enough evidence exists to generate a coherent UI without guessing.',
  'adequate: minor issue or small uncertainty; generation can proceed with limited interpretation.',
  'weak: material issue, missing evidence, or mismatch that will likely affect the generated UI.',
  'fail: severe contradiction, accessibility failure, or missing core information that makes the intent unreliable.',
].join('\n')

const CHECKLIST = [
  'accessibility.contrast: text/background contrast is acceptable; fail if text/background is below WCAG AA or primary accents are barely visible.',
  'accessibility.readability: typography size and line height remain readable for the selected density.',
  'visualConsistency.density: layout density, spacing base unit, typography scale, and component weight point in the same direction.',
  'visualConsistency.hierarchy: typography and component style create a clear visual hierarchy.',
  'intentCoverage.coreFacets: palette, typography, layout, and spacing are present enough to guide generation.',
  'provenanceCoverage.traceability: selected values have direct or facet-level provenance evidence.',
  'sourceHarmony.mood: selected reference moods and facet styles can plausibly combine into one product.',
  'sourceHarmony.confidence: low-confidence or sparse source facets do not dominate the style.',
  'generationReadiness.brief: prompt and screen plan are specific enough for export.',
].join('\n')

const EXAMPLES = [
  'High-coherence anchor: complete palette, readable contrast, matching compact layout with 4px spacing, direct provenance for each facet, and a concrete dashboard brief. Expected ratings are mostly strong with at most adequate.',
  'Low-coherence anchor: pale text on white background, compact layout with oversized shadows, missing typography or spacing, no provenance for selected values, and an empty brief. Expected ratings include fail or weak for affected dimensions.',
].join('\n')

export const COHERENCE_JUDGE_INSTRUCTIONS = [
  'You are the StylePrint coherence judge.',
  'Return JSON that exactly matches the supplied schema.',
  'Be specific, consistent, and conservative.',
  'Do not invent source evidence that is not present in provenance.',
].join('\n')

export const COHERENCE_JUDGE_PROMPT_VERSION: CoherenceJudgePromptVersion = {
  id: 'coherence-judge-v2',
  version: '2026-06-16.v2',
  rubricHash: createHash('sha256')
    .update([RUBRIC, BAND_ANCHORS, CHECKLIST, EXAMPLES].join('\n\n'))
    .digest('hex')
    .slice(0, 12),
  createdAt: Date.parse('2026-06-16T00:00:00.000Z'),
}

export function buildCoherenceJudgePrompt({
  intentSpec,
  baseline,
}: CoherenceJudgePromptInput): string {
  return [
    'Judge the coherence of this StylePrint IntentSpec.',
    '',
    'Rubric:',
    RUBRIC,
    '',
    'Ordinal rating anchors:',
    BAND_ANCHORS,
    '',
    'Binary checklist:',
    CHECKLIST,
    '',
    'Calibration anchors:',
    EXAMPLES,
    '',
    'Dimensions:',
    '- accessibility: contrast, readable type, and visible accents.',
    '- visualConsistency: density, spacing, typography, and component style fit.',
    '- intentCoverage: core facets are present enough to guide generation.',
    '- provenanceCoverage: chosen values are traceable to reference evidence.',
    '- sourceHarmony: selected reference moods, confidence, and facet sources can combine into one product.',
    '- generationReadiness: brief and screen plan are specific enough for export.',
    '',
    `Rule findings: ${JSON.stringify(baseline.findings)}`,
    '',
    `IntentSpec: ${JSON.stringify({
      id: intentSpec.id,
      chosen: intentSpec.chosen,
      normalized: intentSpec.normalized,
      provenance: intentSpec.provenance,
      styleContext: intentSpec.styleContext,
      generationBrief: intentSpec.generationBrief,
    })}`,
  ].join('\n')
}
