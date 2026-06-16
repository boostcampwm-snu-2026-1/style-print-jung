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
  'Score the IntentSpec coherence from 0 to 100.',
  'Evaluate whether the selected facets can produce one internally consistent UI.',
  'Reward traceable source evidence and complete core facets.',
  'Penalize accessibility issues, mismatched density, unclear hierarchy, missing provenance, weak source harmony, and underspecified generation intent.',
  'Use the supplied rule-based baseline as a reference, but correct it when the rubric makes a better judgment.',
  'Return concrete findings tied to affected IntentSpec keys.',
].join('\n')

export const COHERENCE_JUDGE_INSTRUCTIONS = [
  'You are the StylePrint coherence judge.',
  'Return JSON that exactly matches the supplied schema.',
  'Be specific, consistent, and conservative.',
  'Do not invent source evidence that is not present in provenance.',
].join('\n')

export const COHERENCE_JUDGE_PROMPT_VERSION: CoherenceJudgePromptVersion = {
  id: 'coherence-judge-v1',
  version: '2026-06-16.v1',
  rubricHash: createHash('sha256').update(RUBRIC).digest('hex').slice(0, 12),
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
    'Dimensions:',
    '- accessibility: contrast, readable type, and visible accents.',
    '- visualConsistency: density, spacing, typography, and component style fit.',
    '- intentCoverage: core facets are present enough to guide generation.',
    '- provenanceCoverage: chosen values are traceable to reference evidence.',
    '- sourceHarmony: selected reference moods, confidence, and facet sources can combine into one product.',
    '- generationReadiness: brief and screen plan are specific enough for export.',
    '',
    `Rule-based baseline: ${JSON.stringify(baseline)}`,
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
