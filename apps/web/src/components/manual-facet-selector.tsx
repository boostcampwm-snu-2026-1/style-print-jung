import { Palette } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getReferenceImageSrc } from '@/lib/references'
import type { FacetPack, IntentSpec, ReferenceAsset } from '@/lib/types'

export const manualFacetFields = [
  { key: 'colorRefId', label: 'Color', facetType: 'color' },
  { key: 'typographyRefId', label: 'Typography', facetType: 'typography' },
  { key: 'layoutRefId', label: 'Layout', facetType: 'layout' },
  { key: 'spacingRefId', label: 'Spacing', facetType: 'spacing' },
  { key: 'componentStyleRefId', label: 'Component Style', facetType: 'componentStyle' },
] as const

export type ManualFacetKey = (typeof manualFacetFields)[number]['key']
type ManualFacetType = (typeof manualFacetFields)[number]['facetType']
type FacetToken = FacetPack['tokens'][number]
type FacetTokenOf<T extends ManualFacetType> = Extract<FacetToken, { facetType: T }>

type ManualFacetSelectorProps = {
  chosen: IntentSpec['chosen']
  facetPacks: FacetPack[]
  references: ReferenceAsset[]
  onChange: (key: ManualFacetKey, refId: string) => void
  onApply?: () => void
}

export function ManualFacetSelector({
  chosen,
  facetPacks,
  references,
  onChange,
  onApply,
}: ManualFacetSelectorProps) {
  if (facetPacks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Palette className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Extract facets before customizing sources</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {manualFacetFields.map(({ key, label, facetType }) => {
          const selectedRefId = chosen[key] || facetPacks[0]?.refId
          const selectedPack = facetPacks.find((pack) => pack.refId === selectedRefId)
          const selectedReference = references.find(
            (reference) => reference.id === selectedRefId
          )

          return (
            <div key={key} className="space-y-2 rounded-md border p-3">
              <Label htmlFor={key}>{label}</Label>
              <Select
                value={selectedRefId}
                onValueChange={(refId) => onChange(key, refId)}
              >
                <SelectTrigger id={key}>
                  <SelectValue placeholder="Select reference" />
                </SelectTrigger>
                <SelectContent>
                  {facetPacks.map((pack) => (
                    <SelectItem key={pack.refId} value={pack.refId}>
                      {getReferenceLabel(pack.refId, references)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FacetSourcePreview
                facetType={facetType}
                facetPack={selectedPack}
                reference={selectedReference}
              />
            </div>
          )
        })}
      </div>
      {onApply && (
        <Button className="w-full md:w-auto" onClick={onApply}>
          Apply Custom Mix
        </Button>
      )}
    </div>
  )
}

function FacetSourcePreview({
  facetType,
  facetPack,
  reference,
}: {
  facetType: ManualFacetType
  facetPack?: FacetPack
  reference?: ReferenceAsset
}) {
  const referenceImageSrc = getReferenceImageSrc(reference)

  if (!facetPack) {
    return (
      <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
        No extracted facets for this reference
      </div>
    )
  }

  return (
    <div className="rounded-md bg-muted/50 p-3 text-xs">
      <div className="mb-3 flex items-center gap-2">
        {referenceImageSrc && (
          <img
            src={referenceImageSrc}
            alt={reference?.filename || 'Reference thumbnail'}
            className="h-8 w-10 rounded border object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">
            {reference?.filename || `Ref ${facetPack.refId.slice(0, 6)}`}
          </p>
          <p className="text-muted-foreground">
            {facetPack.summary.moodKeywords.slice(0, 3).join(', ') || 'No mood summary'}
          </p>
        </div>
      </div>
      <FacetTokenPreview facetType={facetType} facetPack={facetPack} />
    </div>
  )
}

function FacetTokenPreview({
  facetType,
  facetPack,
}: {
  facetType: ManualFacetType
  facetPack: FacetPack
}) {
  if (facetType === 'color') {
    const tokens = getFacetTokens(facetPack, 'color')

    if (tokens.length === 0) {
      return <EmptyFacetPreview label="color" />
    }

    return (
      <div className="grid grid-cols-2 gap-2">
        {tokens.slice(0, 8).map((token) => (
          <div key={token.id} className="flex min-w-0 items-center gap-2">
            <div
              className="h-6 w-6 flex-shrink-0 rounded border"
              style={{ backgroundColor: token.value.hex }}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{token.value.role}</p>
              <p className="text-muted-foreground">{token.value.hex}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (facetType === 'typography') {
    const token = getFacetTokens(facetPack, 'typography')[0]

    if (!token) {
      return <EmptyFacetPreview label="typography" />
    }

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {token.value.fontCandidates.slice(0, 3).map((font) => (
            <Badge key={font.name} variant="outline" className="text-[10px]">
              {font.name}
            </Badge>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
          <span>H1 {token.value.scale.h1}px</span>
          <span>H2 {token.value.scale.h2}px</span>
          <span>Body {token.value.scale.body}px</span>
          <span>Caption {token.value.scale.caption}px</span>
        </div>
      </div>
    )
  }

  if (facetType === 'layout') {
    const token = getFacetTokens(facetPack, 'layout')[0]

    if (!token) {
      return <EmptyFacetPreview label="layout" />
    }

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px]">
            {token.value.pattern}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {token.value.density}
          </Badge>
          {token.value.columns && (
            <Badge variant="outline" className="text-[10px]">
              {token.value.columns} columns
            </Badge>
          )}
        </div>
        {token.value.notes && (
          <p className="line-clamp-2 text-muted-foreground">{token.value.notes}</p>
        )}
      </div>
    )
  }

  if (facetType === 'spacing') {
    const token = getFacetTokens(facetPack, 'spacing')[0]

    if (!token) {
      return <EmptyFacetPreview label="spacing" />
    }

    return (
      <div className="space-y-2">
        <div className="flex gap-2 text-muted-foreground">
          <span>Base {token.value.baseUnit}px</span>
          <span>{token.value.density}</span>
        </div>
        <div className="flex h-9 items-end gap-1">
          {token.value.scale.slice(0, 8).map((size) => (
            <div
              key={size}
              className="flex w-5 items-end justify-center rounded-sm bg-primary/70 text-[9px] text-primary-foreground"
              style={{ height: `${Math.max(16, Math.min(size, 36))}px` }}
              title={`${size}px`}
            >
              {size}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const token = getFacetTokens(facetPack, 'componentStyle')[0]

  if (!token) {
    return <EmptyFacetPreview label="component style" />
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-md border bg-background p-2 text-center">
        <p className="text-muted-foreground">Radius</p>
        <p className="font-medium">{token.value.radius}</p>
      </div>
      <div className="rounded-md border bg-background p-2 text-center shadow-sm">
        <p className="text-muted-foreground">Shadow</p>
        <p className="font-medium">{token.value.shadow}</p>
      </div>
      <div className="rounded-md border bg-background p-2 text-center">
        <p className="text-muted-foreground">Border</p>
        <p className="font-medium">{token.value.border}</p>
      </div>
    </div>
  )
}

function EmptyFacetPreview({ label }: { label: string }) {
  return (
    <p className="text-muted-foreground">
      No {label} token extracted from this reference
    </p>
  )
}

function getFacetTokens<T extends ManualFacetType>(
  facetPack: FacetPack,
  facetType: T
): FacetTokenOf<T>[] {
  return facetPack.tokens.filter(
    (token): token is FacetTokenOf<T> => token.facetType === facetType
  )
}

function getReferenceLabel(refId: string, references: ReferenceAsset[]) {
  const ref = references.find((reference) => reference.id === refId)
  const index = ref
    ? references.findIndex((reference) => reference.id === ref.id) + 1
    : null

  return index ? `Ref ${index} - ${ref?.filename}` : `Ref ${refId.slice(0, 6)}`
}
