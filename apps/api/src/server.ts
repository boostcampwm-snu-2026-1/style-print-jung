import Fastify from 'fastify'
import { nanoid } from 'nanoid'
import { promises as fs } from 'fs'
import path from 'path'
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

const app = Fastify({ logger: true })

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
  try {
    const { files } = request.body as { files: string[] }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return reply
        .status(400)
        .send({ success: false, references: [], error: 'No files provided' } satisfies UploadResponse)
    }

    const references: ReferenceAsset[] = []
    await ensureUploadDir()

    for (let i = 0; i < files.length; i++) {
      const dataUrl = files[i]
      const validation = validateBase64Image(dataUrl)

      if (!validation.valid) {
        return reply.status(400).send({
          success: false,
          references: [],
          error: `File ${i + 1}: ${validation.error}`,
        } satisfies UploadResponse)
      }

      const id = nanoid()
      const extension = config.upload.mimeExtensions[validation.mime!]
      const filename = `reference-${Date.now()}-${i}-${id}.${extension}`
      const storagePath = `public/uploads/${filename}`
      const url = `/uploads/${filename}`

      await fs.writeFile(path.join(config.upload.dir, filename), validation.buffer!)

      const reference: ReferenceAsset = {
        id,
        filename,
        mime: validation.mime!,
        width: 0,
        height: 0,
        url,
        storagePath,
        createdAt: Date.now(),
      }

      await saveReference(reference)
      references.push(reference)
    }

    return reply.send({ success: true, references } satisfies UploadResponse)
  } catch (error) {
    request.log.error(error)
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
    }

    await saveIntentSpec(intentSpec)

    return reply.send({ success: true, intentSpec } satisfies CreateIntentResponse)
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
      buildGenerationPrompt(intentSpec),
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

function validateBase64Image(dataUrl: string): {
  valid: boolean
  mime?: string
  buffer?: Buffer
  error?: string
} {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/i)
  if (!match) {
    return { valid: false, error: 'Invalid data URL format' }
  }

  const mime = match[1].toLowerCase()
  const data = match[2]

  if (!config.upload.allowedMimes.includes(mime)) {
    return {
      valid: false,
      error: `Unsupported image type: ${mime}. Allowed: ${config.upload.allowedMimes.join(', ')}`,
    }
  }

  const sizeBytes = (data.length * 3) / 4
  if (sizeBytes > config.upload.maxFileSize) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${config.upload.maxFileSize / 1024 / 1024}MB`,
    }
  }

  try {
    return { valid: true, mime, buffer: Buffer.from(data, 'base64') }
  } catch {
    return { valid: false, error: 'Invalid base64 image data' }
  }
}

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

function buildGenerationPrompt(intentSpec: IntentSpec): string {
  const { normalized } = intentSpec
  let prompt = 'Create a modern, responsive React component using Tailwind CSS with the following design specifications:\n\n'

  if (normalized.palette) {
    prompt += '## Color Palette\nUse these exact colors:\n'
    Object.entries(normalized.palette).forEach(([role, hex]) => {
      prompt += `- ${role}: ${hex}\n`
    })
    prompt += '\n'
  }

  if (normalized.typography) {
    const typo = normalized.typography
    prompt += '## Typography\n'
    if (typo.fontCandidates?.[0]) {
      prompt += `- Font Family: ${typo.fontCandidates[0].name}\n`
    }
    prompt += `- Heading 1: ${typo.scale.h1}px\n`
    prompt += `- Heading 2: ${typo.scale.h2}px\n`
    prompt += `- Body: ${typo.scale.body}px\n`
    prompt += `- Caption: ${typo.scale.caption}px\n`
    prompt += `- Line Height (body): ${typo.lineHeight.body}\n\n`
  }

  if (normalized.layout) {
    prompt += '## Layout\n'
    prompt += `- Pattern: ${normalized.layout.pattern}\n`
    if (normalized.layout.columns) {
      prompt += `- Columns: ${normalized.layout.columns}\n`
    }
    prompt += `- Density: ${normalized.layout.density}\n\n`
  }

  if (normalized.spacing) {
    prompt += '## Spacing\n'
    prompt += `- Base unit: ${normalized.spacing.baseUnit}px\n`
    prompt += `- Scale: ${normalized.spacing.scale.join(', ')}px\n\n`
  }

  if (normalized.componentStyle) {
    prompt += '## Component Style\n'
    prompt += `- Border Radius: ${normalized.componentStyle.radius}\n`
    prompt += `- Shadow: ${normalized.componentStyle.shadow}\n`
    prompt += `- Border: ${normalized.componentStyle.border}\n\n`
  }

  prompt += '## Requirements\n'
  prompt += '1. Create a complete, functional React component\n'
  prompt += '2. Use Tailwind CSS classes for all styling\n'
  prompt += '3. Ensure all color combinations meet WCAG AA contrast requirements (4.5:1 minimum)\n'
  prompt += '4. Make it responsive (mobile-first approach)\n'
  prompt += '5. Include proper semantic HTML\n'
  prompt += '6. Export as default function component\n'
  prompt += '7. Component should be production-ready\n\n'
  prompt += 'Generate the complete React component code now.'

  return prompt
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
