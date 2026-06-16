import { describe, expect, test } from 'vitest'
import type { IntentSpec } from '@style-print-jung/shared'
import { buildFacetAnalysisPrompt } from './facet-analysis'
import { buildIntentExportPrompt } from './intent-export'

const targetExport: IntentSpec['targetExport'] = {
  format: 'react-tailwind',
  label: 'React + Tailwind',
  description: 'Test target',
}

describe('facet analysis prompt', () => {
  test('includes asset dimensions and single-asset moodboard guidance', () => {
    const prompt = buildFacetAnalysisPrompt({
      colorPalette: { background: '#ffffff', text: '#111111' },
      assetDimensions: { width: 390, height: 844 },
    })

    expect(prompt).toContain('Asset dimensions: 390x844px')
    expect(prompt).toContain('Brand moodboard image')
    expect(prompt).not.toContain('across images')
  })
})

describe('intent export prompt', () => {
  test('passes mood, source confidence, screen plan, and variants to generation', () => {
    const intentSpec: IntentSpec = {
      id: 'intent-prompt-test',
      chosen: {
        colorRefId: 'ref-a',
        typographyRefId: 'ref-b',
      },
      normalized: {
        palette: {
          background: '#ffffff',
          surface: '#f5f5f5',
          text: '#111111',
          primary: '#005fcc',
        } as IntentSpec['normalized']['palette'],
      },
      provenance: {
        'palette.background': { refId: 'ref-a' },
        typography: { refId: 'ref-b' },
      },
      conflicts: [],
      repairs: [],
      history: [],
      createdAt: 1,
      targetExport,
      generationBrief: {
        prompt: 'Create a polished analytics home screen.',
        screens: [
          {
            id: 'screen-home',
            type: 'home',
            name: 'Home',
            notes: 'Show KPI cards',
          },
        ],
        variantCount: 3,
      },
      styleContext: {
        moodKeywords: ['calm', 'editorial'],
        sources: [
          {
            refId: 'ref-a',
            facetTypes: ['color'],
            moodKeywords: ['calm'],
            averageConfidence: 0.82,
            width: 390,
            height: 844,
          },
        ],
      },
    }

    const prompt = buildIntentExportPrompt(intentSpec, targetExport)

    expect(prompt).toContain('Create a polished analytics home screen.')
    expect(prompt).toContain('1. Home (home) - Show KPI cards')
    expect(prompt).toContain('Variant count requested: 3.')
    expect(prompt).toContain('Overall mood: calm, editorial')
    expect(prompt).toContain('confidence 0.82')
    expect(prompt).toContain('background/surface should dominate')
  })
})
