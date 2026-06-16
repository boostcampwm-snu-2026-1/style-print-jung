'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getReferenceImageSrc } from '@/lib/references'
import type { Recipe, ReferenceAsset, FacetPack } from '@/lib/types'

interface RecipeCardsProps {
  recipes: Recipe[]
  selectedRecipe: Recipe | null
  onSelectRecipe: (recipe: Recipe) => void
  references: ReferenceAsset[]
  facetPacks: FacetPack[]
}

export function RecipeCards({
  recipes,
  selectedRecipe,
  onSelectRecipe,
  references,
}: RecipeCardsProps) {
  if (recipes.length === 0) {
    return (
      <div className="empty-state">
        <Sparkles className="mx-auto mb-3 h-12 w-12 text-primary/70" />
        <p>No recipes available yet</p>
        <p className="text-sm">Extract facets from at least one reference</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {recipes.map((recipe, index) => {
        const isSelected = selectedRecipe?.id === recipe.id

        return (
          <Card
            key={recipe.id}
            className={cn(
              'interactive-card relative cursor-pointer overflow-hidden transition-all',
              isSelected
                ? 'border-primary bg-[linear-gradient(180deg,#fff7fa,#ffffff)] ring-2 ring-primary/25'
                : 'hover:border-primary/30'
            )}
            onClick={() => onSelectRecipe(recipe)}
          >
            <div
              className={cn(
                'absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#ff4267,#2563eb)] opacity-0 transition-opacity',
                isSelected && 'opacity-100'
              )}
            />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant={index === 0 ? 'default' : 'secondary'}>
                  {index === 0 && 'Recommended'}
                  {index === 1 && 'Alternative'}
                  {index === 2 && 'Creative'}
                </Badge>
                {isSelected && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-accent">
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <CardTitle className="text-lg">{recipe.name}</CardTitle>
              <CardDescription>{recipe.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Coherence Score */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Coherence</span>
                  <span className="font-medium">{recipe.coherenceScore}%</span>
                </div>
                <Progress
                  value={recipe.coherenceScore}
                  className={cn(
                    'h-2',
                    recipe.coherenceScore >= 90 && '[&>div]:bg-green-500',
                    recipe.coherenceScore >= 70 &&
                      recipe.coherenceScore < 90 &&
                      '[&>div]:bg-yellow-500',
                    recipe.coherenceScore < 70 && '[&>div]:bg-orange-500'
                  )}
                />
              </div>

              {/* Facet Sources */}
              <div className="space-y-2 text-xs">
                <FacetSource
                  label="Color"
                  refId={recipe.chosen.colorRefId}
                  references={references}
                />
                <FacetSource
                  label="Typography"
                  refId={recipe.chosen.typographyRefId}
                  references={references}
                />
                <FacetSource
                  label="Layout"
                  refId={recipe.chosen.layoutRefId}
                  references={references}
                />
                <FacetSource
                  label="Spacing"
                  refId={recipe.chosen.spacingRefId}
                  references={references}
                />
                <FacetSource
                  label="Style"
                  refId={recipe.chosen.componentStyleRefId}
                  references={references}
                />
              </div>

              {/* Select Button */}
              <Button
                variant={isSelected ? 'default' : 'outline'}
                className="mt-4 w-full"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectRecipe(recipe)
                }}
              >
                {isSelected ? 'Selected' : 'Select Recipe'}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function FacetSource({
  label,
  refId,
  references,
}: {
  label: string
  refId?: string
  references: ReferenceAsset[]
}) {
  const ref = refId ? references.find((r) => r.id === refId) : null
  const referenceImageSrc = getReferenceImageSrc(ref)
  const referenceIndex = ref ? references.findIndex((reference) => reference.id === ref.id) + 1 : null

  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-muted/60">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 text-foreground">
        {referenceImageSrc && (
          <img
            src={referenceImageSrc}
            alt={ref?.filename || 'Reference thumbnail'}
            className="h-6 w-8 rounded border object-cover shadow-sm"
          />
        )}
        <span>{referenceIndex ? `Ref ${referenceIndex}` : 'N/A'}</span>
      </div>
    </div>
  )
}
