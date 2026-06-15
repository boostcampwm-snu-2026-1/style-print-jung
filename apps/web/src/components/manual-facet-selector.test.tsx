import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { ManualFacetSelector } from './manual-facet-selector'
import type { FacetPack, IntentSpec, ReferenceAsset } from '@/lib/types'

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

const fullFacetPack: FacetPack = {
  id: 'pack-alpha',
  refId: 'ref-alpha',
  createdAt: 1,
  summary: { moodKeywords: ['calm', 'editorial', 'clean'] },
  tokens: [
    {
      id: 'color-primary',
      facetType: 'color',
      role: 'color.primary',
      confidence: 0.95,
      evidence: { refId: 'ref-alpha' },
      value: { role: 'primary', hex: '#112233' },
    },
    {
      id: 'typography-display',
      facetType: 'typography',
      role: 'type.display',
      confidence: 0.9,
      evidence: { refId: 'ref-alpha' },
      value: {
        role: 'display',
        fontCandidates: [{ name: 'Inter' }, { name: 'Geist' }],
        scale: { h1: 48, h2: 32, body: 16, caption: 12 },
        lineHeight: { display: 1.1, body: 1.5 },
      },
    },
    {
      id: 'layout-main',
      facetType: 'layout',
      role: 'layout.pattern',
      confidence: 0.88,
      evidence: { refId: 'ref-alpha' },
      value: {
        pattern: 'cardGrid',
        columns: 3,
        density: 'comfortable',
        notes: 'Large cards with generous gutters',
      },
    },
    {
      id: 'spacing-main',
      facetType: 'spacing',
      role: 'spacing.scale',
      confidence: 0.86,
      evidence: { refId: 'ref-alpha' },
      value: {
        baseUnit: 8,
        scale: [8, 16, 24, 32],
        density: 'comfortable',
      },
    },
    {
      id: 'component-style-main',
      facetType: 'componentStyle',
      role: 'component.card',
      confidence: 0.82,
      evidence: { refId: 'ref-alpha' },
      value: {
        radius: 'lg',
        shadow: 'md',
        border: 'subtle',
      },
    },
  ],
}

const betaFacetPack: FacetPack = {
  ...fullFacetPack,
  id: 'pack-beta',
  refId: 'ref-beta',
  summary: { moodKeywords: ['bold'] },
  tokens: [
    {
      id: 'color-beta',
      facetType: 'color',
      role: 'color.primary',
      confidence: 0.92,
      evidence: { refId: 'ref-beta' },
      value: { role: 'accent', hex: '#FF0066' },
    },
  ],
}

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
  }
})

describe('ManualFacetSelector 컴포넌트', () => {
  afterEach(() => {
    cleanup()
  })

  test('facet pack이 없으면 빈 상태를 보여준다', () => {
    render(
      <ManualFacetSelector
        chosen={{}}
        facetPacks={[]}
        references={references}
        onChange={vi.fn()}
        onApply={vi.fn()}
      />
    )

    expect(
      screen.getByText('Extract facets before customizing sources')
    ).toBeInTheDocument()
    expect(screen.queryByText('Apply Custom Mix')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  test('각 facet selector와 선택된 reference의 token preview를 렌더링한다', () => {
    render(
      <ManualFacetSelector
        chosen={{}}
        facetPacks={[fullFacetPack]}
        references={references}
        onChange={vi.fn()}
        onApply={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Color')).toBeInTheDocument()
    expect(screen.getByLabelText('Typography')).toBeInTheDocument()
    expect(screen.getByLabelText('Layout')).toBeInTheDocument()
    expect(screen.getByLabelText('Spacing')).toBeInTheDocument()
    expect(screen.getByLabelText('Component Style')).toBeInTheDocument()

    expect(screen.getByText('primary')).toBeInTheDocument()
    expect(screen.getByText('#112233')).toBeInTheDocument()
    expect(screen.getByText('Inter')).toBeInTheDocument()
    expect(screen.getByText('H1 48px')).toBeInTheDocument()
    expect(screen.getByText('cardGrid')).toBeInTheDocument()
    expect(screen.getByText('3 columns')).toBeInTheDocument()
    expect(screen.getByText('Large cards with generous gutters')).toBeInTheDocument()
    expect(screen.getByText('Base 8px')).toBeInTheDocument()
    expect(screen.getByText('Radius')).toBeInTheDocument()
    expect(screen.getByText('lg')).toBeInTheDocument()
    expect(screen.getByText('Shadow')).toBeInTheDocument()
    expect(screen.getByText('md')).toBeInTheDocument()
    expect(screen.getByText('Border')).toBeInTheDocument()
    expect(screen.getByText('subtle')).toBeInTheDocument()
  })

  test('사용자가 facet source를 바꾸면 facet key와 refId를 onChange로 전달한다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <ManualFacetSelector
        chosen={{}}
        facetPacks={[fullFacetPack, betaFacetPack]}
        references={references}
        onChange={onChange}
      />
    )

    await user.click(screen.getByLabelText('Color'))
    await user.click(await screen.findByRole('option', { name: 'Ref 2 - beta.png' }))

    expect(onChange).toHaveBeenCalledWith('colorRefId', 'ref-beta')
  })

  test('선택된 reference에 해당 facet token이 없으면 빈 token 메시지와 fallback reference label을 보여준다', () => {
    const chosen: IntentSpec['chosen'] = {
      typographyRefId: 'ref-beta',
      layoutRefId: 'ref-alpha',
      spacingRefId: 'ref-alpha',
      componentStyleRefId: 'ref-alpha',
    }

    render(
      <ManualFacetSelector
        chosen={chosen}
        facetPacks={[fullFacetPack, betaFacetPack]}
        references={[]}
        onChange={vi.fn()}
      />
    )

    expect(
      screen.getByText('No typography token extracted from this reference')
    ).toBeInTheDocument()
    expect(screen.getAllByText('Ref ref-be').length).toBeGreaterThan(0)
    expect(screen.queryByText('beta.png')).not.toBeInTheDocument()
  })
})
