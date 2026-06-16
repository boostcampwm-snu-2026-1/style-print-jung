import { promises as fs } from 'fs'
import path from 'path'
import { evaluateIntentSpec } from '../apps/api/src/intent-evaluator'
import type {
  AuditReport,
  CoherenceFeedback,
  CoherenceJudgeResult,
  ConflictCard,
  GeneratedCode,
  IntentSpec,
  ReferenceAsset,
} from '@style-print-jung/shared'

type Args = {
  out?: string
  format: 'markdown' | 'json'
  failOnDrift: boolean
}

type IntentRegressionRow = {
  id: string
  createdAt: number
  storedScore: number | null
  currentScore: number
  scoreDelta: number | null
  storedConflictCount: number
  currentConflictCount: number
  conflictChanged: boolean
  repairCount: number
  generatedCount: number
  auditCount: number
  judgeResultCount: number
  feedbackCount: number
  missingChosenRefs: string[]
  generatedWithoutPreview: number
  generatedWithoutScreenshot: number
  latestGeneratedAt: number | null
  latestAuditAt: number | null
  latestJudgeAt: number | null
  latestFeedbackAt: number | null
}

type Report = {
  generatedAt: string
  dataDir: string
  summary: {
    intentCount: number
    driftedScoreCount: number
    changedConflictCount: number
    missingChosenRefCount: number
    generatedCoverageCount: number
    auditCoverageCount: number
    judgeCoverageCount: number
    feedbackCoverageCount: number
    generatedWithoutPreviewCount: number
    generatedWithoutScreenshotCount: number
  }
  rows: IntentRegressionRow[]
}

const args = parseArgs(process.argv.slice(2))
const dataDir = path.join(process.cwd(), 'data')

let referenceIds = new Set<string>()
let generatedByIntent = new Map<string, GeneratedCode[]>()
let auditsByIntent = new Map<string, AuditReport[]>()
let judgesByIntent = new Map<string, CoherenceJudgeResult[]>()
let feedbackByIntent = new Map<string, CoherenceFeedback[]>()

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

async function main() {
  const [
    references,
    intents,
    generatedCodes,
    auditReports,
    judgeResults,
    feedback,
  ] = await Promise.all([
    readJson<ReferenceAsset>('references.json'),
    readJson<IntentSpec>('intents.json'),
    readJson<GeneratedCode>('generated-code.json'),
    readJson<AuditReport>('audit-reports.json'),
    readJson<CoherenceJudgeResult>('coherence-judge-results.json'),
    readJson<CoherenceFeedback>('coherence-feedback.json'),
  ])

  referenceIds = new Set(references.map((reference) => reference.id))
  generatedByIntent = groupBy(generatedCodes, (code) => code.intentSpecId)
  auditsByIntent = groupBy(auditReports, (report) => report.intentSpecId)
  judgesByIntent = groupBy(judgeResults, (result) => result.intentSpecId)
  feedbackByIntent = groupBy(feedback, (item) => item.intentSpecId)

  const rows = intents
    .map((intent) => buildRow(intent))
    .sort((a, b) => b.createdAt - a.createdAt)

  const report: Report = {
    generatedAt: new Date().toISOString(),
    dataDir,
    summary: {
      intentCount: rows.length,
      driftedScoreCount: rows.filter((row) => row.scoreDelta !== null && row.scoreDelta !== 0).length,
      changedConflictCount: rows.filter((row) => row.conflictChanged).length,
      missingChosenRefCount: rows.filter((row) => row.missingChosenRefs.length > 0).length,
      generatedCoverageCount: rows.filter((row) => row.generatedCount > 0).length,
      auditCoverageCount: rows.filter((row) => row.auditCount > 0).length,
      judgeCoverageCount: rows.filter((row) => row.judgeResultCount > 0).length,
      feedbackCoverageCount: rows.filter((row) => row.feedbackCount > 0).length,
      generatedWithoutPreviewCount: rows.reduce((sum, row) => sum + row.generatedWithoutPreview, 0),
      generatedWithoutScreenshotCount: rows.reduce((sum, row) => sum + row.generatedWithoutScreenshot, 0),
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

  if (args.failOnDrift && hasRegression(report)) {
    process.exitCode = 1
  }
}

function buildRow(intent: IntentSpec): IntentRegressionRow {
  const current = evaluateIntentSpec(intent)
  const storedScore = typeof intent.coherenceScore === 'number' ? intent.coherenceScore : null
  const generated = generatedByIntent.get(intent.id) || []
  const audits = auditsByIntent.get(intent.id) || []
  const judges = judgesByIntent.get(intent.id) || []
  const feedback = feedbackByIntent.get(intent.id) || []

  return {
    id: intent.id,
    createdAt: intent.createdAt,
    storedScore,
    currentScore: current.coherenceScore,
    scoreDelta: storedScore === null ? null : current.coherenceScore - storedScore,
    storedConflictCount: intent.conflicts.length,
    currentConflictCount: current.conflicts.length,
    conflictChanged: conflictSignature(intent.conflicts) !== conflictSignature(current.conflicts),
    repairCount: current.repairs.length,
    generatedCount: generated.length,
    auditCount: audits.length,
    judgeResultCount: judges.length,
    feedbackCount: feedback.length,
    missingChosenRefs: getMissingChosenRefs(intent),
    generatedWithoutPreview: generated.filter((code) => !code.previewUrl).length,
    generatedWithoutScreenshot: generated.filter((code) => !code.screenshotUrl).length,
    latestGeneratedAt: maxTimestamp(generated.map((code) => code.createdAt)),
    latestAuditAt: maxTimestamp(audits.map((audit) => audit.createdAt)),
    latestJudgeAt: maxTimestamp(judges.map((result) => result.createdAt)),
    latestFeedbackAt: maxTimestamp(feedback.map((item) => item.createdAt)),
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
  const parsed: Args = {
    format: 'markdown',
    failOnDrift: false,
  }

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index]
    if (item === '--json') {
      parsed.format = 'json'
    } else if (item === '--fail-on-drift') {
      parsed.failOnDrift = true
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

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  items.forEach((item) => {
    const key = getKey(item)
    grouped.set(key, [...(grouped.get(key) || []), item])
  })
  return grouped
}

function conflictSignature(conflicts: ConflictCard[]): string {
  return conflicts
    .map((conflict) => [
      conflict.type,
      conflict.severity,
      conflict.message,
      [...conflict.affectedKeys].sort().join(','),
    ].join('|'))
    .sort()
    .join('\n')
}

function getMissingChosenRefs(intent: IntentSpec): string[] {
  return Object.entries(intent.chosen)
    .filter(([, refId]) => refId && !referenceIds.has(refId))
    .map(([key, refId]) => `${key}:${refId}`)
}

function maxTimestamp(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.max(...values)
}

function hasRegression(report: Report): boolean {
  return report.summary.driftedScoreCount > 0 ||
    report.summary.changedConflictCount > 0 ||
    report.summary.missingChosenRefCount > 0
}

function renderMarkdown(report: Report): string {
  const lines = [
    '# IntentSpec Regression Report',
    '',
    `Generated at: ${report.generatedAt}`,
    `Data dir: \`${path.relative(process.cwd(), report.dataDir) || '.'}\``,
    '',
    '## Summary',
    '',
    `- IntentSpecs: ${report.summary.intentCount}`,
    `- Score drift: ${report.summary.driftedScoreCount}`,
    `- Conflict signature changes: ${report.summary.changedConflictCount}`,
    `- Missing chosen references: ${report.summary.missingChosenRefCount}`,
    `- With generated code: ${report.summary.generatedCoverageCount}`,
    `- With audit reports: ${report.summary.auditCoverageCount}`,
    `- With coherence judge results: ${report.summary.judgeCoverageCount}`,
    `- With coherence feedback: ${report.summary.feedbackCoverageCount}`,
    `- Generated results without preview URL: ${report.summary.generatedWithoutPreviewCount}`,
    `- Generated results without screenshot URL: ${report.summary.generatedWithoutScreenshotCount}`,
    '',
    '## Intent Rows',
    '',
    '| Intent | Stored | Current | Delta | Conflicts | Repairs | Generated | Audits | Judges | Feedback | Missing refs | Latest generated | Latest audit | Latest judge | Latest feedback |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |',
  ]

  if (report.rows.length === 0) {
    lines.push('| _none_ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |')
  } else {
    report.rows.forEach((row) => {
      lines.push([
        `\`${row.id}\``,
        formatNullableNumber(row.storedScore),
        String(row.currentScore),
        formatNullableNumber(row.scoreDelta),
        `${row.storedConflictCount}->${row.currentConflictCount}${row.conflictChanged ? ' changed' : ''}`,
        String(row.repairCount),
        String(row.generatedCount),
        String(row.auditCount),
        String(row.judgeResultCount),
        String(row.feedbackCount),
        row.missingChosenRefs.length > 0 ? row.missingChosenRefs.map((item) => `\`${item}\``).join('<br>') : '-',
        formatTimestamp(row.latestGeneratedAt),
        formatTimestamp(row.latestAuditAt),
        formatTimestamp(row.latestJudgeAt),
        formatTimestamp(row.latestFeedbackAt),
      ].join(' | ').replace(/^/, '| ').concat(' |'))
    })
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- Score drift compares stored `IntentSpec.coherenceScore` with the current `evaluateIntentSpec()` result.',
    '- Conflict comparison ignores generated ids and compares type, severity, message, and affected keys.',
    '- Judge and feedback coverage show which intents are ready for prompt evaluation loops.',
    '- Preview and screenshot counts describe saved generated-code records only; this command does not call v0, OpenAI, or Playwright.',
    ''
  )

  return lines.join('\n')
}

function formatNullableNumber(value: number | null): string {
  return value === null ? '-' : String(value)
}

function formatTimestamp(value: number | null): string {
  return value === null ? '-' : new Date(value).toISOString()
}
