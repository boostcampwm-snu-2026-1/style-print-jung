import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react'
import { ReferenceUploader } from '@/components/reference-uploader'
import { FacetPackViewer } from '@/components/facet-pack-viewer'
import { RecipeCards } from '@/components/recipe-cards'
import { ConflictList } from '@/components/conflict-list'
import { CodeViewer } from '@/components/code-viewer'
import { AuditDiffTable } from '@/components/audit-diff-table'
import { ProvenanceBadges } from '@/components/provenance-badges'
import {
  ManualFacetSelector,
  manualFacetFields,
  type ManualFacetKey,
} from '@/components/manual-facet-selector'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Upload,
  Palette,
  Wand2,
  Code,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import type {
  ReferenceAsset,
  FacetPack,
  IntentSpec,
  GenerationBrief,
  ScreenPlanItem,
  ScreenPlanType,
  ConflictCard,
  RepairPlan,
  GeneratedCode,
  AuditReport,
  Recipe,
  GenerateResponse,
  AuditResponse,
  CoherenceFeedbackRating,
  CoherenceJudgeResult,
  RecommendRecipesResponse,
  SubmitCoherenceFeedbackResponse,
} from '@/lib/types'

// Code-split the generated preview so the upload/recipe flow stays light.
const PreviewPane = lazy(() =>
  import('@/components/preview-pane').then((m) => ({ default: m.PreviewPane }))
)

type Step = 'upload' | 'recipe' | 'generate'

const screenPlanOptions: { value: ScreenPlanType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'hamburgerMenu', label: 'Hamburger Menu' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'list', label: 'List' },
  { value: 'detail', label: 'Detail' },
  { value: 'form', label: 'Form' },
  { value: 'custom', label: 'Custom' },
]

function createScreenPlanItem(type: ScreenPlanType = 'home'): ScreenPlanItem {
  const option = screenPlanOptions.find((item) => item.value === type)
  return {
    id: `screen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    name: option?.label || 'Custom Screen',
  }
}

function createDefaultGenerationBrief(): GenerationBrief {
  return {
    prompt: '',
    screens: [createScreenPlanItem('home')],
    variantCount: 1,
  }
}

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
  const [recommendingRecipes, setRecommendingRecipes] = useState(false)
  const [recipeError, setRecipeError] = useState<string | null>(null)
  const [manualChosen, setManualChosen] = useState<IntentSpec['chosen']>({})
  const [intentSpec, setIntentSpec] = useState<IntentSpec | null>(null)

  // Conflict state
  const [conflicts, setConflicts] = useState<ConflictCard[]>([])
  const [repairs, setRepairs] = useState<RepairPlan[]>([])
  const [coherenceScore, setCoherenceScore] = useState<number>(0)
  const [coherenceJudgeResult, setCoherenceJudgeResult] =
    useState<CoherenceJudgeResult | null>(null)
  const [coherenceFeedbackStatus, setCoherenceFeedbackStatus] = useState<string | null>(null)
  const [evaluatingIntent, setEvaluatingIntent] = useState(false)

  // Generation state
  const [generationChosen, setGenerationChosen] = useState<IntentSpec['chosen']>({})
  const [generationBrief, setGenerationBrief] = useState<GenerationBrief>(
    createDefaultGenerationBrief
  )
  const [lastGeneratedSignature, setLastGeneratedSignature] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null)
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)

  // Load existing references on mount
  useEffect(() => {
    loadReferences()
  }, [])

  useEffect(() => {
    if (facetPacks.length === 0) return

    setManualChosen((prev) => {
      const refIds = facetPacks.map((pack) => pack.refId)
      const fallbackRefId = refIds[0]
      const next: IntentSpec['chosen'] = {}

      manualFacetFields.forEach(({ key }) => {
        next[key] = prev[key] && refIds.includes(prev[key]!) ? prev[key] : fallbackRefId
      })

      return next
    })
  }, [facetPacks])

  useEffect(() => {
    if (intentSpec) {
      setGenerationChosen(intentSpec.chosen)
      setGenerationBrief(intentSpec.generationBrief || createDefaultGenerationBrief())
    }
  }, [intentSpec?.id])

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
    setRecipeError(null)

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

    const nextPacks = [...facetPacks, ...newPacks]
    setFacetPacks(nextPacks)
    setExtracting(false)

    if (nextPacks.length > 0) {
      await loadRecommendedRecipes(nextPacks)
    }
  }

  const loadRecommendedRecipes = async (packs: FacetPack[]) => {
    if (packs.length < 1) {
      setRecipes([])
      return
    }

    setRecommendingRecipes(true)
    setRecipeError(null)
    setRecipes([])

    try {
      const response = await fetch(apiUrl('/api/recipes/recommend'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facetPacks: packs }),
      })
      const data = await readApiResponse<RecommendRecipesResponse>(
        response,
        'Recommend recipes failed'
      )

      if (data.success && data.recipes) {
        setRecipes(data.recipes)
      } else {
        setRecipeError('추천 생성 실패')
      }
    } catch (err) {
      console.error('Failed to recommend recipes:', err)
      setRecipeError('추천 생성 실패')
    } finally {
      setRecommendingRecipes(false)
    }
  }

  const selectRecipe = async (recipe: Recipe) => {
    setSelectedRecipe(recipe)
    setIntentSpec(null)
    setConflicts([])
    setRepairs([])
    setCoherenceScore(recipe.coherenceScore)
    setCoherenceJudgeResult(null)
    setCoherenceFeedbackStatus(null)
    setGeneratedCode(null)
    setAuditReport(null)
    setGenerationError(null)
    setLastGeneratedSignature(null)
    setEvaluatingIntent(true)

    try {
      const response = await fetch(apiUrl('/api/intents/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosen: recipe.chosen }),
      })
      const data = await response.json()
      if (data.success && data.intentSpec) {
        setIntentSpec(data.intentSpec)
        setGenerationChosen(data.intentSpec.chosen)
        await evaluateIntentSpec(data.intentSpec.id, recipe.id)
      } else {
        setEvaluatingIntent(false)
      }
    } catch (err) {
      console.error('Failed to create intent spec:', err)
      setEvaluatingIntent(false)
    }
  }

  const updateRecipeCoherence = (recipeId: string | undefined, score: number) => {
    setSelectedRecipe((prev) => {
      if (!prev || (recipeId && prev.id !== recipeId)) {
        return prev
      }

      return {
        ...prev,
        coherenceScore: score,
      }
    })

    if (recipeId) {
      setRecipes((prev) =>
        prev.map((recipe) =>
          recipe.id === recipeId ? { ...recipe, coherenceScore: score } : recipe
        )
      )
    }
  }

  const updateManualFacet = (key: ManualFacetKey, refId: string) => {
    setManualChosen((prev) => ({
      ...prev,
      [key]: refId,
    }))
  }

  const updateGenerationFacet = (key: ManualFacetKey, refId: string) => {
    setGenerationChosen((prev) => ({
      ...prev,
      [key]: refId,
    }))
  }

  const updateGenerationPrompt = (prompt: string) => {
    setGenerationBrief((prev) => ({ ...prev, prompt }))
  }

  const updateVariantCount = (value: string) => {
    const parsed = Number(value)
    const variantCount = parsed === 2 || parsed === 3 ? parsed : 1
    setGenerationBrief((prev) => ({ ...prev, variantCount }))
  }

  const addScreenPlanItem = () => {
    setGenerationBrief((prev) => ({
      ...prev,
      screens: [...prev.screens, createScreenPlanItem('custom')],
    }))
  }

  const updateScreenPlanItem = (
    id: string,
    patch: Partial<Omit<ScreenPlanItem, 'id'>>
  ) => {
    setGenerationBrief((prev) => ({
      ...prev,
      screens: prev.screens.map((screen) => {
        if (screen.id !== id) return screen

        const next = { ...screen, ...patch }
        if (patch.type && screen.name === getScreenTypeLabel(screen.type)) {
          next.name = getScreenTypeLabel(patch.type)
        }
        return next
      }),
    }))
  }

  const removeScreenPlanItem = (id: string) => {
    setGenerationBrief((prev) => ({
      ...prev,
      screens:
        prev.screens.length > 1
          ? prev.screens.filter((screen) => screen.id !== id)
          : prev.screens,
    }))
  }

  const selectManualRecipe = () => {
    const fallbackRefId = facetPacks[0]?.refId
    if (!fallbackRefId) return

    const chosen = manualFacetFields.reduce<IntentSpec['chosen']>(
      (acc, { key }) => ({
        ...acc,
        [key]: manualChosen[key] || fallbackRefId,
      }),
      {}
    )

    selectRecipe({
      id: 'manual-recipe',
      name: 'Custom Mix',
      chosen,
      coherenceScore: 0,
      description: 'Facet sources selected manually',
    })
  }

  const evaluateIntentSpec = async (specId: string, recipeId?: string) => {
    setEvaluatingIntent(true)

    try {
      const response = await fetch(apiUrl('/api/intents/evaluate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentSpecId: specId, judgeMode: 'shadow' }),
      })
      const data = await response.json()
      if (data.success) {
        const score = data.coherenceScore || 0
        setConflicts(data.conflicts || [])
        setRepairs(data.repairs || [])
        setCoherenceScore(score)
        setCoherenceJudgeResult(data.judgeResult || null)
        setCoherenceFeedbackStatus(null)
        updateRecipeCoherence(recipeId, score)
      }
    } catch (err) {
      console.error('Failed to evaluate intent spec:', err)
    } finally {
      setEvaluatingIntent(false)
    }
  }

  const submitCoherenceFeedback = async (rating: CoherenceFeedbackRating) => {
    if (!intentSpec) return

    try {
      setCoherenceFeedbackStatus('Saving...')
      const response = await fetch(apiUrl('/api/coherence/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentSpecId: intentSpec.id,
          judgeResultId: coherenceJudgeResult?.id,
          rating,
        }),
      })
      const data = await response.json() as SubmitCoherenceFeedbackResponse
      if (data.success) {
        setCoherenceFeedbackStatus('Saved')
      } else {
        setCoherenceFeedbackStatus(data.error || 'Save failed')
      }
    } catch (err) {
      console.error('Failed to submit coherence feedback:', err)
      setCoherenceFeedbackStatus('Save failed')
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
        evaluateIntentSpec(data.intentSpec.id, selectedRecipe?.id)
      }
    } catch (err) {
      console.error('Failed to apply repair:', err)
    }
  }

  const generateUI = async () => {
    if (!intentSpec) return

    const nextChosen = resolveGenerationChosen(generationChosen, intentSpec.chosen)
    const nextSignature = buildGenerationSignature(nextChosen, generationBrief)

    setGenerating(true)
    setGenerationError(null)
    setGeneratedCode(null)
    setAuditReport(null)
    try {
      const response = await fetch(apiUrl('/api/generate/v0'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentSpecId: intentSpec.id,
          stepMode: 'single',
          chosen: nextChosen,
          generationBrief,
        }),
      })
      const data = await readApiResponse<GenerateResponse>(
        response,
        'Generate UI failed'
      )
      if (data.success && data.generatedCode) {
        await finishGeneratedCode(data, nextSignature)
      } else if (data.success && data.generationJobId) {
        const completed = await pollGenerationJob(data.generationJobId)
        await finishGeneratedCode(completed, nextSignature)
      } else {
        setGenerationError(
          data.error || `Generate UI failed (${response.status})`
        )
      }
    } catch (err) {
      console.error('Failed to generate UI:', err)
      setGenerationError(getApiErrorMessage(err, 'Generate UI failed'))
    } finally {
      setGenerating(false)
    }
  }

  const finishGeneratedCode = async (
    data: GenerateResponse,
    generationSignature: string
  ) => {
    if (!data.generatedCode) {
      setGenerationError('Generate UI failed: no generated code returned')
      return
    }

    if (data.intentSpec) {
      setIntentSpec(data.intentSpec)
      setGenerationChosen(data.intentSpec.chosen)
      setGenerationBrief(data.intentSpec.generationBrief || generationBrief)
    }

    setGeneratedCode(data.generatedCode)
    setLastGeneratedSignature(generationSignature)

    await auditCode(
      data.generatedCode.code,
      data.intentSpec?.id || intentSpec?.id,
      data.generatedCode.id
    )
  }

  const pollGenerationJob = async (jobId: string): Promise<GenerateResponse> => {
    const startedAt = Date.now()
    const timeoutMs = 180_000

    while (Date.now() - startedAt < timeoutMs) {
      await wait(2_000)

      const response = await fetch(apiUrl(`/api/generate/jobs/${jobId}`))
      const data = await readApiResponse<GenerateResponse>(
        response,
        'Generate UI status check failed'
      )

      if (data.generatedCode) {
        return data
      }

      if (!data.success || data.generationStatus === 'failed') {
        throw new Error(data.error || 'Generate UI failed')
      }
    }

    throw new Error('Generate UI timed out')
  }

  const auditCode = async (
    code: string,
    specId = intentSpec?.id,
    generatedCodeId?: string
  ) => {
    if (!specId) return

    try {
      const response = await fetch(apiUrl('/api/audit/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentSpecId: specId,
          generatedCodeId,
          code,
        }),
      })
      const data = await readApiResponse<AuditResponse>(
        response,
        'Audit code failed'
      )
      if (data.success && data.report) {
        setAuditReport(data.report)
      }
    } catch (err) {
      console.error('Failed to audit code:', err)
    }
  }

  const canProceedToRecipe = references.length > 0 && facetPacks.length > 0
  const canProceedToGenerate = intentSpec !== null && !evaluatingIntent
  const resolvedGenerationChosen = intentSpec
    ? resolveGenerationChosen(generationChosen, intentSpec.chosen)
    : generationChosen
  const currentGenerationSignature = buildGenerationSignature(
    resolvedGenerationChosen,
    generationBrief
  )
  const generatedIsOutdated = Boolean(
    generatedCode &&
      lastGeneratedSignature &&
      currentGenerationSignature !== lastGeneratedSignature
  )
  const generateButtonLabel = !generatedCode
    ? 'Generate UI'
    : generatedIsOutdated
      ? 'Regenerate with edits'
      : 'Regenerate UI'

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-white/10 bg-[#151826] text-white shadow-[0_24px_55px_rgba(15,23,42,0.18)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#ff4267,#2563eb,#10b981,#f59e0b)]" />
        <div className="container mx-auto px-4 py-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-2xl animate-fade-up space-y-4">
              <Badge
                variant="outline"
                className="border-white/20 bg-white/10 text-white backdrop-blur"
              >
                MVP v0.1
              </Badge>
              <div>
                <h1 className="text-balance text-3xl font-black leading-tight tracking-normal md:text-4xl">
                  UI Facet Mixer
                </h1>
                <p className="mt-2 max-w-xl break-words text-sm leading-6 text-slate-300 md:text-base">
                  Extract, mix, and generate UI designs from uploaded design assets.
                </p>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:w-auto">
              <HeaderMetric label="References" value={references.length} />
              <HeaderMetric label="Facets" value={facetPacks.length} />
              <HeaderMetric label="Output" value={generatedCode ? 'Ready' : 'Draft'} />
            </div>
          </div>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="sticky top-0 z-20 border-b bg-white/80 shadow-sm backdrop-blur">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            <StepButton
              step="upload"
              current={currentStep}
              onClick={() => setCurrentStep('upload')}
              icon={<Upload className="h-4 w-4" />}
              label="1. Upload & Extract"
              completed={canProceedToRecipe}
            />
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <StepButton
              step="recipe"
              current={currentStep}
              onClick={() => canProceedToRecipe && setCurrentStep('recipe')}
              icon={<Palette className="h-4 w-4" />}
              label="2. Recipe Builder"
              disabled={!canProceedToRecipe}
              completed={canProceedToGenerate}
            />
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
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
      <main className="container mx-auto px-4 py-8">
        {currentStep === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <Card className="app-surface interactive-card animate-fade-up overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  Reference Assets
                </CardTitle>
                <CardDescription>
                  Upload up to 10 reference images to extract reusable intent facets
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
            <Card className="app-surface interactive-card animate-fade-up overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" />
                  Extracted Facets
                </CardTitle>
                <CardDescription>
                  Design tokens extracted from your references
                </CardDescription>
              </CardHeader>
              <CardContent>
                {facetPacks.length === 0 ? (
                  <div className="empty-state">
                    <Palette className="mx-auto mb-3 h-12 w-12 text-primary/70" />
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
              <Card className="app-surface interactive-card animate-fade-up overflow-hidden">
                <CardHeader>
                  <CardTitle>Recommended Recipes</CardTitle>
                  <CardDescription>
                    Select a pre-built combination or customize your own
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recommendingRecipes ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Ranking recipes...</span>
                    </div>
                  ) : recipeError ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{recipeError}</span>
                    </div>
                  ) : (
                    <RecipeCards
                      recipes={recipes}
                      selectedRecipe={selectedRecipe}
                      onSelectRecipe={selectRecipe}
                      references={references}
                      facetPacks={facetPacks}
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="app-surface interactive-card mt-6 overflow-hidden">
                <CardHeader>
                  <CardTitle>Custom Facet Sources</CardTitle>
                  <CardDescription>
                    Choose which reference each facet should come from
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ManualFacetSelector
                    chosen={manualChosen}
                    facetPacks={facetPacks}
                    references={references}
                    onChange={updateManualFacet}
                    onApply={selectManualRecipe}
                  />
                </CardContent>
              </Card>

              {/* Conflicts & Repairs */}
              {intentSpec && (
                <Card className="app-surface interactive-card mt-6 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Coherence Analysis
                    </CardTitle>
                    <CardDescription>
                      {evaluatingIntent
                        ? 'Evaluating the selected recipe coherence'
                        : 'Detected conflicts and suggested repairs'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Coherence Score</span>
                        {evaluatingIntent ? (
                          <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Evaluating...
                          </span>
                        ) : (
                          <span className="text-2xl font-bold">{coherenceScore}%</span>
                        )}
                      </div>
                      <Progress
                        value={coherenceScore}
                        className={evaluatingIntent ? 'animate-pulse' : undefined}
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={evaluatingIntent}
                          onClick={() => submitCoherenceFeedback('accurate')}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Accurate
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={evaluatingIntent}
                          onClick={() => submitCoherenceFeedback('tooHigh')}
                        >
                          <ArrowUp className="mr-2 h-4 w-4" />
                          Too high
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={evaluatingIntent}
                          onClick={() => submitCoherenceFeedback('tooLow')}
                        >
                          <ArrowDown className="mr-2 h-4 w-4" />
                          Too low
                        </Button>
                        {coherenceFeedbackStatus && (
                          <span className="text-sm text-muted-foreground">
                            {coherenceFeedbackStatus}
                          </span>
                        )}
                      </div>
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
              <Card className="app-surface sticky top-24 overflow-hidden">
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
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Coherence</span>
                          {evaluatingIntent ? (
                            <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Evaluating
                            </span>
                          ) : (
                            <span className="text-sm font-semibold">
                              {selectedRecipe.coherenceScore}%
                            </span>
                          )}
                        </div>
                        <Progress
                          value={selectedRecipe.coherenceScore}
                          className={evaluatingIntent ? 'animate-pulse' : undefined}
                        />
                      </div>
                      <Separator />
                      <div className="space-y-2 text-sm">
                        {Object.entries(selectedRecipe.chosen).map(([key, refId]) => {
                          const ref = references.find((r) => r.id === refId)
                          const refIndex = ref
                            ? references.findIndex((reference) => reference.id === ref.id) + 1
                            : null
                          return (
                            <div key={key} className="flex justify-between">
                              <span className="text-muted-foreground">
                                {key.replace('RefId', '')}
                              </span>
                              <span>{refIndex ? `Ref ${refIndex}` : refId?.slice(0, 6)}</span>
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
                        {evaluatingIntent ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Checking coherence...
                          </>
                        ) : (
                          <>
                            Continue to Generate
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Palette className="mx-auto mb-2 h-8 w-8 text-primary/70" />
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
            <Card className="app-surface animate-fade-up overflow-hidden">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Wand2 className="h-5 w-5 text-primary" />
                      Export UI Code
                    </CardTitle>
                    <CardDescription>
                      Export the selected IntentSpec as React + Tailwind code
                    </CardDescription>
                  </div>
                  {generatedCode && (
                    <Badge variant={generatedIsOutdated ? 'warning' : 'success'}>
                      {generatedIsOutdated ? 'Outdated' : 'Current'}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_180px]">
                  <div className="space-y-2">
                    <Label htmlFor="generation-prompt">Prompt</Label>
                    <textarea
                      id="generation-prompt"
                      value={generationBrief.prompt}
                      onChange={(event) => updateGenerationPrompt(event.target.value)}
                      placeholder="Describe the product, audience, content, interactions, or constraints you want in the generated UI."
                    className="min-h-[120px] w-full resize-y rounded-md border border-input bg-white/90 px-3 py-2 text-sm shadow-inner ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="variant-count">Variants</Label>
                    <Select
                      value={String(generationBrief.variantCount)}
                      onValueChange={updateVariantCount}
                    >
                      <SelectTrigger id="variant-count">
                        <SelectValue placeholder="Select count" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 concept</SelectItem>
                        <SelectItem value="2">2 concepts</SelectItem>
                        <SelectItem value="3">3 concepts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">Reference Sources</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose which uploaded reference drives each generated facet.
                    </p>
                  </div>
                  <ManualFacetSelector
                    chosen={resolvedGenerationChosen}
                    facetPacks={facetPacks}
                    references={references}
                    onChange={updateGenerationFacet}
                  />
                </div>

                {generatedCode && generatedIsOutdated && (
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
                    The current generated result was created from older settings.
                  </div>
                )}

                <Separator />

                <div className="flex flex-wrap items-center gap-4">
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
                        {generateButtonLabel}
                      </>
                    )}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {generating
                      ? 'Waiting for v0 response...'
                      : 'Mode: Single Generation (Full UI at once)'}
                  </span>
                </div>
                {generationError && (
                  <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{generationError}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Code & Preview */}
            {generatedCode && (
              <Tabs defaultValue="preview" className="w-full animate-fade-up">
                <TabsList className="mb-3">
                  <TabsTrigger value="preview">Result</TabsTrigger>
                  <TabsTrigger value="code">Code</TabsTrigger>
                  <TabsTrigger value="audit">Audit & Provenance</TabsTrigger>
                </TabsList>
                <TabsContent value="preview">
                  <Card className="app-surface overflow-hidden">
                    <CardContent className="space-y-4 pt-6">
                      <div className="flex flex-wrap items-start gap-4 rounded-lg border bg-[linear-gradient(135deg,#fff7fa,#f8fafc)] p-3 shadow-sm">
                        {generatedCode.screenshotUrl ? (
                          <img
                            src={generatedCode.screenshotUrl}
                            alt="Generated UI screenshot"
                            className="h-28 w-44 rounded-md border bg-white object-cover shadow-sm"
                          />
                        ) : (
                          <div className="flex h-28 w-44 items-center justify-center rounded-md border bg-white text-xs text-muted-foreground shadow-inner">
                            No screenshot
                          </div>
                        )}
                        <div className="min-w-0 flex-1 text-sm">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="font-medium">Preview Snapshot</span>
                            <Badge variant={generatedIsOutdated ? 'warning' : 'outline'}>
                              {generatedIsOutdated ? 'Outdated' : 'From generated code'}
                            </Badge>
                          </div>
                          {generatedCode.screenshotError ? (
                            <p className="text-muted-foreground">
                              Screenshot unavailable: {generatedCode.screenshotError}
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              Captured from the generated preview artifact.
                            </p>
                          )}
                        </div>
                      </div>
                      <Suspense
                        fallback={
                          <p className="text-muted-foreground">Loading preview…</p>
                        }
                      >
                        <PreviewPane
                          id={generatedCode.id}
                          code={generatedCode.code}
                          files={generatedCode.files}
                          entryFile={generatedCode.entryFile}
                          previewUrl={generatedCode.previewUrl}
                        />
                      </Suspense>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="code">
                  <Card className="app-surface overflow-hidden">
                    <CardContent className="pt-6">
                      <CodeViewer code={generatedCode.code} />
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="audit">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="app-surface overflow-hidden">
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
                    <Card className="app-surface overflow-hidden">
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

function HeaderMetric({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-right backdrop-blur">
      <div className="text-lg font-black leading-none text-white">{value}</div>
      <div className="mt-1 text-[11px] font-semibold text-slate-300">
        {label}
      </div>
    </div>
  )
}

function ScreenPlanEditor({
  screens,
  onAdd,
  onChange,
  onRemove,
}: {
  screens: ScreenPlanItem[]
  onAdd: () => void
  onChange: (id: string, patch: Partial<Omit<ScreenPlanItem, 'id'>>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Screen Plan</h3>
          <p className="text-sm text-muted-foreground">
            Define the screens the generated component should include.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Screen
        </Button>
      </div>
      <div className="space-y-3">
        {screens.map((screen, index) => (
          <div key={screen.id} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[180px_1fr_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor={`${screen.id}-type`}>Type</Label>
              <Select
                value={screen.type}
                onValueChange={(type) =>
                  onChange(screen.id, { type: type as ScreenPlanType })
                }
              >
                <SelectTrigger id={`${screen.id}-type`}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {screenPlanOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${screen.id}-name`}>Name</Label>
              <input
                id={`${screen.id}-name`}
                value={screen.name}
                onChange={(event) => onChange(screen.id, { name: event.target.value })}
                placeholder={`Screen ${index + 1}`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${screen.id}-notes`}>Notes</Label>
              <input
                id={`${screen.id}-notes`}
                value={screen.notes || ''}
                onChange={(event) => onChange(screen.id, { notes: event.target.value })}
                placeholder="Optional"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(screen.id)}
                disabled={screens.length === 1}
                aria-label={`Remove ${screen.name || `screen ${index + 1}`}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function resolveGenerationChosen(
  chosen: IntentSpec['chosen'],
  fallback: IntentSpec['chosen']
): IntentSpec['chosen'] {
  return manualFacetFields.reduce<IntentSpec['chosen']>(
    (acc, { key }) => ({
      ...acc,
      [key]: chosen[key] || fallback[key],
    }),
    {}
  )
}

function buildGenerationSignature(
  chosen: IntentSpec['chosen'],
  brief: GenerationBrief
): string {
  return JSON.stringify({
    chosen,
    brief: {
      prompt: brief.prompt.trim(),
      variantCount: brief.variantCount,
      screens: brief.screens.map((screen) => ({
        type: screen.type,
        name: screen.name.trim(),
        notes: screen.notes?.trim() || '',
      })),
    },
  })
}

function getScreenTypeLabel(type: ScreenPlanType): string {
  return screenPlanOptions.find((option) => option.value === type)?.label || 'Custom'
}

async function readApiResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const text = await response.text()

  if (!text) {
    throw new Error(`${fallbackMessage}: empty response (${response.status})`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${fallbackMessage}: invalid JSON response (${response.status})`)
  }
}

function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof TypeError) {
    return `${fallbackMessage}: API server connection failed`
  }

  return error instanceof Error ? error.message : fallbackMessage
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
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
      className={cn(
        'group flex min-w-[180px] flex-shrink-0 items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition-all duration-200',
        isActive &&
          'border-transparent bg-[linear-gradient(135deg,#ff4267,#ff5c7a)] text-white shadow-accent',
        completed &&
          !isActive &&
          'border-emerald-200 bg-emerald-50 text-emerald-700',
        disabled &&
          'cursor-not-allowed border-transparent bg-transparent text-muted-foreground opacity-60',
        !isActive &&
          !completed &&
          !disabled &&
          'border-transparent bg-white/65 text-slate-700 hover:border-primary/25 hover:bg-white hover:shadow-sm'
      )}
    >
      {completed && !isActive ? (
        <Check className="h-4 w-4" />
      ) : (
        icon
      )}
      <span>{label}</span>
    </button>
  )
}
