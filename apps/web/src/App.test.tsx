import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import type { FacetPack, Recipe, ReferenceAsset } from '@/lib/types'

const references: ReferenceAsset[] = [
  {
    id: 'ref-alpha',
    filename: 'alpha.png',
    mime: 'image/png',
    url: '/uploads/alpha.png',
    createdAt: 1,
  },
  {
    id: 'ref-beta',
    filename: 'beta.png',
    mime: 'image/png',
    url: '/uploads/beta.png',
    createdAt: 2,
  },
]

const recommendedRecipes: Recipe[] = [
  {
    id: 'recipe-1',
    name: 'Backend Ranked Mix',
    chosen: {
      colorRefId: 'ref-alpha',
      typographyRefId: 'ref-alpha',
      layoutRefId: 'ref-alpha',
      spacingRefId: 'ref-alpha',
      componentStyleRefId: 'ref-alpha',
    },
    coherenceScore: 100,
    description: 'Ranked by backend coherence',
  },
]

describe('App recipe recommendations', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('loads recommended recipes from the API after facet extraction', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(handleSuccessfulRecipeFlow)
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await screen.findByText('2 reference(s) uploaded')
    await user.click(screen.getByRole('button', { name: /Extract Facets/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/recipes/recommend',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await user.click(await screen.findByRole('button', { name: /Continue to Recipe Builder/i }))

    expect(await screen.findByText('Backend Ranked Mix')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.queryByText('Color Accent Mix')).not.toBeInTheDocument()
    expect(screen.queryByText('Typography Focus')).not.toBeInTheDocument()
  })

  test('shows recommendation failure without hardcoded fallback recipes', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(handleFailedRecommendationFlow))

    render(<App />)

    await screen.findByText('2 reference(s) uploaded')
    await user.click(screen.getByRole('button', { name: /Extract Facets/i }))
    await user.click(await screen.findByRole('button', { name: /Continue to Recipe Builder/i }))

    expect(await screen.findByText('추천 생성 실패')).toBeInTheDocument()
    expect(screen.queryByText('Unified Style')).not.toBeInTheDocument()
    expect(screen.queryByText('Color Accent Mix')).not.toBeInTheDocument()
  })
})

async function handleSuccessfulRecipeFlow(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = String(input)

  if (url === '/api/references/upload' && !init?.method) {
    return jsonResponse({ success: true, references })
  }

  if (url === '/api/facets/extract') {
    return jsonResponse({
      success: true,
      facetPack: createFacetPack(getRequestRefId(init)),
    })
  }

  if (url === '/api/recipes/recommend') {
    return jsonResponse({ success: true, recipes: recommendedRecipes })
  }

  throw new Error(`Unexpected request: ${url}`)
}

async function handleFailedRecommendationFlow(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = String(input)

  if (url === '/api/references/upload' && !init?.method) {
    return jsonResponse({ success: true, references })
  }

  if (url === '/api/facets/extract') {
    return jsonResponse({
      success: true,
      facetPack: createFacetPack(getRequestRefId(init)),
    })
  }

  if (url === '/api/recipes/recommend') {
    return jsonResponse({ success: false, error: 'Recommendation failed' })
  }

  throw new Error(`Unexpected request: ${url}`)
}

function getRequestRefId(init?: RequestInit): string {
  const body = JSON.parse(String(init?.body || '{}')) as { refId?: string }
  return body.refId || 'ref-alpha'
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createFacetPack(refId: string): FacetPack {
  return {
    id: `pack-${refId}`,
    refId,
    createdAt: 1,
    summary: { moodKeywords: ['clean'] },
    tokens: [
      {
        id: `${refId}-color`,
        facetType: 'color',
        role: 'color.primary',
        confidence: 0.8,
        evidence: { refId },
        value: { role: 'primary', hex: '#005fcc' },
      },
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
        value: { pattern: 'cardGrid', columns: 3, density: 'comfortable' },
      },
      {
        id: `${refId}-spacing`,
        facetType: 'spacing',
        role: 'spacing.main',
        confidence: 0.8,
        evidence: { refId },
        value: { baseUnit: 8, scale: [8, 16, 24], density: 'comfortable' },
      },
      {
        id: `${refId}-component-style`,
        facetType: 'componentStyle',
        role: 'componentStyle.main',
        confidence: 0.8,
        evidence: { refId },
        value: { radius: 'md', shadow: 'sm', border: 'subtle' },
      },
    ],
  }
}
