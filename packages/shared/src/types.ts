// ============================================
// Reference Asset Types
// ============================================

export type ReferenceAsset = {
  id: string
  filename: string
  mime: string
  width?: number
  height?: number
  url?: string // Preferred: public file URL for previews
  storagePath?: string // Relative path on disk for local cleanup
  dataUrl?: string // Legacy: base64 preview
  createdAt: number
}

// ============================================
// Facet Types
// ============================================

export type ColorRole =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'background'
  | 'surface'
  | 'text'
  | 'success'
  | 'warning'
  | 'error'

export type FacetType =
  | 'color'
  | 'typography'
  | 'layout'
  | 'spacing'
  | 'componentStyle'

export type Evidence = {
  refId: string
  note?: string
  // TODO: bbox, sampledPixels 등 확장 가능
}

export type FacetTokenBase = {
  id: string
  facetType: FacetType
  role: string // 예: 'color.primary', 'type.body', 'layout.pattern'
  confidence: number // 0~1
  evidence: Evidence
}

export type ColorFacetToken = FacetTokenBase & {
  facetType: 'color'
  value: {
    hex: string
    role: ColorRole
    contrastAgainst?: { backgroundHex: string; ratio: number }
  }
}

export type TypographyFacetToken = FacetTokenBase & {
  facetType: 'typography'
  value: {
    role: 'display' | 'body'
    fontCandidates: { name: string; weightHints?: number[] }[]
    scale: { h1: number; h2: number; body: number; caption: number } // px
    lineHeight: { display: number; body: number }
  }
}

export type LayoutFacetToken = FacetTokenBase & {
  facetType: 'layout'
  value: {
    pattern: 'tabs' | 'sidebar' | 'cardGrid' | 'masterDetail' | 'topNav' | 'unknown'
    columns?: number
    density: 'compact' | 'comfortable' | 'unknown'
    notes?: string
  }
}

export type SpacingFacetToken = FacetTokenBase & {
  facetType: 'spacing'
  value: {
    baseUnit: 4 | 8
    scale: number[] // 예: [4,8,12,16,24,32]
    density: 'compact' | 'comfortable'
  }
}

export type ComponentStyleFacetToken = FacetTokenBase & {
  facetType: 'componentStyle'
  value: {
    radius: 'none' | 'sm' | 'md' | 'lg' | 'xl'
    shadow: 'none' | 'sm' | 'md' | 'lg'
    border: 'none' | 'subtle' | 'strong'
  }
}

export type FacetToken =
  | ColorFacetToken
  | TypographyFacetToken
  | LayoutFacetToken
  | SpacingFacetToken
  | ComponentStyleFacetToken

export type FacetPack = {
  id: string
  refId: string
  tokens: FacetToken[]
  summary: { moodKeywords: string[] } // LLM이 뽑아주는 요약
  createdAt: number
}

// ============================================
// Intent Spec Types
// ============================================

export type IntentExportFormat = 'react-tailwind'

export type IntentExportTarget = {
  format: IntentExportFormat
  label: string
  description: string
}

export type ScreenPlanType =
  | 'home'
  | 'hamburgerMenu'
  | 'dashboard'
  | 'list'
  | 'detail'
  | 'form'
  | 'custom'

export type ScreenPlanItem = {
  id: string
  type: ScreenPlanType
  name: string
  notes?: string
}

export type GenerationBrief = {
  prompt: string
  screens: ScreenPlanItem[]
  variantCount: 1 | 2 | 3
}

export type IntentSpec = {
  id: string
  chosen: {
    colorRefId?: string
    typographyRefId?: string
    layoutRefId?: string
    spacingRefId?: string
    componentStyleRefId?: string
  }
  normalized: {
    palette?: Record<ColorRole, string> // role -> hex
    typography?: TypographyFacetToken['value']
    layout?: LayoutFacetToken['value']
    spacing?: SpacingFacetToken['value']
    componentStyle?: ComponentStyleFacetToken['value']
  }
  provenance: Record<string, Evidence> // key: 'palette.primary' 등
  conflicts: ConflictCard[]
  repairs: RepairPlan[]
  history: SpecChange[]
  createdAt: number
  coherenceScore?: number
  targetExport: IntentExportTarget
  generationBrief?: GenerationBrief
}

// ============================================
// Conflict Types
// ============================================

export type ConflictType =
  | 'contrast'
  | 'densityTypographyMismatch'
  | 'spacingScaleMismatch'
  | 'styleIncoherence'
  | 'missingValue'

export type ConflictSeverity = 'info' | 'warn' | 'error'

export type ConflictCard = {
  id: string
  type: ConflictType
  severity: ConflictSeverity
  message: string
  rationale?: string
  affectedKeys: string[] // 예: ['palette.text','palette.background']
  suggestedRepairs: string[] // RepairPlan id list
}

// ============================================
// Repair Types
// ============================================

export type RepairPlan = {
  id: string
  title: string
  description: string
  changes: { key: string; from: unknown; to: unknown }[]
  explanation: string // 1줄 설명(LLM optional)
  scoreDelta?: number
}

export type SpecChange = {
  ts: number
  description: string
  patch: { key: string; from: unknown; to: unknown }[]
}

// ============================================
// Recipe Types
// ============================================

export type Recipe = {
  id: string
  name: string
  chosen: IntentSpec['chosen']
  coherenceScore: number
  description: string
}

// ============================================
// Generation Types
// ============================================

export type GenerationMode = 'single' | 'staged'

export type GenerationStep = {
  name: string
  code: string
  description: string
}

export type GeneratedCodeFile = {
  path: string
  code: string
}

export type GeneratedCode = {
  id: string
  intentSpecId: string
  mode: GenerationMode
  code: string
  files?: GeneratedCodeFile[]
  entryFile?: string
  previewUrl?: string
  screenshotUrl?: string
  screenshotError?: string
  steps?: GenerationStep[]
  createdAt: number
}

// ============================================
// Audit Types
// ============================================

export type AugmentedFacets = {
  palette?: Record<string, string>
  typography?: Partial<TypographyFacetToken['value']>
  spacing?: Partial<SpacingFacetToken['value']>
  componentStyle?: Partial<ComponentStyleFacetToken['value']>
}

export type FacetDiff = {
  key: string
  expected: unknown
  actual: unknown
  match: 'exact' | 'similar' | 'different' | 'missing'
}

export type ProvenanceBadge = {
  facetKey: string
  sourceRefId: string
  sourceRefName: string
  transformation?: string // 예: 'contrast adjusted'
}

export type AuditReport = {
  id: string
  intentSpecId: string
  generatedCodeId: string
  augmented: AugmentedFacets
  diffs: FacetDiff[]
  provenanceBadges: ProvenanceBadge[]
  createdAt: number
}

// ============================================
// API Request/Response Types
// ============================================

export type UploadRequest = {
  files: string[] // base64 dataUrls
}

export type UploadResponse = {
  success: boolean
  references: ReferenceAsset[]
  error?: string
}

export type ExtractRequest = {
  refId: string
}

export type ExtractResponse = {
  success: boolean
  facetPack?: FacetPack
  error?: string
}

export type CreateIntentRequest = {
  chosen: IntentSpec['chosen']
  generationBrief?: GenerationBrief
}

export type CreateIntentResponse = {
  success: boolean
  intentSpec?: IntentSpec
  error?: string
}

export type EvaluateRequest = {
  intentSpecId: string
}

export type EvaluateResponse = {
  success: boolean
  conflicts?: ConflictCard[]
  repairs?: RepairPlan[]
  coherenceScore?: number
  error?: string
}

export type ApplyRepairRequest = {
  intentSpecId: string
  repairPlanId: string
}

export type ApplyRepairResponse = {
  success: boolean
  intentSpec?: IntentSpec
  error?: string
}

export type RecommendRecipesRequest = {
  refIds?: string[]
  facetPacks?: FacetPack[]
  limit?: number
}

export type RecommendRecipesResponse = {
  success: boolean
  recipes?: Recipe[]
  error?: string
}

export type GenerateRequest = {
  intentSpecId: string
  stepMode: GenerationMode
  chosen?: IntentSpec['chosen']
  generationBrief?: GenerationBrief
}

export type GenerationJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type GenerateResponse = {
  success: boolean
  generationJobId?: string
  generationStatus?: GenerationJobStatus
  generatedCode?: GeneratedCode
  intentSpec?: IntentSpec
  error?: string
}

export type PreviewBuildRequest = Pick<
  GeneratedCode,
  'id' | 'code' | 'files' | 'entryFile'
>

export type PreviewBuildResponse = {
  success: boolean
  previewUrl?: string
  error?: string
}

export type AuditRequest = {
  intentSpecId: string
  code: string
}

export type AuditResponse = {
  success: boolean
  report?: AuditReport
  error?: string
}
