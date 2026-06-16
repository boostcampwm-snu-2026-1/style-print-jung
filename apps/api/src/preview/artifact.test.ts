import { promises as fs } from 'fs'
import path from 'path'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { config } from '../config'
import { getIntentSpecs } from '../db'
import { evaluateIntentSpec } from '../intent-evaluator'
import {
  COHERENCE_JUDGE_PROMPT_VERSION,
  buildCoherenceJudgePrompt,
} from '../prompts/coherence-judge'
import { app } from '../server'
import {
  readPreviewArtifactFile,
  writePreviewArtifact,
} from './artifact'
import {
  publicPreviewRoot,
  sanitizePreviewId,
  sourcePreviewRoot,
} from './paths'
import type {
  ColorRole,
  FacetPack,
  IntentSpec,
  RecommendRecipesResponse,
} from '@style-print-jung/shared'

const previewIds = new Set<string>()

afterEach(async () => {
  await Promise.all([...previewIds].map(cleanupPreview))
  previewIds.clear()
})

afterAll(async () => {
  await app.close()
})

describe('preview artifact', () => {
  test('writes preview html and bundle files', async () => {
    const id = trackPreviewId('artifact-test-preview')

    const previewUrl = await writePreviewArtifact({
      id,
      code: 'export default function GeneratedComponent() { return <main>Hello preview</main> }',
    })

    const publicDir = path.join(publicPreviewRoot, sanitizePreviewId(id))
    const html = await fs.readFile(path.join(publicDir, 'index.html'), 'utf8')
    const js = await fs.readFile(path.join(publicDir, 'preview.js'), 'utf8')

    expect(previewUrl).toMatch(
      /^\/generated-previews\/artifact-test-preview\/index\.html\?t=\d+$/
    )
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('./preview.js?t=')
    expect(js).toContain('Hello preview')
  })

  test('reads only allowed preview files', async () => {
    const id = trackPreviewId('artifact-read-preview')

    await writePreviewArtifact({
      id,
      code: 'export default function GeneratedComponent() { return <main>Read preview</main> }',
    })

    const html = await readPreviewArtifactFile(id, 'index.html')
    const js = await readPreviewArtifactFile(id, 'preview.js')
    const unknown = await readPreviewArtifactFile(id, 'main.tsx')
    const traversal = await readPreviewArtifactFile(id, '../index.html')

    expect(html?.contentType).toBe('text/html; charset=utf-8')
    expect(js?.contentType).toBe('text/javascript; charset=utf-8')
    expect(unknown).toBeNull()
    expect(traversal).toBeNull()
  })
})

describe('/api/preview/build', () => {
  test('returns 400 when generated code is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/preview/build',
      payload: { id: 'missing-code' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      success: false,
      error: 'No generated code provided',
    })
  })

  test('returns a previewUrl for valid generated code', async () => {
    const id = trackPreviewId('route-preview-build')

    const response = await app.inject({
      method: 'POST',
      url: '/api/preview/build',
      payload: {
        id,
        code: 'export default function GeneratedComponent() { return <main>Route preview</main> }',
      },
    })

    const body = response.json() as {
      success: boolean
      previewUrl?: string
    }

    expect(response.statusCode).toBe(200)
    expect(body.success).toBe(true)
    expect(body.previewUrl).toMatch(
      /^http:\/\/localhost:\d+\/generated-previews\/route-preview-build\/index\.html\?t=\d+$/
    )
  })
})

describe('CORS headers', () => {
  test('uses the configured frontend origin by default', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.headers['access-control-allow-origin']).toBe(
      config.api.webOrigin
    )
    expect(response.headers.vary).toBe('Origin')
  })

  test('echoes an allowed request origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: config.api.webOrigin,
      },
    })

    expect(response.headers['access-control-allow-origin']).toBe(
      config.api.webOrigin
    )
  })
})

describe('intent evaluator', () => {
  test('keeps contrast conflict scoring available outside the route', () => {
    const evaluated = evaluateIntentSpec({
      id: 'intent-evaluator-test',
      chosen: {},
      normalized: {
        palette: {
          text: '#eeeeee',
          background: '#ffffff',
          primary: '#005fcc',
        } as Record<ColorRole, string>,
      },
      provenance: {},
      conflicts: [],
      repairs: [],
      history: [],
      createdAt: 1,
      targetExport: {
        format: 'react-tailwind',
        label: 'React + Tailwind',
        description: 'Test export target',
      },
    } satisfies IntentSpec)

    expect(evaluated.coherenceScore).toBeLessThan(100)
    expect(evaluated.coherence.score).toBe(evaluated.coherenceScore)
    expect(evaluated.coherence.dimensions.accessibility).toBeLessThan(100)
    expect(evaluated.conflicts[0]?.type).toBe('contrast')
    expect(evaluated.repairs[0]?.changes[0]?.key).toBe('palette.text')
  })

  test('reports coverage gaps separately from legacy conflict cards', () => {
    const evaluated = evaluateIntentSpec({
      id: 'intent-coverage-test',
      chosen: {},
      normalized: {
        palette: {
          text: '#111111',
          background: '#ffffff',
          primary: '#005fcc',
        } as Record<ColorRole, string>,
      },
      provenance: {},
      conflicts: [],
      repairs: [],
      history: [],
      createdAt: 1,
      targetExport: {
        format: 'react-tailwind',
        label: 'React + Tailwind',
        description: 'Test export target',
      },
      generationBrief: {
        prompt: '',
        screens: [],
        variantCount: 1,
      },
    } satisfies IntentSpec)

    expect(evaluated.conflicts).toEqual([])
    expect(evaluated.coherence.dimensions.intentCoverage).toBeLessThan(100)
    expect(evaluated.coherence.dimensions.provenanceCoverage).toBeLessThan(100)
    expect(evaluated.coherence.dimensions.generationReadiness).toBeLessThan(100)
  })
})

describe('coherence judge prompt', () => {
  test('pins a prompt version and includes the baseline evaluation', () => {
    const intentSpec = {
      id: 'judge-prompt-test',
      chosen: {},
      normalized: {},
      provenance: {},
      conflicts: [],
      repairs: [],
      history: [],
      createdAt: 1,
      targetExport: {
        format: 'react-tailwind',
        label: 'React + Tailwind',
        description: 'Test export target',
      },
    } satisfies IntentSpec
    const baseline = evaluateIntentSpec(intentSpec).coherence
    const prompt = buildCoherenceJudgePrompt({ intentSpec, baseline })

    expect(COHERENCE_JUDGE_PROMPT_VERSION.id).toBe('coherence-judge-v2')
    expect(COHERENCE_JUDGE_PROMPT_VERSION.rubricHash).toHaveLength(12)
    expect(prompt).toContain('Rule findings')
    expect(prompt).not.toContain('Rule-based baseline')
    expect(prompt).toContain('Binary checklist')
    expect(prompt).toContain('judge-prompt-test')
  })
})

describe('/api/coherence/feedback', () => {
  test('rejects incomplete feedback payloads', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/coherence/feedback',
      payload: {
        intentSpecId: 'missing-rating',
      },
    })

    expect(response.statusCode).toBe(400)
  })
})

describe('/api/generate/v0', () => {
  test('rejects staged generation until the mode is implemented', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate/v0',
      payload: {
        intentSpecId: 'any-intent',
        stepMode: 'staged',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      success: false,
      error: 'Staged generation is not implemented yet',
    })
  })
})

describe('/api/recipes/recommend', () => {
  test('returns top 3 recipes sorted by coherence without persisting intents', async () => {
    const beforeIntentIds = (await getIntentSpecs()).map((intent) => intent.id)

    const response = await app.inject({
      method: 'POST',
      url: '/api/recipes/recommend',
      payload: {
        facetPacks: [
          createFacetPack('ref-good'),
          createFacetPack('ref-compact', {
            layoutDensity: 'compact',
            spacingBaseUnit: 8,
          }),
          createFacetPack('ref-low-contrast', {
            textColor: '#eeeeee',
            backgroundColor: '#ffffff',
          }),
          createColorOnlyFacetPack('ref-color-only'),
        ],
      },
    })

    const body = response.json() as RecommendRecipesResponse
    const scores = body.recipes?.map((recipe) => recipe.coherenceScore) || []

    expect(response.statusCode).toBe(200)
    expect(body.success).toBe(true)
    expect(body.recipes).toHaveLength(3)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(
      body.recipes?.every((recipe) => recipe.chosen.typographyRefId !== 'ref-color-only')
    ).toBe(true)
    expect(
      body.recipes?.every((recipe) => recipe.chosen.layoutRefId !== 'ref-color-only')
    ).toBe(true)

    const afterIntentIds = (await getIntentSpecs()).map((intent) => intent.id)
    expect(afterIntentIds).toEqual(beforeIntentIds)
  })

  test('uses fewer mixed references as the tie breaker', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/recipes/recommend',
      payload: {
        facetPacks: [createFacetPack('ref-alpha'), createFacetPack('ref-beta')],
      },
    })

    const body = response.json() as RecommendRecipesResponse

    expect(response.statusCode).toBe(200)
    expect(body.recipes?.[0]?.name).toBe('Unified Style')
    expect(new Set(Object.values(body.recipes?.[0]?.chosen || {})).size).toBe(1)
  })
})

function trackPreviewId(id: string): string {
  previewIds.add(id)
  return id
}

async function cleanupPreview(id: string) {
  const previewId = sanitizePreviewId(id)

  await fs.rm(path.join(sourcePreviewRoot, previewId), {
    recursive: true,
    force: true,
  })
  await fs.rm(path.join(publicPreviewRoot, previewId), {
    recursive: true,
    force: true,
  })
}

function createFacetPack(
  refId: string,
  options: {
    textColor?: string
    backgroundColor?: string
    layoutDensity?: 'compact' | 'comfortable' | 'unknown'
    spacingBaseUnit?: 4 | 8
  } = {}
): FacetPack {
  const textColor = options.textColor || '#111111'
  const backgroundColor = options.backgroundColor || '#ffffff'
  const layoutDensity = options.layoutDensity || 'comfortable'
  const spacingBaseUnit = options.spacingBaseUnit || 8

  return {
    id: `pack-${refId}`,
    refId,
    createdAt: 1,
    summary: { moodKeywords: [] },
    tokens: [
      createColorToken(refId, 'text', textColor),
      createColorToken(refId, 'background', backgroundColor),
      createColorToken(refId, 'primary', '#005fcc'),
      {
        id: `${refId}-typography`,
        facetType: 'typography',
        role: 'typography.main',
        confidence: 0.8,
        evidence: { refId },
        value: {
          role: 'body',
          fontCandidates: [{ name: 'Inter' }],
          scale: { h1: 40, h2: 28, body: 16, caption: 12 },
          lineHeight: { display: 1.1, body: 1.5 },
        },
      },
      {
        id: `${refId}-layout`,
        facetType: 'layout',
        role: 'layout.main',
        confidence: 0.8,
        evidence: { refId },
        value: {
          pattern: 'cardGrid',
          columns: 3,
          density: layoutDensity,
        },
      },
      {
        id: `${refId}-spacing`,
        facetType: 'spacing',
        role: 'spacing.main',
        confidence: 0.8,
        evidence: { refId },
        value: {
          baseUnit: spacingBaseUnit,
          scale: [spacingBaseUnit, spacingBaseUnit * 2, spacingBaseUnit * 3],
          density: spacingBaseUnit === 4 ? 'compact' : 'comfortable',
        },
      },
      {
        id: `${refId}-component-style`,
        facetType: 'componentStyle',
        role: 'componentStyle.main',
        confidence: 0.8,
        evidence: { refId },
        value: {
          radius: 'md',
          shadow: 'sm',
          border: 'subtle',
        },
      },
    ],
  }
}

function createColorOnlyFacetPack(refId: string): FacetPack {
  return {
    id: `pack-${refId}`,
    refId,
    createdAt: 1,
    summary: { moodKeywords: [] },
    tokens: [
      createColorToken(refId, 'text', '#222222'),
      createColorToken(refId, 'background', '#ffffff'),
      createColorToken(refId, 'primary', '#8844ff'),
    ],
  }
}

function createColorToken(
  refId: string,
  role: ColorRole,
  hex: string
): FacetPack['tokens'][number] {
  return {
    id: `${refId}-color-${role}`,
    facetType: 'color',
    role: `color.${role}`,
    confidence: 0.8,
    evidence: { refId },
    value: { role, hex },
  }
}
