import { promises as fs } from 'fs'
import path from 'path'
import { evaluateIntentSpec } from '../apps/api/src/intent-evaluator'
import type {
  CoherenceDimension,
  CoherenceFeedback,
  CoherenceJudgeResult,
  IntentSpec,
} from '@style-print-jung/shared'

type Args = {
  out?: string
  format: 'markdown' | 'json'
}

type AgreementRow = {
  intentId: string
  ruleScore: number
  judgeScore: number | null
  scoreDelta: number | null
  feedbackCount: number
  latestFeedbackRating: CoherenceFeedback['rating'] | null
  expectedScore: number | null
  judgeHumanAbsError: number | null
  ruleHumanAbsError: number | null
}

type AgreementReport = {
  generatedAt: string
  dataDir: string
  summary: {
    intentCount: number
    judgedIntentCount: number
    feedbackIntentCount: number
    humanExpectedScoreCount: number
    avgRuleJudgeAbsDelta: number | null
    avgJudgeHumanAbsError: number | null
    avgRuleHumanAbsError: number | null
    cohenKappaJudgeHuman: number | null
    cohenKappaRuleHuman: number | null
    avgDimensionAbsDelta: Partial<Record<CoherenceDimension, number>>
  }
  rows: AgreementRow[]
}

const coherenceDimensions: CoherenceDimension[] = [
  'accessibility',
  'visualConsistency',
  'intentCoverage',
  'provenanceCoverage',
  'sourceHarmony',
  'generationReadiness',
]

const args = parseArgs(process.argv.slice(2))
const dataDir = path.join(process.cwd(), 'data')

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

async function main() {
  const [intents, judgeResults, feedback] = await Promise.all([
    readJson<IntentSpec>('intents.json'),
    readJson<CoherenceJudgeResult>('coherence-judge-results.json'),
    readJson<CoherenceFeedback>('coherence-feedback.json'),
  ])

  const latestJudgeByIntent = latestByIntent(judgeResults)
  const feedbackByIntent = groupBy(feedback, (item) => item.intentSpecId)

  const rows = intents
    .map((intent) => buildRow(intent, latestJudgeByIntent.get(intent.id) || null, feedbackByIntent.get(intent.id) || []))
    .sort((a, b) => Math.abs(b.scoreDelta || 0) - Math.abs(a.scoreDelta || 0))

  const judgedRows = rows.filter((row) => row.judgeScore !== null)
  const humanRows = rows.filter((row) => row.expectedScore !== null)

  const report: AgreementReport = {
    generatedAt: new Date().toISOString(),
    dataDir,
    summary: {
      intentCount: rows.length,
      judgedIntentCount: judgedRows.length,
      feedbackIntentCount: rows.filter((row) => row.feedbackCount > 0).length,
      humanExpectedScoreCount: humanRows.length,
      avgRuleJudgeAbsDelta: average(judgedRows.map((row) => Math.abs(row.scoreDelta || 0))),
      avgJudgeHumanAbsError: average(nonNull(humanRows.map((row) => row.judgeHumanAbsError))),
      avgRuleHumanAbsError: average(nonNull(humanRows.map((row) => row.ruleHumanAbsError))),
      cohenKappaJudgeHuman: scoreBandKappa(
        nonNull(humanRows.map((row) =>
          row.judgeScore === null || row.expectedScore === null
            ? null
            : [scoreBand(row.judgeScore), scoreBand(row.expectedScore)] as const
        ))
      ),
      cohenKappaRuleHuman: scoreBandKappa(
        nonNull(humanRows.map((row) =>
          row.expectedScore === null
            ? null
            : [scoreBand(row.ruleScore), scoreBand(row.expectedScore)] as const
        ))
      ),
      avgDimensionAbsDelta: buildDimensionDeltas(intents, latestJudgeByIntent),
    },
    rows,
  }

  const output = args.format === 'json'
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderMarkdown(report)

  if (args.out) {
    await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true })
    await fs.writeFile(args.out, output)
    console.log(`Wrote ${args.out}`)
  } else {
    process.stdout.write(output)
  }
}

function buildRow(
  intent: IntentSpec,
  judge: CoherenceJudgeResult | null,
  feedback: CoherenceFeedback[]
): AgreementRow {
  const rule = evaluateIntentSpec(intent)
  const latestFeedback = [...feedback].sort((a, b) => b.createdAt - a.createdAt)[0]
  const expectedScore = latestFeedback?.expectedScore ?? null
  const judgeScore = judge?.score ?? null

  return {
    intentId: intent.id,
    ruleScore: rule.coherenceScore,
    judgeScore,
    scoreDelta: judgeScore === null ? null : judgeScore - rule.coherenceScore,
    feedbackCount: feedback.length,
    latestFeedbackRating: latestFeedback?.rating ?? null,
    expectedScore,
    judgeHumanAbsError:
      judgeScore === null || expectedScore === null
        ? null
        : Math.abs(judgeScore - expectedScore),
    ruleHumanAbsError:
      expectedScore === null ? null : Math.abs(rule.coherenceScore - expectedScore),
  }
}

async function readJson<T>(filename: string): Promise<T[]> {
  const filePath = path.join(dataDir, filename)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error(`Failed to read ${filePath}: ${(error as Error).message}`)
  }
}

function parseArgs(raw: string[]): Args {
  const parsed: Args = { format: 'markdown' }

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index]
    if (item === '--json') {
      parsed.format = 'json'
    } else if (item === '--out') {
      const out = raw[index + 1]
      if (!out || out.startsWith('--')) {
        throw new Error('Missing value for --out')
      }
      parsed.out = out
      index += 1
    }
  }

  return parsed
}

function latestByIntent<T extends { intentSpecId: string; createdAt: number }>(
  items: T[]
): Map<string, T> {
  const latest = new Map<string, T>()
  items.forEach((item) => {
    const existing = latest.get(item.intentSpecId)
    if (!existing || item.createdAt > existing.createdAt) {
      latest.set(item.intentSpecId, item)
    }
  })
  return latest
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  items.forEach((item) => {
    const key = getKey(item)
    grouped.set(key, [...(grouped.get(key) || []), item])
  })
  return grouped
}

function buildDimensionDeltas(
  intents: IntentSpec[],
  judges: Map<string, CoherenceJudgeResult>
): Partial<Record<CoherenceDimension, number>> {
  const deltas = coherenceDimensions.reduce((acc, dimension) => {
    acc[dimension] = []
    return acc
  }, {} as Record<CoherenceDimension, number[]>)

  intents.forEach((intent) => {
    const judge = judges.get(intent.id)
    if (!judge) return

    const rule = evaluateIntentSpec(intent)
    coherenceDimensions.forEach((dimension) => {
      deltas[dimension].push(
        Math.abs(judge.dimensions[dimension] - rule.coherence.dimensions[dimension])
      )
    })
  })

  return coherenceDimensions.reduce((acc, dimension) => {
    const value = average(deltas[dimension])
    if (value !== null) acc[dimension] = value
    return acc
  }, {} as Partial<Record<CoherenceDimension, number>>)
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function nonNull<T>(values: Array<T | null>): T[] {
  return values.filter((value): value is T => value !== null)
}

function scoreBand(score: number): 'low' | 'medium' | 'high' {
  if (score < 60) return 'low'
  if (score < 85) return 'medium'
  return 'high'
}

function scoreBandKappa(
  pairs: ReadonlyArray<readonly ['low' | 'medium' | 'high', 'low' | 'medium' | 'high']>
): number | null {
  if (pairs.length < 2) return null

  const labels = ['low', 'medium', 'high'] as const
  const observed = pairs.filter(([a, b]) => a === b).length / pairs.length
  const expected = labels.reduce((sum, label) => {
    const left = pairs.filter(([a]) => a === label).length / pairs.length
    const right = pairs.filter(([, b]) => b === label).length / pairs.length
    return sum + left * right
  }, 0)

  if (expected === 1) return null
  return round((observed - expected) / (1 - expected))
}

function renderMarkdown(report: AgreementReport): string {
  const lines = [
    '# Coherence Agreement Report',
    '',
    `Generated at: ${report.generatedAt}`,
    `Data dir: \`${path.relative(process.cwd(), report.dataDir) || '.'}\``,
    '',
    '## Summary',
    '',
    `- IntentSpecs: ${report.summary.intentCount}`,
    `- With latest judge result: ${report.summary.judgedIntentCount}`,
    `- With feedback: ${report.summary.feedbackIntentCount}`,
    `- With expected human score: ${report.summary.humanExpectedScoreCount}`,
    `- Avg |judge-rule| score delta: ${formatNullableNumber(report.summary.avgRuleJudgeAbsDelta)}`,
    `- Avg |judge-human| error: ${formatNullableNumber(report.summary.avgJudgeHumanAbsError)}`,
    `- Avg |rule-human| error: ${formatNullableNumber(report.summary.avgRuleHumanAbsError)}`,
    `- Cohen's kappa judge-human score band: ${formatNullableNumber(report.summary.cohenKappaJudgeHuman)}`,
    `- Cohen's kappa rule-human score band: ${formatNullableNumber(report.summary.cohenKappaRuleHuman)}`,
    '',
    '## Dimension Deltas',
    '',
    '| Dimension | Avg |judge-rule| |',
    '| --- | ---: |',
  ]

  coherenceDimensions.forEach((dimension) => {
    lines.push(`| ${dimension} | ${formatNullableNumber(report.summary.avgDimensionAbsDelta[dimension] ?? null)} |`)
  })

  lines.push(
    '',
    '## Intent Rows',
    '',
    '| Intent | Rule | Judge | Delta | Feedback | Human rating | Expected | Judge error | Rule error |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |'
  )

  if (report.rows.length === 0) {
    lines.push('| _none_ |  |  |  |  |  |  |  |  |')
  } else {
    report.rows.forEach((row) => {
      lines.push([
        `\`${row.intentId}\``,
        String(row.ruleScore),
        formatNullableNumber(row.judgeScore),
        formatNullableNumber(row.scoreDelta),
        String(row.feedbackCount),
        row.latestFeedbackRating || '-',
        formatNullableNumber(row.expectedScore),
        formatNullableNumber(row.judgeHumanAbsError),
        formatNullableNumber(row.ruleHumanAbsError),
      ].join(' | ').replace(/^/, '| ').concat(' |'))
    })
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- Judge rows use the latest saved `CoherenceJudgeResult` per IntentSpec.',
    '- Human agreement metrics require feedback records with `expectedScore`.',
    '- Cohen\'s kappa buckets scores into low (<60), medium (60-84), and high (85-100).',
    ''
  )

  return lines.join('\n')
}

function formatNullableNumber(value: number | null): string {
  return value === null ? '-' : String(value)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
