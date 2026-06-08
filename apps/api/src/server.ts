import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { nanoid } from 'nanoid'
import { createWriteStream } from 'fs'
import { promises as fs } from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { config } from './config'
import {
  getReference,
  getReferences,
  saveReference,
  deleteReference,
  saveFacetPack,
  getFacetPackByRefId,
  saveIntentSpec,
  getIntentSpec,
  saveGeneratedCode,
  saveAuditReport,
} from './db'
import {
  extractColorsFromBase64,
  assignColorRoles,
  calculateContrastRatio,
  adjustForContrast,
} from './color-extractor'
import { generateUICode } from './v0-client'
import {
  analyzeDesignFacets,
  auditGeneratedCodeWithOpenAI,
} from './openai-client'
import { buildIntentExportPrompt } from './prompts/intent-export'
import type {
  AuditReport,
  AuditResponse,
  ApplyRepairResponse,
  ColorRole,
  ComponentStyleFacetToken,
  ConflictCard,
  CreateIntentResponse,
  EvaluateResponse,
  ExtractResponse,
  FacetDiff,
  FacetPack,
  GenerateResponse,
  GeneratedCode,
  IntentSpec,
  ProvenanceBadge,
  ReferenceAsset,
  RepairPlan,
  SpacingFacetToken,
  UploadResponse,
} from '@style-print-jung/shared'

const MVP_EXPORT_TARGET: IntentSpec['targetExport'] = {
  format: 'react-tailwind',
  label: 'React + Tailwind',
  description: 'MVP export target; the IntentSpec remains framework-neutral.',
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'error' },
})

app.register(multipart, {
  limits: {
    fileSize: config.upload.maxFileSize,
  },
})

app.addHook('onRequest', async (_request, reply) => {
  reply.header('Access-Control-Allow-Origin', config.api.webOrigin)
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

      const reference: ReferenceAsset = {
        id,
        filename,
        mime,
        width: 0,
        height: 0,
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

    const designFacets = await analyzeDesignFacets(imageDataUrl, colorPalette)

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
    const { chosen } = request.body as { chosen?: IntentSpec['chosen'] }

    if (!chosen) {
      return reply
        .status(400)
        .send({ success: false, error: 'No chosen facets provided' } satisfies CreateIntentResponse)
    }

    const normalized: IntentSpec['normalized'] = {}
    const provenance: IntentSpec['provenance'] = {}

    if (chosen.colorRefId) {
      const pack = await getFacetPackByRefId(chosen.colorRefId)
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
      const pack = await getFacetPackByRefId(chosen.typographyRefId)
      const typoToken = pack?.tokens.find((t) => t.facetType === 'typography')
      if (typoToken?.facetType === 'typography') {
        normalized.typography = typoToken.value
        provenance.typography = { refId: chosen.typographyRefId }
      }
    }

    if (chosen.layoutRefId) {
      const pack = await getFacetPackByRefId(chosen.layoutRefId)
      const layoutToken = pack?.tokens.find((t) => t.facetType === 'layout')
      if (layoutToken?.facetType === 'layout') {
        normalized.layout = layoutToken.value
        provenance.layout = { refId: chosen.layoutRefId }
      }
    }

    if (chosen.spacingRefId) {
      const pack = await getFacetPackByRefId(chosen.spacingRefId)
      const spacingToken = pack?.tokens.find((t) => t.facetType === 'spacing')
      if (spacingToken?.facetType === 'spacing') {
        normalized.spacing = spacingToken.value
        provenance.spacing = { refId: chosen.spacingRefId }
      }
    }

    if (chosen.componentStyleRefId) {
      const pack = await getFacetPackByRefId(chosen.componentStyleRefId)
      const styleToken = pack?.tokens.find((t) => t.facetType === 'componentStyle')
      if (styleToken?.facetType === 'componentStyle') {
        normalized.componentStyle = styleToken.value
        provenance.componentStyle = { refId: chosen.componentStyleRefId }
      }
    }

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

app.post('/api/intents/evaluate', async (request, reply) => {
  try {
    const { intentSpecId } = request.body as { intentSpecId?: string }

    if (!intentSpecId) {
      return reply
        .status(400)
        .send({ success: false, error: 'No intentSpecId provided' } satisfies EvaluateResponse)
    }

    const intentSpec = await getIntentSpec(intentSpecId)
    if (!intentSpec) {
      return reply
        .status(404)
        .send({ success: false, error: 'IntentSpec not found' } satisfies EvaluateResponse)
    }

    const { conflicts, repairs, coherenceScore } = evaluateIntentSpec(intentSpec)
    intentSpec.conflicts = conflicts
    intentSpec.repairs = repairs
    intentSpec.coherenceScore = coherenceScore
    await saveIntentSpec(intentSpec)

    return reply.send({
      success: true,
      conflicts,
      repairs,
      coherenceScore,
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

app.post('/api/generate/v0', async (request, reply) => {
  try {
    const { intentSpecId, stepMode } = request.body as {
      intentSpecId?: string
      stepMode?: GeneratedCode['mode']
    }

    if (!intentSpecId) {
      return reply
        .status(400)
        .send({ success: false, error: 'No intentSpecId provided' } satisfies GenerateResponse)
    }

    const intentSpec = await getIntentSpec(intentSpecId)
    if (!intentSpec) {
      return reply
        .status(404)
        .send({ success: false, error: 'IntentSpec not found' } satisfies GenerateResponse)
    }

    const code = await generateUICode(
      buildIntentExportPrompt(intentSpec, MVP_EXPORT_TARGET),
      stepMode || 'single'
    )

    const generatedCode: GeneratedCode = {
      id: nanoid(),
      intentSpecId,
      mode: stepMode || 'single',
      code,
      createdAt: Date.now(),
    }

    await saveGeneratedCode(generatedCode)

    return reply.send({ success: true, generatedCode } satisfies GenerateResponse)
  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies GenerateResponse)
  }
})

app.post('/api/audit/analyze', async (request, reply) => {
  try {
    const { intentSpecId, code } = request.body as {
      intentSpecId?: string
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
      generatedCodeId: '',
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
    await app.listen({ port: config.api.port, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void start()

async function ensureUploadDir() {
  await fs.mkdir(config.upload.dir, { recursive: true })
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

function evaluateIntentSpec(intentSpec: IntentSpec): {
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
