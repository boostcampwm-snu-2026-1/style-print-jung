import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react'
import { ReferenceUploader } from '@/components/reference-uploader'
import { FacetPackViewer } from '@/components/facet-pack-viewer'
import { RecipeCards } from '@/components/recipe-cards'
import { ConflictList } from '@/components/conflict-list'
import { CodeViewer } from '@/components/code-viewer'
import { AuditDiffTable } from '@/components/audit-diff-table'
import { ProvenanceBadges } from '@/components/provenance-badges'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiUrl } from '@/lib/api'
import {
  Upload,
  Palette,
  Wand2,
  Code,
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import type {
  ReferenceAsset,
  FacetPack,
  IntentSpec,
  ConflictCard,
  RepairPlan,
  GeneratedCode,
  AuditReport,
  Recipe,
} from '@/lib/types'

// Code-split the live preview: the heavy @codesandbox/sandpack-react bundle is
// only fetched when the preview is actually rendered, keeping the main bundle
// (and initial memory footprint) small.
const PreviewPane = lazy(() =>
  import('@/components/preview-pane').then((m) => ({ default: m.PreviewPane }))
)

type Step = 'upload' | 'recipe' | 'generate'

export default function App() {
  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('upload')

  // Data state
  const [references, setReferences] = useState<ReferenceAsset[]>([])
  const [facetPacks, setFacetPacks] = useState<FacetPack[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState(0)

  // Recipe state
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [intentSpec, setIntentSpec] = useState<IntentSpec | null>(null)

  // Conflict state
  const [conflicts, setConflicts] = useState<ConflictCard[]>([])
  const [repairs, setRepairs] = useState<RepairPlan[]>([])
  const [coherenceScore, setCoherenceScore] = useState<number>(0)

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null)
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)

  // Load existing references on mount
  useEffect(() => {
    loadReferences()
  }, [])

  const loadReferences = async () => {
    try {
      const response = await fetch(apiUrl('/api/references/upload'))
      const data = await response.json()
      if (data.success) {
        setReferences(data.references)
      }
    } catch (err) {
      console.error('Failed to load references:', err)
    }
  }

  const handleUploadComplete = (newRefs: ReferenceAsset[]) => {
    setReferences((prev) => [...prev, ...newRefs])
  }

  const handleDeleteReference = (id: string) => {
    setReferences((prev) => prev.filter((r) => r.id !== id))
    setFacetPacks((prev) => prev.filter((p) => p.refId !== id))
  }

  const extractFacets = async () => {
    if (references.length === 0) return

    setExtracting(true)
    setExtractionProgress(0)

    const newPacks: FacetPack[] = []
    for (let i = 0; i < references.length; i++) {
      const ref = references[i]

      // Skip if already extracted
      if (facetPacks.some((p) => p.refId === ref.id)) {
        setExtractionProgress(((i + 1) / references.length) * 100)
        continue
      }

      try {
        const response = await fetch(apiUrl('/api/facets/extract'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refId: ref.id }),
        })
        const data = await response.json()
        if (data.success && data.facetPack) {
          newPacks.push(data.facetPack)
        }
      } catch (err) {
        console.error(`Failed to extract facets for ${ref.id}:`, err)
      }

      setExtractionProgress(((i + 1) / references.length) * 100)
    }

    setFacetPacks((prev) => [...prev, ...newPacks])
    setExtracting(false)

    // Generate recipes after extraction
    if (newPacks.length > 0 || facetPacks.length > 0) {
      generateRecipes([...facetPacks, ...newPacks])
    }
  }

  const generateRecipes = (packs: FacetPack[]) => {
    // Simple recipe generation: create 3 combinations
    if (packs.length < 1) return

    const newRecipes: Recipe[] = []

    // Recipe 1: Use first reference for all facets
    if (packs[0]) {
      newRecipes.push({
        id: 'recipe-1',
        name: 'Unified Style',
        chosen: {
          colorRefId: packs[0].refId,
          typographyRefId: packs[0].refId,
          layoutRefId: packs[0].refId,
          spacingRefId: packs[0].refId,
          componentStyleRefId: packs[0].refId,
        },
        coherenceScore: 95,
        description: 'All facets from the same reference for maximum consistency',
      })
    }

    // Recipe 2: Mix if multiple references
    if (packs.length >= 2) {
      newRecipes.push({
        id: 'recipe-2',
        name: 'Color Accent Mix',
        chosen: {
          colorRefId: packs[1].refId,
          typographyRefId: packs[0].refId,
          layoutRefId: packs[0].refId,
          spacingRefId: packs[0].refId,
          componentStyleRefId: packs[1].refId,
        },
        coherenceScore: 82,
        description: 'Typography and layout from Ref 1, colors and style from Ref 2',
      })
    }

    // Recipe 3: Different mix
    if (packs.length >= 3) {
      newRecipes.push({
        id: 'recipe-3',
        name: 'Layout Focus',
        chosen: {
          colorRefId: packs[0].refId,
          typographyRefId: packs[1].refId,
          layoutRefId: packs[2].refId,
          spacingRefId: packs[2].refId,
          componentStyleRefId: packs[0].refId,
        },
        coherenceScore: 75,
        description: 'Layout from Ref 3, typography from Ref 2, colors from Ref 1',
      })
    } else if (packs.length >= 2) {
      newRecipes.push({
        id: 'recipe-3',
        name: 'Typography Focus',
        chosen: {
          colorRefId: packs[0].refId,
          typographyRefId: packs[1].refId,
          layoutRefId: packs[1].refId,
          spacingRefId: packs[0].refId,
          componentStyleRefId: packs[0].refId,
        },
        coherenceScore: 78,
        description: 'Typography and layout from Ref 2, everything else from Ref 1',
      })
    }

    setRecipes(newRecipes)
  }

  const selectRecipe = async (recipe: Recipe) => {
    setSelectedRecipe(recipe)

    try {
      const response = await fetch(apiUrl('/api/intents/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosen: recipe.chosen }),
      })
      const data = await response.json()
      if (data.success && data.intentSpec) {
        setIntentSpec(data.intentSpec)
        evaluateIntentSpec(data.intentSpec.id)
      }
    } catch (err) {
      console.error('Failed to create intent spec:', err)
    }
  }

  const evaluateIntentSpec = async (specId: string) => {
    try {
      const response = await fetch(apiUrl('/api/intents/evaluate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentSpecId: specId }),
      })
      const data = await response.json()
      if (data.success) {
        setConflicts(data.conflicts || [])
        setRepairs(data.repairs || [])
        setCoherenceScore(data.coherenceScore || 0)
      }
    } catch (err) {
      console.error('Failed to evaluate intent spec:', err)
    }
  }

  const applyRepair = async (repairId: string) => {
    if (!intentSpec) return

    try {
      const response = await fetch(apiUrl('/api/intents/apply-repair'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentSpecId: intentSpec.id,
          repairPlanId: repairId,
        }),
      })
      const data = await response.json()
      if (data.success && data.intentSpec) {
        setIntentSpec(data.intentSpec)
        evaluateIntentSpec(data.intentSpec.id)
      }
    } catch (err) {
      console.error('Failed to apply repair:', err)
    }
  }

  const generateUI = async () => {
    if (!intentSpec) return

    setGenerating(true)
    try {
      const response = await fetch(apiUrl('/api/generate/v0'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentSpecId: intentSpec.id,
          stepMode: 'single',
        }),
      })
      const data = await response.json()
      if (data.success && data.generatedCode) {
        setGeneratedCode(data.generatedCode)

        // Audit the generated code
        await auditCode(data.generatedCode.code)
      }
    } catch (err) {
      console.error('Failed to generate UI:', err)
    } finally {
      setGenerating(false)
    }
  }

  const auditCode = async (code: string) => {
    if (!intentSpec) return

    try {
      const response = await fetch(apiUrl('/api/audit/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentSpecId: intentSpec.id,
          code,
        }),
      })
      const data = await response.json()
      if (data.success && data.report) {
        setAuditReport(data.report)
      }
    } catch (err) {
      console.error('Failed to audit code:', err)
    }
  }

  const canProceedToRecipe = references.length > 0 && facetPacks.length > 0
  const canProceedToGenerate = intentSpec !== null

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">UI Facet Mixer</h1>
              <p className="text-sm text-muted-foreground">
                Extract, mix, and generate UI designs from uploaded design assets
              </p>
            </div>
            <Badge variant="outline">MVP v0.1</Badge>
          </div>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <StepButton
              step="upload"
              current={currentStep}
              onClick={() => setCurrentStep('upload')}
              icon={<Upload className="h-4 w-4" />}
              label="1. Upload & Extract"
              completed={canProceedToRecipe}
            />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepButton
              step="recipe"
              current={currentStep}
              onClick={() => canProceedToRecipe && setCurrentStep('recipe')}
              icon={<Palette className="h-4 w-4" />}
              label="2. Recipe Builder"
              disabled={!canProceedToRecipe}
              completed={canProceedToGenerate}
            />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepButton
              step="generate"
              current={currentStep}
              onClick={() => canProceedToGenerate && setCurrentStep('generate')}
              icon={<Code className="h-4 w-4" />}
              label="3. Generate & Audit"
              disabled={!canProceedToGenerate}
              completed={generatedCode !== null}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {currentStep === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Reference Assets
                </CardTitle>
                <CardDescription>
                  Upload design references to extract reusable intent facets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReferenceUploader
                  onUploadComplete={handleUploadComplete}
                  existingReferences={references}
                  onDeleteReference={handleDeleteReference}
                />

                {references.length > 0 && (
                  <div className="mt-4 space-y-4">
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {references.length} reference(s) uploaded
                      </span>
                      <Button
                        onClick={extractFacets}
                        disabled={extracting}
                      >
                        {extracting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Extracting...
                          </>
                        ) : (
                          <>
                            <Wand2 className="mr-2 h-4 w-4" />
                            Extract Facets
                          </>
                        )}
                      </Button>
                    </div>
                    {extracting && (
                      <Progress value={extractionProgress} className="w-full" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Extracted Facets Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Extracted Facets
                </CardTitle>
                <CardDescription>
                  Design tokens extracted from your references
                </CardDescription>
              </CardHeader>
              <CardContent>
                {facetPacks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Palette className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No facets extracted yet</p>
                    <p className="text-sm">Upload references and click &quot;Extract Facets&quot;</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {facetPacks.map((pack) => (
                        <FacetPackViewer
                          key={pack.id}
                          facetPack={pack}
                          reference={references.find((r) => r.id === pack.refId)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Next Step Button */}
            {canProceedToRecipe && (
              <div className="lg:col-span-2 flex justify-end">
                <Button onClick={() => setCurrentStep('recipe')} size="lg">
                  Continue to Recipe Builder
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {currentStep === 'recipe' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recipe Cards */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recommended Recipes</CardTitle>
                  <CardDescription>
                    Select a pre-built combination or customize your own
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RecipeCards
                    recipes={recipes}
                    selectedRecipe={selectedRecipe}
                    onSelectRecipe={selectRecipe}
                    references={references}
                    facetPacks={facetPacks}
                  />
                </CardContent>
              </Card>

              {/* Conflicts & Repairs */}
              {intentSpec && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Coherence Analysis
                    </CardTitle>
                    <CardDescription>
                      Detected conflicts and suggested repairs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Coherence Score</span>
                        <span className="text-2xl font-bold">{coherenceScore}%</span>
                      </div>
                      <Progress value={coherenceScore} />
                    </div>
                    <ConflictList
                      conflicts={conflicts}
                      repairs={repairs}
                      onApplyRepair={applyRepair}
                    />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Selected Recipe Summary */}
            <div>
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle>Selected Recipe</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedRecipe ? (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium">{selectedRecipe.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {selectedRecipe.description}
                        </p>
                      </div>
                      <Separator />
                      <div className="space-y-2 text-sm">
                        {Object.entries(selectedRecipe.chosen).map(([key, refId]) => {
                          const ref = references.find((r) => r.id === refId)
                          return (
                            <div key={key} className="flex justify-between">
                              <span className="text-muted-foreground">
                                {key.replace('RefId', '')}
                              </span>
                              <span>Ref #{refId?.slice(0, 6)}</span>
                            </div>
                          )
                        })}
                      </div>
                      <Separator />
                      <Button
                        className="w-full"
                        onClick={() => setCurrentStep('generate')}
                        disabled={!canProceedToGenerate}
                      >
                        Continue to Generate
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Palette className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Select a recipe to continue</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {currentStep === 'generate' && (
          <div className="space-y-6">
            {/* Generation Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5" />
                  Export UI Code
                </CardTitle>
                <CardDescription>
                  Export the selected IntentSpec as React + Tailwind code
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Button
                    onClick={generateUI}
                    disabled={generating || !intentSpec}
                    size="lg"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Code className="mr-2 h-4 w-4" />
                        Generate UI
                      </>
                    )}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Mode: Single Generation (Full UI at once)
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Code & Preview */}
            {generatedCode && (
              <Tabs defaultValue="preview" className="w-full">
                <TabsList>
                  <TabsTrigger value="preview">Live Preview</TabsTrigger>
                  <TabsTrigger value="code">Code</TabsTrigger>
                  <TabsTrigger value="audit">Audit & Provenance</TabsTrigger>
                </TabsList>
                <TabsContent value="preview">
                  <Card>
                    <CardContent className="pt-6">
                      <Suspense
                        fallback={
                          <p className="text-muted-foreground">Loading preview…</p>
                        }
                      >
                        <PreviewPane code={generatedCode.code} />
                      </Suspense>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="code">
                  <Card>
                    <CardContent className="pt-6">
                      <CodeViewer code={generatedCode.code} />
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="audit">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Facet Diff</CardTitle>
                        <CardDescription>
                          Comparing IntentSpec vs generated output
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {auditReport ? (
                          <AuditDiffTable diffs={auditReport.diffs} />
                        ) : (
                          <p className="text-muted-foreground">
                            Audit report loading...
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Provenance</CardTitle>
                        <CardDescription>
                          Source tracking for each facet
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {auditReport ? (
                          <ProvenanceBadges
                            badges={auditReport.provenanceBadges}
                            references={references}
                          />
                        ) : (
                          <p className="text-muted-foreground">
                            Loading provenance data...
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// Step Button Component
function StepButton({
  step,
  current,
  onClick,
  icon,
  label,
  disabled = false,
  completed = false,
}: {
  step: Step
  current: Step
  onClick: () => void
  icon: ReactNode
  label: string
  disabled?: boolean
  completed?: boolean
}) {
  const isActive = step === current

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : completed
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            : disabled
              ? 'text-muted-foreground cursor-not-allowed'
              : 'hover:bg-muted'
      }`}
    >
      {completed && !isActive ? (
        <Check className="h-4 w-4" />
      ) : (
        icon
      )}
      <span className="font-medium">{label}</span>
    </button>
  )
}
