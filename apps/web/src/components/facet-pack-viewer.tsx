'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getReferenceImageSrc } from '@/lib/references'
import type { FacetPack, ReferenceAsset, ColorFacetToken, TypographyFacetToken, LayoutFacetToken, SpacingFacetToken, ComponentStyleFacetToken } from '@/lib/types'

interface FacetPackViewerProps {
  facetPack: FacetPack
  reference?: ReferenceAsset
}

export function FacetPackViewer({ facetPack, reference }: FacetPackViewerProps) {
  const colorTokens = facetPack.tokens.filter(
    (t): t is ColorFacetToken => t.facetType === 'color'
  )
  const typographyTokens = facetPack.tokens.filter(
    (t): t is TypographyFacetToken => t.facetType === 'typography'
  )
  const layoutTokens = facetPack.tokens.filter(
    (t): t is LayoutFacetToken => t.facetType === 'layout'
  )
  const spacingTokens = facetPack.tokens.filter(
    (t): t is SpacingFacetToken => t.facetType === 'spacing'
  )
  const componentStyleTokens = facetPack.tokens.filter(
    (t): t is ComponentStyleFacetToken => t.facetType === 'componentStyle'
  )
  const referenceImageSrc = getReferenceImageSrc(reference)

  return (
    <Card className="interactive-card overflow-hidden border-[#dbe2ea]">
      <CardHeader className="bg-[linear-gradient(135deg,#ffffff,#fff7fa)] pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Ref #{facetPack.refId.slice(0, 6)}
          </CardTitle>
          {referenceImageSrc && (
            <img
              src={referenceImageSrc}
              alt="Reference thumbnail"
              className="h-12 w-12 rounded-md border object-cover shadow-sm"
            />
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {facetPack.summary.moodKeywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="text-xs">
              {keyword}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Colors */}
        {colorTokens.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Colors</h4>
            <div className="flex flex-wrap gap-2">
              {colorTokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center gap-2 rounded-md border bg-white px-2 py-1 shadow-sm"
                >
                  <div
                    className="h-5 w-5 rounded border shadow-inner"
                    style={{ backgroundColor: token.value.hex }}
                  />
                  <span className="text-xs">{token.value.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Typography */}
        {typographyTokens.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Typography</h4>
            {typographyTokens.map((token) => (
              <div key={token.id} className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Font:</span>
                  <span>
                    {token.value.fontCandidates[0]?.name || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Scale:</span>
                  <span>
                    H1: {token.value.scale.h1}px, Body: {token.value.scale.body}px
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Layout */}
        {layoutTokens.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Layout</h4>
            {layoutTokens.map((token) => (
              <div key={token.id} className="text-xs flex flex-wrap gap-2">
                <Badge variant="outline">{token.value.pattern}</Badge>
                <Badge variant="outline">{token.value.density}</Badge>
                {token.value.columns && (
                  <Badge variant="outline">{token.value.columns} cols</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Spacing */}
        {spacingTokens.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Spacing</h4>
            {spacingTokens.map((token) => (
              <div key={token.id} className="text-xs">
                <span className="text-muted-foreground">Base unit:</span>{' '}
                {token.value.baseUnit}px
                <div className="flex gap-1 mt-1">
                  {token.value.scale.slice(0, 6).map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Component Style */}
        {componentStyleTokens.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Component Style</h4>
            {componentStyleTokens.map((token) => (
              <div key={token.id} className="text-xs flex flex-wrap gap-2">
                <Badge variant="outline">radius: {token.value.radius}</Badge>
                <Badge variant="outline">shadow: {token.value.shadow}</Badge>
                <Badge variant="outline">border: {token.value.border}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
