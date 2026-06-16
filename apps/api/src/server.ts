import Fastify, { type FastifyBaseLogger } from 'fastify'
import multipart from '@fastify/multipart'
import { nanoid } from 'nanoid'
import { createWriteStream } from 'fs'
import { promises as fs } from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import sharp from 'sharp'
import { config } from './config'
import {
  getReference,
  getReferences,
  clearRuntimeData,
  saveReference,
  deleteReference,
  saveFacetPack,
  getFacetPacks,
  getFacetPackByRefId,
  saveIntentSpec,
  getIntentSpec,
  saveGeneratedCode,
  saveAuditReport,
  saveCoherenceJudgeResult,
  saveCoherenceFeedback,
} from './db'
import {
  extractColorsFromBase64,
  assignColorRoles,
} from './color-extractor'
import { evaluateIntentSpec } from './intent-evaluator'
import { generateUICode } from './v0-client'
import {
  capturePreviewScreenshot,
  readPreviewArtifactFile,
  writePreviewArtifact,
} from './preview-artifact'
import {
  analyzeDesignFacets,
  auditGeneratedCodeWithOpenAI,
  judgeIntentCoherenceWithOpenAI,
} from './openai-client'
import { buildIntentExportPrompt } from './prompts/intent-export'
import type {
  AuditReport,
  AuditResponse,
  ApplyRepairResponse,
  ColorRole,
  ComponentStyleFacetToken,
  CoherenceFeedback,
  CoherenceEvaluation,
  CreateIntentResponse,
  EvaluateRequest,
  EvaluateResponse,
  ExtractResponse,
  FacetDiff,
  FacetPack,
  FacetType,
  GenerationJobStatus,
  GenerateRequest,
  GenerateResponse,
  GeneratedCode,
  IntentSpec,
  CoherenceJudgeResult,
  PreviewBuildResponse,
  ProvenanceBadge,
  ReferenceAsset,
  RecommendRecipesResponse,
  Recipe,
  SpacingFacetToken,
  StyleContext,
  SubmitCoherenceFeedbackRequest,
  SubmitCoherenceFeedbackResponse,
  UploadResponse,
} from '@style-print-jung/shared'

const MVP_EXPORT_TARGET: IntentSpec['targetExport'] = {
  format: 'react-tailwind',
  label: 'React + Tailwind',
  description: 'MVP export target; the IntentSpec remains framework-neutral.',
}

export const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'error' },
})

const shouldClearRuntimeOnStart = process.env.CLEAR_RUNTIME_ON_START === 'true'

type GenerationJob = {
  id: string
  status: GenerationJobStatus
  intentSpecId: string
  intentSpec?: IntentSpec
  generatedCode?: GeneratedCode
  error?: string
  createdAt: number
  updatedAt: number
}

const generationJobs = new Map<string, GenerationJob>()
const GENERATION_JOB_TTL_MS = 30 * 60 * 1000
const RECIPE_RECOMMENDATION_LIMIT = 3
const MAX_RECIPE_CANDIDATES = 200

const recipeFacetFields = [
  { key: 'colorRefId', facetType: 'color', label: 'Color' },
  { key: 'typographyRefId', facetType: 'typography', label: 'Typography' },
  { key: 'layoutRefId', facetType: 'layout', label: 'Layout' },
  { key: 'spacingRefId', facetType: 'spacing', label: 'Spacing' },
  { key: 'componentStyleRefId', facetType: 'componentStyle', label: 'Component style' },
] as const

app.register(multipart, {
  limits: {
    fileSize: config.upload.maxFileSize,
  },
})

app.addHook('onRequest', async (_request, reply) => {
  const origin = getHeader(_request.headers, 'origin')?.replace(/\/$/, '')
  const allowedOrigin =
    origin && config.api.webOrigins.includes(origin) ? origin : config.api.webOrigin

  reply.header('Access-Control-Allow-Origin', allowedOrigin)
  reply.header('Vary', 'Origin')
  reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
})

app.options('/*', async (_request, reply) => {
  reply.status(204).send()
})

app.get('/health', async () => ({ ok: true }))

app.get('/uploads/:filename', async (request, reply) => {
  const { filename } = request.params as { filename: string }
  const safeName = path.basename(filename)
  const filePath = path.join(config.upload.dir, safeName)
  const ext = path.extname(safeName).toLowerCase()
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'

  try {
    const buffer = await fs.readFile(filePath)
    reply.type(mime).send(buffer)
  } catch {
    reply.status(404).send({ success: false, error: 'File not found' })
  }
})

app.get('/generated-previews/:previewId/:filename', async (request, reply) => {
  const { previewId, filename } = request.params as {
    previewId: string
    filename: string
  }
  const artifact = await readPreviewArtifactFile(previewId, filename)

  if (!artifact) {
    return reply.status(404).send({ success: false, error: 'Preview file not found' })
  }

  return reply.type(artifact.contentType).send(artifact.buffer)
})

app.post('/api/references/upload', async (request, reply) => {
  // Files saved so far this request, so we can roll back on any failure and
  // never leave a partial upload (some files persisted, some rejected) behind.
  const references: ReferenceAsset[] = []

  const rollback = async () => {
    for (const reference of references) {
      await deleteStoredReferenceFile(reference).catch(() => undefined)
      await deleteReference(reference.id).catch(() => undefined)
    }
    references.length = 0
  }

  try {
    if (!request.isMultipart()) {
      return reply
        .status(400)
        .send({ success: false, references: [], error: 'Expected multipart upload' } satisfies UploadResponse)
    }

    await ensureUploadDir()

    let fileIndex = 0
    for await (const file of request.files()) {
      const mime = file.mimetype.toLowerCase()

      if (!config.upload.allowedMimes.includes(mime)) {
        // Drain the rejected file's stream so the multipart request can finish
        // cleanly, then undo anything already saved in this batch.
        await file.toBuffer().catch(() => undefined)
        await rollback()
        return reply.status(400).send({
          success: false,
          references: [],
          error: `File ${fileIndex + 1}: Unsupported image type: ${mime}. Allowed: ${config.upload.allowedMimes.join(', ')}`,
        } satisfies UploadResponse)
      }

      const id = nanoid()
      const extension = config.upload.mimeExtensions[mime]
      const filename = `reference-${Date.now()}-${fileIndex}-${id}.${extension}`
      const storagePath = `public/uploads/${filename}`
      const url = `/uploads/${filename}`
      const filePath = path.join(config.upload.dir, filename)

      try {
        await pipeline(file.file, createWriteStream(filePath))
      } catch (error) {
        await fs.unlink(filePath).catch(() => undefined)
        throw error
      }

      const metadata = await readStoredImageMetadata(filePath)
      const reference: ReferenceAsset = {
        id,
        filename,
        mime,
        width: metadata.width,
        height: metadata.height,
        url,
        storagePath,
        createdAt: Date.now(),
      }

      await saveReference(reference)
      references.push(reference)
      fileIndex += 1
    }

    if (references.length === 0) {
      return reply
        .status(400)
        .send({ success: false, references: [], error: 'No files provided' } satisfies UploadResponse)
    }

    return reply.send({ success: true, references } satisfies UploadResponse)
  } catch (error) {
    request.log.error(error)
    await rollback()
    if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
      return reply.status(413).send({
        success: false,
        references: [],
        error: `File too large. Maximum size: ${config.upload.maxFileSize / 1024 / 1024}MB`,
      } satisfies UploadResponse)
    }
    return reply.status(500).send({
      success: false,
      references: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies UploadResponse)
  }
})

app.get('/api/references/upload', async () => {
  const references = await getReferences()
  return { success: true, references }
})

app.delete('/api/references/upload', async (request, reply) => {
  try {
    const { id } = request.query as { id?: string }

    if (!id) {
      return reply.status(400).send({ success: false, error: 'No id provided' })
    }

    const reference = await getReference(id)
    if (reference) {
      await deleteStoredReferenceFile(reference)
    }
    await deleteReference(id)

    return reply.send({ success: true })
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/facets/extract', async (request, reply) => {
  try {
    const { refId } = request.body as { refId?: string }

    if (!refId) {
      return reply
        .status(400)
        .send({ success: false, error: 'No refId provided' } satisfies ExtractResponse)
    }

    const existing = await getFacetPackByRefId(refId)
    if (existing) {
      return reply.send({ success: true, facetPack: existing } satisfies ExtractResponse)
    }

    const reference = await getReference(refId)
    if (!reference) {
      return reply
        .status(404)
        .send({ success: false, error: 'Reference not found' } satisfies ExtractResponse)
    }

    const imageDataUrl = await getReferenceImageDataUrl(reference)
    if (!imageDataUrl) {
      return reply
        .status(400)
        .send({ success: false, error: 'Reference has no image data' } satisfies ExtractResponse)
    }

    const extractedColors = await extractColorsFromBase64(imageDataUrl, 6)
    const colorTokens = assignColorRoles(extractedColors)
    colorTokens.forEach((token) => {
      token.evidence.refId = refId
    })
    const colorPalette = Object.fromEntries(
      colorTokens.map((token) => [token.value.role, token.value.hex])
    )

    const designFacets = await analyzeDesignFacets(imageDataUrl, colorPalette, {
      width: reference.width,
      height: reference.height,
    })

    const typographyValue = designFacets.typography
    const typographyToken = {
      id: nanoid(),
      facetType: 'typography' as const,
      role: 'typography.main',
      confidence: 0.75,
      evidence: { refId },
      value: typographyValue,
    }

    const layoutValue = designFacets.layout
    const layoutToken = {
      id: nanoid(),
      facetType: 'layout' as const,
      role: 'layout.main',
      confidence: 0.7,
      evidence: { refId },
      value: layoutValue,
    }

    const spacingToken: SpacingFacetToken = {
      id: nanoid(),
      facetType: 'spacing',
      role: 'spacing.main',
      confidence: 0.7,
      evidence: { refId },
      value: designFacets.spacing,
    }

    const componentStyleToken: ComponentStyleFacetToken = {
      id: nanoid(),
      facetType: 'componentStyle',
      role: 'componentStyle.main',
      confidence: 0.7,
      evidence: { refId },
      value: designFacets.componentStyle,
    }

    const facetPack: FacetPack = {
      id: nanoid(),
      refId,
      tokens: [
        ...colorTokens,
        typographyToken,
        layoutToken,
        spacingToken,
        componentStyleToken,
      ],
      summary: { moodKeywords: designFacets.moodKeywords },
      source: {
        filename: reference.filename,
        mime: reference.mime,
        width: reference.width,
        height: reference.height,
      },
      createdAt: Date.now(),
    }

    await saveFacetPack(facetPack)

    return reply.send({ success: true, facetPack } satisfies ExtractResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies ExtractResponse)
  }
})

app.post('/api/intents/create', async (request, reply) => {
  try {
    const { chosen, generationBrief } = request.body as {
      chosen?: IntentSpec['chosen']
      generationBrief?: IntentSpec['generationBrief']
    }

    if (!chosen) {
      return reply
        .status(400)
        .send({ success: false, error: 'No chosen facets provided' } satisfies CreateIntentResponse)
    }

    const { normalized, provenance, styleContext } = await buildIntentFromChosen(chosen)

    const intentSpec: IntentSpec = {
      id: nanoid(),
      chosen,
      normalized,
      provenance,
      conflicts: [],
      repairs: [],
      history: [],
      createdAt: Date.now(),
      targetExport: MVP_EXPORT_TARGET,
      generationBrief,
      styleContext,
    }

    await saveIntentSpec(intentSpec)

    return reply.send({
      success: true,
      intentSpec,
    } satisfies CreateIntentResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies CreateIntentResponse)
  }
})

app.post('/api/recipes/recommend', async (request, reply) => {
  try {
    const { refIds, facetPacks, limit } = (request.body || {}) as {
      refIds?: string[]
      facetPacks?: FacetPack[]
      limit?: number
    }

    const packs = await resolveRecommendationFacetPacks({ refIds, facetPacks })
    const recipes = recommendRecipes(packs, limit || RECIPE_RECOMMENDATION_LIMIT)

    return reply.send({
      success: true,
      recipes,
    } satisfies RecommendRecipesResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies RecommendRecipesResponse)
  }
})

app.post('/api/intents/evaluate', async (request, reply) => {
  try {
    const { intentSpecId, judgeMode = 'off' } =
      request.body as Partial<EvaluateRequest>

    if (!intentSpecId) {
      return reply
        .status(400)
        .send({ success: false, error: 'No intentSpecId provided' } satisfies EvaluateResponse)
    }

    if (judgeMode === 'primary') {
      return reply.status(400).send({
        success: false,
        error: 'Primary coherence judge mode is not enabled yet',
      } satisfies EvaluateResponse)
    }

    const intentSpec = await getIntentSpec(intentSpecId)
    if (!intentSpec) {
      return reply
        .status(404)
        .send({ success: false, error: 'IntentSpec not found' } satisfies EvaluateResponse)
    }

    const { conflicts, repairs, coherenceScore, coherence } = evaluateIntentSpec(intentSpec)
    intentSpec.conflicts = conflicts
    intentSpec.repairs = repairs
    intentSpec.coherenceScore = coherenceScore
    intentSpec.coherence = coherence
    await saveIntentSpec(intentSpec)

    const judgeResult =
      judgeMode === 'shadow'
        ? await runShadowCoherenceJudge(intentSpec, coherence, request.log)
        : undefined

    return reply.send({
      success: true,
      conflicts,
      repairs,
      coherenceScore,
      coherence,
      judgeResult,
    } satisfies EvaluateResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies EvaluateResponse)
  }
})

app.post('/api/intents/apply-repair', async (request, reply) => {
  try {
    const { intentSpecId, repairPlanId } = request.body as {
      intentSpecId?: string
      repairPlanId?: string
    }

    if (!intentSpecId || !repairPlanId) {
      return reply.status(400).send({
        success: false,
        error: 'Missing intentSpecId or repairPlanId',
      } satisfies ApplyRepairResponse)
    }

    const intentSpec = await getIntentSpec(intentSpecId)
    if (!intentSpec) {
      return reply
        .status(404)
        .send({ success: false, error: 'IntentSpec not found' } satisfies ApplyRepairResponse)
    }

    const repair = intentSpec.repairs.find((r) => r.id === repairPlanId)
    if (!repair) {
      return reply
        .status(404)
        .send({ success: false, error: 'Repair plan not found' } satisfies ApplyRepairResponse)
    }

    repair.changes.forEach((change) => {
      const keyParts = change.key.split('.')

      if (keyParts[0] === 'palette' && intentSpec.normalized.palette) {
        const role = keyParts[1] as keyof typeof intentSpec.normalized.palette
        if (role in intentSpec.normalized.palette) {
          intentSpec.normalized.palette[role] = change.to as string
        }
      } else if (
        keyParts[0] === 'typography' &&
        intentSpec.normalized.typography
      ) {
        if (keyParts.length === 3 && keyParts[1] === 'scale') {
          const scaleKey = keyParts[2] as keyof typeof intentSpec.normalized.typography.scale
          if (scaleKey in intentSpec.normalized.typography.scale) {
            intentSpec.normalized.typography.scale[scaleKey] = change.to as number
          }
        }
      } else if (keyParts[0] === 'spacing' && intentSpec.normalized.spacing) {
        if (keyParts[1] === 'baseUnit') {
          intentSpec.normalized.spacing.baseUnit = change.to as 4 | 8
        }
      }
    })

    intentSpec.history.push({
      ts: Date.now(),
      description: repair.title,
      patch: repair.changes.map((c) => ({
        key: c.key,
        from: c.from,
        to: c.to,
      })),
    })

    const evaluated = evaluateIntentSpec(intentSpec)
    intentSpec.conflicts = evaluated.conflicts
    intentSpec.repairs = evaluated.repairs
    intentSpec.coherenceScore = evaluated.coherenceScore
    intentSpec.coherence = evaluated.coherence

    await saveIntentSpec(intentSpec)

    return reply.send({ success: true, intentSpec } satisfies ApplyRepairResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies ApplyRepairResponse)
  }
})

app.post('/api/coherence/feedback', async (request, reply) => {
  try {
    const {
      intentSpecId,
      judgeResultId,
      rating,
      expectedScore,
      comment,
    } = request.body as Partial<SubmitCoherenceFeedbackRequest>

    if (!intentSpecId || !rating) {
      return reply.status(400).send({
        success: false,
        error: 'Missing intentSpecId or rating',
      } satisfies SubmitCoherenceFeedbackResponse)
    }

    if (!['accurate', 'tooHigh', 'tooLow', 'unclear'].includes(rating)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid coherence feedback rating',
      } satisfies SubmitCoherenceFeedbackResponse)
    }

    if (
      expectedScore !== undefined &&
      (expectedScore < 0 || expectedScore > 100)
    ) {
      return reply.status(400).send({
        success: false,
        error: 'expectedScore must be between 0 and 100',
      } satisfies SubmitCoherenceFeedbackResponse)
    }

    const intentSpec = await getIntentSpec(intentSpecId)
    if (!intentSpec) {
      return reply.status(404).send({
        success: false,
        error: 'IntentSpec not found',
      } satisfies SubmitCoherenceFeedbackResponse)
    }

    const feedback: CoherenceFeedback = {
      id: nanoid(),
      intentSpecId,
      judgeResultId,
      rating,
      expectedScore,
      comment: comment?.trim() || undefined,
      createdAt: Date.now(),
    }

    await saveCoherenceFeedback(feedback)

    return reply.send({
      success: true,
      feedback,
    } satisfies SubmitCoherenceFeedbackResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies SubmitCoherenceFeedbackResponse)
  }
})

app.post('/api/generate/v0', async (request, reply) => {
  try {
    const {
      intentSpecId,
      stepMode,
      chosen,
      generationBrief,
    } = request.body as Partial<GenerateRequest>

    if (!intentSpecId) {
      return reply
        .status(400)
        .send({ success: false, error: 'No intentSpecId provided' } satisfies GenerateResponse)
    }

    if (stepMode === 'staged') {
      return reply.status(400).send({
        success: false,
        error: 'Staged generation is not implemented yet',
      } satisfies GenerateResponse)
    }

    const intentSpec = await getIntentSpec(intentSpecId)
    if (!intentSpec) {
      return reply
        .status(404)
        .send({ success: false, error: 'IntentSpec not found' } satisfies GenerateResponse)
    }

    if (chosen) {
      const { normalized, provenance, styleContext } = await buildIntentFromChosen(chosen)
      intentSpec.chosen = chosen
      intentSpec.normalized = normalized
      intentSpec.provenance = provenance
      intentSpec.styleContext = styleContext
    }

    if (generationBrief) {
      intentSpec.generationBrief = generationBrief
    }

    const evaluated = evaluateIntentSpec(intentSpec)
    intentSpec.conflicts = evaluated.conflicts
    intentSpec.repairs = evaluated.repairs
    intentSpec.coherenceScore = evaluated.coherenceScore
    intentSpec.coherence = evaluated.coherence

    await saveIntentSpec(intentSpec)

    cleanupGenerationJobs()

    const generationJobId = nanoid()
    const job: GenerationJob = {
      id: generationJobId,
      status: 'pending',
      intentSpecId,
      intentSpec,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    generationJobs.set(generationJobId, job)

    void runGenerationJob({
      jobId: generationJobId,
      intentSpec,
      stepMode: stepMode || 'single',
      headers: { ...request.headers },
    }).catch((error) => {
      request.log.error(error)
    })

    return reply.status(202).send({
      success: true,
      generationJobId,
      generationStatus: job.status,
      intentSpec,
    } satisfies GenerateResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies GenerateResponse)
  }
})

app.get('/api/generate/jobs/:jobId', async (request, reply) => {
  const { jobId } = request.params as { jobId: string }
  const job = generationJobs.get(jobId)

  if (!job) {
    return reply.status(404).send({
      success: false,
      error: 'Generation job not found',
    } satisfies GenerateResponse)
  }

  return reply.status(job.status === 'failed' ? 500 : 200).send({
    success: job.status !== 'failed',
    generationJobId: job.id,
    generationStatus: job.status,
    generatedCode: job.generatedCode,
    intentSpec: job.intentSpec,
    error: job.error,
  } satisfies GenerateResponse)
})

async function runGenerationJob(input: {
  jobId: string
  intentSpec: IntentSpec
  stepMode: GenerateRequest['stepMode']
  headers: Record<string, string | string[] | undefined>
}) {
  const job = generationJobs.get(input.jobId)
  if (!job) return

  updateGenerationJob(input.jobId, { status: 'running' })

  try {
    const generated = await generateUICode(
      buildIntentExportPrompt(input.intentSpec, MVP_EXPORT_TARGET),
      input.stepMode
    )

    const generatedCodeId = nanoid()
    let previewUrl: string | undefined
    let screenshotError: string | undefined

    try {
      const previewPath = await writePreviewArtifact({
        id: generatedCodeId,
        code: generated.code,
        files: generated.files,
        entryFile: generated.entryFile,
      })
      previewUrl = toApiAssetUrl(previewPath, input.headers)
    } catch (error) {
      screenshotError =
        error instanceof Error ? `Preview unavailable: ${error.message}` : 'Preview unavailable'
    }

    const generatedCode: GeneratedCode = {
      id: generatedCodeId,
      intentSpecId: input.intentSpec.id,
      mode: input.stepMode,
      code: generated.code,
      files: generated.files,
      entryFile: generated.entryFile,
      previewUrl,
      screenshotError,
      createdAt: Date.now(),
    }

    await saveGeneratedCode(generatedCode)

    if (previewUrl) {
      void captureAndSaveScreenshot(generatedCode, previewUrl, input.headers).catch((error) => {
        app.log.error(error)
      })
    }

    updateGenerationJob(input.jobId, {
      status: 'succeeded',
      generatedCode,
      intentSpec: input.intentSpec,
    })
  } catch (error) {
    updateGenerationJob(input.jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

function updateGenerationJob(
  jobId: string,
  patch: Partial<Omit<GenerationJob, 'id' | 'createdAt'>>
) {
  const job = generationJobs.get(jobId)
  if (!job) return

  generationJobs.set(jobId, {
    ...job,
    ...patch,
    updatedAt: Date.now(),
  })
}

function cleanupGenerationJobs() {
  const now = Date.now()

  for (const [jobId, job] of generationJobs.entries()) {
    if (now - job.updatedAt > GENERATION_JOB_TTL_MS) {
      generationJobs.delete(jobId)
    }
  }
}

app.post('/api/preview/build', async (request, reply) => {
  try {
    const { id, code, files, entryFile } = request.body as {
      id?: string
      code?: string
      files?: GeneratedCode['files']
      entryFile?: string
    }

    if (!id || !code) {
      return reply.status(400).send({
        success: false,
        error: 'No generated code provided',
      } satisfies PreviewBuildResponse)
    }

    const previewUrl = await writePreviewArtifact({
      id,
      code,
      files,
      entryFile,
    })

    return reply.send({
      success: true,
      previewUrl: toApiAssetUrl(previewUrl, request.headers),
    } satisfies PreviewBuildResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies PreviewBuildResponse)
  }
})

app.post('/api/audit/analyze', async (request, reply) => {
  try {
    const { intentSpecId, generatedCodeId, code } = request.body as {
      intentSpecId?: string
      generatedCodeId?: string
      code?: string
    }

    if (!intentSpecId || !code) {
      return reply
        .status(400)
        .send({ success: false, error: 'Missing intentSpecId or code' } satisfies AuditResponse)
    }

    const intentSpec = await getIntentSpec(intentSpecId)
    if (!intentSpec) {
      return reply
        .status(404)
        .send({ success: false, error: 'IntentSpec not found' } satisfies AuditResponse)
    }

    const augmented = await auditGeneratedCodeWithOpenAI(code, intentSpec)
    const diffs = calculateDiffs(intentSpec.normalized, augmented)
    const provenanceBadges = await generateProvenanceBadges(intentSpec)

    const report: AuditReport = {
      id: nanoid(),
      intentSpecId,
      generatedCodeId: generatedCodeId || '',
      augmented,
      diffs,
      provenanceBadges,
      createdAt: Date.now(),
    }

    await saveAuditReport(report)

    return reply.send({ success: true, report } satisfies AuditResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies AuditResponse)
  }
})

async function start() {
  try {
    if (shouldClearRuntimeOnStart) {
      await clearRuntimeStorage()
    }

    await app.listen({ port: config.api.port, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== 'test') {
  void start()
}

async function ensureUploadDir() {
  await fs.mkdir(config.upload.dir, { recursive: true })
}

async function readStoredImageMetadata(filePath: string): Promise<{
  width?: number
  height?: number
}> {
  try {
    const metadata = await sharp(filePath).metadata()
    return {
      width: metadata.width,
      height: metadata.height,
    }
  } catch {
    return {}
  }
}

async function clearRuntimeStorage() {
  await clearRuntimeData()
  await fs.rm(config.upload.dir, { recursive: true, force: true })
  await ensureUploadDir()
}

async function deleteStoredReferenceFile(reference: ReferenceAsset) {
  const relativePath =
    reference.storagePath ||
    (reference.url?.startsWith('/uploads/')
      ? `public${reference.url}`
      : undefined)

  if (!relativePath || !relativePath.startsWith('public/uploads/')) {
    return
  }

  try {
    await fs.unlink(path.join(process.cwd(), relativePath))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

async function getReferenceImageDataUrl(
  reference: ReferenceAsset
): Promise<string | null> {
  if (reference.dataUrl) {
    return reference.dataUrl
  }

  const relativePath =
    reference.storagePath ||
    (reference.url?.startsWith('/uploads/')
      ? `public${reference.url}`
      : undefined)

  if (!relativePath || !relativePath.startsWith('public/uploads/')) {
    return null
  }

  const buffer = await fs.readFile(path.join(process.cwd(), relativePath))
  return `data:${reference.mime};base64,${buffer.toString('base64')}`
}

async function captureAndSaveScreenshot(
  generatedCode: GeneratedCode,
  previewUrl: string,
  headers: Record<string, string | string[] | undefined>
) {
  const screenshot = await capturePreviewScreenshot({
    id: generatedCode.id,
    previewUrl,
    webOrigin: getApiOrigin(headers) || config.api.webOrigin,
  })

  await saveGeneratedCode({
    ...generatedCode,
    screenshotUrl: screenshot.screenshotUrl
      ? toApiAssetUrl(screenshot.screenshotUrl, headers)
      : undefined,
    screenshotError: screenshot.error,
  })
}

function toApiAssetUrl(
  assetPath: string,
  headers: Record<string, string | string[] | undefined>
): string {
  if (/^(https?:|data:|blob:)/.test(assetPath)) {
    return assetPath
  }

  const origin = getApiOrigin(headers)
  return origin ? `${origin}${assetPath}` : assetPath
}

function getApiOrigin(
  headers: Record<string, string | string[] | undefined>
): string | null {
  const host = getHeader(headers, 'x-forwarded-host') || getHeader(headers, 'host')

  if (!host) {
    return null
  }

  const proto = getHeader(headers, 'x-forwarded-proto') || 'http'
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name]
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

async function buildIntentFromChosen(chosen: IntentSpec['chosen']): Promise<{
  normalized: IntentSpec['normalized']
  provenance: IntentSpec['provenance']
  styleContext: StyleContext
}> {
  const packs = await getFacetPacks()
  return buildIntentFromChosenWithPacks(chosen, packs)
}

function buildIntentFromChosenWithPacks(
  chosen: IntentSpec['chosen'],
  packs: FacetPack[]
): {
  normalized: IntentSpec['normalized']
  provenance: IntentSpec['provenance']
  styleContext: StyleContext
} {
  const normalized: IntentSpec['normalized'] = {}
  const provenance: IntentSpec['provenance'] = {}

  if (chosen.colorRefId) {
    const pack = packs.find((facetPack) => facetPack.refId === chosen.colorRefId)
    if (pack) {
      const colorTokens = pack.tokens.filter((t) => t.facetType === 'color')
      const palette: Record<ColorRole, string> = {} as Record<ColorRole, string>
      colorTokens.forEach((t) => {
        if (t.facetType === 'color') {
          palette[t.value.role] = t.value.hex
          provenance[`palette.${t.value.role}`] = { refId: chosen.colorRefId! }
        }
      })
      normalized.palette = palette
    }
  }

  if (chosen.typographyRefId) {
    const pack = packs.find((facetPack) => facetPack.refId === chosen.typographyRefId)
    const typoToken = pack?.tokens.find((t) => t.facetType === 'typography')
    if (typoToken?.facetType === 'typography') {
      normalized.typography = typoToken.value
      provenance.typography = { refId: chosen.typographyRefId }
    }
  }

  if (chosen.layoutRefId) {
    const pack = packs.find((facetPack) => facetPack.refId === chosen.layoutRefId)
    const layoutToken = pack?.tokens.find((t) => t.facetType === 'layout')
    if (layoutToken?.facetType === 'layout') {
      normalized.layout = layoutToken.value
      provenance.layout = { refId: chosen.layoutRefId }
    }
  }

  if (chosen.spacingRefId) {
    const pack = packs.find((facetPack) => facetPack.refId === chosen.spacingRefId)
    const spacingToken = pack?.tokens.find((t) => t.facetType === 'spacing')
    if (spacingToken?.facetType === 'spacing') {
      normalized.spacing = spacingToken.value
      provenance.spacing = { refId: chosen.spacingRefId }
    }
  }

  if (chosen.componentStyleRefId) {
    const pack = packs.find((facetPack) => facetPack.refId === chosen.componentStyleRefId)
    const styleToken = pack?.tokens.find((t) => t.facetType === 'componentStyle')
    if (styleToken?.facetType === 'componentStyle') {
      normalized.componentStyle = styleToken.value
      provenance.componentStyle = { refId: chosen.componentStyleRefId }
    }
  }

  return { normalized, provenance, styleContext: buildStyleContext(chosen, packs) }
}

function buildStyleContext(
  chosen: IntentSpec['chosen'],
  packs: FacetPack[]
): StyleContext {
  const sources = new Map<string, StyleContext['sources'][number]>()

  recipeFacetFields.forEach((field) => {
    const refId = chosen[field.key]
    if (!refId) return

    const pack = packs.find((facetPack) => facetPack.refId === refId)
    if (!pack) return

    const source = sources.get(refId) || {
      refId,
      facetTypes: [],
      moodKeywords: pack.summary.moodKeywords || [],
      averageConfidence: 0,
      width: pack.source?.width,
      height: pack.source?.height,
    }
    const facetType = field.facetType as FacetType

    if (!source.facetTypes.includes(facetType)) {
      source.facetTypes.push(facetType)
    }

    const confidences = pack.tokens
      .filter((token) => token.facetType === field.facetType)
      .map((token) => token.confidence)
    const confidence =
      confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : 0
    source.averageConfidence = Math.max(source.averageConfidence, confidence)

    sources.set(refId, source)
  })

  const sourceList = [...sources.values()]
  return {
    moodKeywords: uniqueStrings(
      sourceList.flatMap((source) => source.moodKeywords)
    ).slice(0, 8),
    sources: sourceList.map((source) => ({
      ...source,
      moodKeywords: uniqueStrings(source.moodKeywords).slice(0, 6),
      averageConfidence: roundToTwoDecimals(source.averageConfidence),
    })),
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

async function resolveRecommendationFacetPacks(input: {
  refIds?: string[]
  facetPacks?: FacetPack[]
}): Promise<FacetPack[]> {
  const sourcePacks =
    input.facetPacks && input.facetPacks.length > 0
      ? input.facetPacks
      : await getFacetPacks()
  const requestedRefIds = new Set((input.refIds || []).filter(Boolean))
  const seen = new Set<string>()

  return sourcePacks.filter((pack) => {
    if (requestedRefIds.size > 0 && !requestedRefIds.has(pack.refId)) {
      return false
    }
    if (seen.has(pack.refId)) {
      return false
    }

    seen.add(pack.refId)
    return true
  })
}

function recommendRecipes(packs: FacetPack[], limit: number): Recipe[] {
  const candidatesByFacet = getRecipeCandidateRefs(packs)
  const chosenCandidates = generateRecipeChosenCandidates(candidatesByFacet)
  const resultLimit = Math.max(1, Math.min(limit, RECIPE_RECOMMENDATION_LIMIT))

  return chosenCandidates
    .map((chosen, index) => {
      const { normalized, provenance, styleContext } = buildIntentFromChosenWithPacks(chosen, packs)
      const evaluated = evaluateIntentSpec({
        id: `recipe-candidate-${index}`,
        chosen,
        normalized,
        provenance,
        conflicts: [],
        repairs: [],
        history: [],
        createdAt: Date.now(),
        targetExport: MVP_EXPORT_TARGET,
        styleContext,
      })

      return {
        chosen,
        score: evaluated.coherenceScore,
        sourceCount: countChosenSources(chosen),
        order: index,
      }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.sourceCount !== b.sourceCount) return a.sourceCount - b.sourceCount
      return a.order - b.order
    })
    .slice(0, resultLimit)
    .map((candidate, index) => ({
      id: `recipe-${index + 1}`,
      name:
        candidate.sourceCount === 1
          ? index === 0
            ? 'Unified Style'
            : `Unified Style ${index + 1}`
          : `Coherence Mix ${index + 1}`,
      chosen: candidate.chosen,
      coherenceScore: candidate.score,
      description: describeRecommendedRecipe(candidate.chosen),
    }))
}

async function runShadowCoherenceJudge(
  intentSpec: IntentSpec,
  baseline: CoherenceEvaluation,
  log: FastifyBaseLogger
): Promise<CoherenceJudgeResult | undefined> {
  try {
    const judged = await judgeIntentCoherenceWithOpenAI(intentSpec, baseline)
    const result: CoherenceJudgeResult = {
      id: nanoid(),
      intentSpecId: intentSpec.id,
      mode: 'shadow',
      createdAt: Date.now(),
      ...judged,
    }
    await saveCoherenceJudgeResult(result)
    return result
  } catch (error) {
    log.warn(
      {
        err: error,
        intentSpecId: intentSpec.id,
      },
      'Shadow coherence judge failed'
    )
    return undefined
  }
}

function getRecipeCandidateRefs(
  packs: FacetPack[]
): Record<(typeof recipeFacetFields)[number]['key'], string[]> {
  return recipeFacetFields.reduce(
    (acc, field) => {
      acc[field.key] = packs
        .filter((pack) =>
          pack.tokens.some((token) => token.facetType === field.facetType)
        )
        .map((pack) => pack.refId)
      return acc
    },
    {} as Record<(typeof recipeFacetFields)[number]['key'], string[]>
  )
}

function generateRecipeChosenCandidates(
  candidatesByFacet: Record<(typeof recipeFacetFields)[number]['key'], string[]>
): IntentSpec['chosen'][] {
  const activeFields = recipeFacetFields.filter(
    (field) => candidatesByFacet[field.key].length > 0
  )

  if (activeFields.length === 0) {
    return []
  }

  const totalCombinations = activeFields.reduce(
    (total, field) => total * candidatesByFacet[field.key].length,
    1
  )

  if (totalCombinations <= MAX_RECIPE_CANDIDATES) {
    return generateAllRecipeChosenCandidates(activeFields, candidatesByFacet)
  }

  return generateLimitedRecipeChosenCandidates(activeFields, candidatesByFacet)
}

function generateAllRecipeChosenCandidates(
  activeFields: typeof recipeFacetFields[number][],
  candidatesByFacet: Record<(typeof recipeFacetFields)[number]['key'], string[]>
): IntentSpec['chosen'][] {
  const candidates: IntentSpec['chosen'][] = []

  const visit = (fieldIndex: number, chosen: IntentSpec['chosen']) => {
    if (fieldIndex === activeFields.length) {
      candidates.push({ ...chosen })
      return
    }

    const field = activeFields[fieldIndex]
    candidatesByFacet[field.key].forEach((refId) => {
      visit(fieldIndex + 1, { ...chosen, [field.key]: refId })
    })
  }

  visit(0, {})
  return candidates
}

function generateLimitedRecipeChosenCandidates(
  activeFields: typeof recipeFacetFields[number][],
  candidatesByFacet: Record<(typeof recipeFacetFields)[number]['key'], string[]>
): IntentSpec['chosen'][] {
  const candidates: IntentSpec['chosen'][] = []
  const seen = new Set<string>()
  const refOrder = Array.from(
    new Set(activeFields.flatMap((field) => candidatesByFacet[field.key]))
  )

  const push = (chosen: IntentSpec['chosen']) => {
    if (candidates.length >= MAX_RECIPE_CANDIDATES) return

    const key = JSON.stringify(
      recipeFacetFields.map((field) => [field.key, chosen[field.key] || null])
    )
    if (!seen.has(key)) {
      seen.add(key)
      candidates.push(chosen)
    }
  }

  refOrder.forEach((refId) => {
    push(buildPreferredRecipeChosen(activeFields, candidatesByFacet, refId))
  })

  const base = buildPreferredRecipeChosen(
    activeFields,
    candidatesByFacet,
    refOrder[0]
  )
  push(base)

  activeFields.forEach((field) => {
    candidatesByFacet[field.key].forEach((refId) => {
      push({ ...base, [field.key]: refId })
    })
  })

  return candidates
}

function buildPreferredRecipeChosen(
  activeFields: typeof recipeFacetFields[number][],
  candidatesByFacet: Record<(typeof recipeFacetFields)[number]['key'], string[]>,
  preferredRefId: string | undefined
): IntentSpec['chosen'] {
  return activeFields.reduce<IntentSpec['chosen']>((chosen, field) => {
    const refs = candidatesByFacet[field.key]
    return {
      ...chosen,
      [field.key]:
        preferredRefId && refs.includes(preferredRefId)
          ? preferredRefId
          : refs[0],
    }
  }, {})
}

function countChosenSources(chosen: IntentSpec['chosen']): number {
  return new Set(Object.values(chosen).filter(Boolean)).size
}

function describeRecommendedRecipe(chosen: IntentSpec['chosen']): string {
  const sourceCount = countChosenSources(chosen)
  const facetCount = Object.values(chosen).filter(Boolean).length
  const sourceLabel = sourceCount === 1 ? 'source' : 'sources'
  const facetLabel = facetCount === 1 ? 'facet' : 'facets'

  return `${facetCount} ${facetLabel} from ${sourceCount} reference ${sourceLabel}, ranked by coherence`
}

function calculateDiffs(
  normalized: IntentSpec['normalized'],
  augmented: AuditReport['augmented']
): FacetDiff[] {
  const diffs: FacetDiff[] = []

  if (normalized.palette && augmented.palette) {
    Object.keys(normalized.palette).forEach((role) => {
      const expected = normalized.palette?.[role as ColorRole]
      const actual = augmented.palette?.[role]

      diffs.push({
        key: `palette.${role}`,
        expected,
        actual: actual || null,
        match: expected === actual ? 'exact' : actual ? 'different' : 'missing',
      })
    })
  }

  if (normalized.typography?.scale && augmented.typography?.scale) {
    Object.keys(normalized.typography.scale).forEach((key) => {
      const scaleKey = key as keyof typeof normalized.typography.scale
      const expected = normalized.typography!.scale[scaleKey]
      const actual = augmented.typography?.scale?.[scaleKey]
      const deviation = actual ? Math.abs((actual - expected) / expected) * 100 : 100

      diffs.push({
        key: `typography.scale.${key}`,
        expected,
        actual: actual || null,
        match:
          deviation === 0
            ? 'exact'
            : deviation < 10
              ? 'similar'
              : actual
                ? 'different'
                : 'missing',
      })
    })
  }

  if (normalized.spacing?.baseUnit && augmented.spacing?.baseUnit) {
    diffs.push({
      key: 'spacing.baseUnit',
      expected: normalized.spacing.baseUnit,
      actual: augmented.spacing.baseUnit,
      match:
        normalized.spacing.baseUnit === augmented.spacing.baseUnit
          ? 'exact'
          : 'different',
    })
  }

  if (normalized.componentStyle && augmented.componentStyle) {
    ;(['radius', 'shadow', 'border'] as const).forEach((prop) => {
      const expected = normalized.componentStyle?.[prop]
      const actual = augmented.componentStyle?.[prop]

      diffs.push({
        key: `componentStyle.${prop}`,
        expected,
        actual: actual || null,
        match: expected === actual ? 'exact' : actual ? 'different' : 'missing',
      })
    })
  }

  return diffs
}

async function generateProvenanceBadges(
  intentSpec: IntentSpec
): Promise<ProvenanceBadge[]> {
  const badges: ProvenanceBadge[] = []

  for (const [key, evidence] of Object.entries(intentSpec.provenance)) {
    const ref = await getReference(evidence.refId)

    if (ref) {
      badges.push({
        facetKey: key,
        sourceRefId: evidence.refId,
        sourceRefName: ref.filename,
        transformation: evidence.note,
      })
    }
  }

  intentSpec.history?.forEach((change) => {
    change.patch?.forEach((patch) => {
      const provenanceKey = patch.key.startsWith('palette.')
        ? patch.key
        : patch.key.split('.')[0]

      badges.push({
        facetKey: patch.key,
        sourceRefId: intentSpec.provenance[provenanceKey]?.refId || 'unknown',
        sourceRefName: 'Auto-repaired',
        transformation: change.description,
      })
    })
  })

  return badges
}
