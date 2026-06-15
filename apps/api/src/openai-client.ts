import type {
  AuditReport,
  ComponentStyleFacetToken,
  IntentSpec,
  LayoutFacetToken,
  SpacingFacetToken,
  TypographyFacetToken,
} from '@style-print-jung/shared'
import { config, requireConfig } from './config'
import {
  FACET_ANALYSIS_INSTRUCTIONS,
  buildFacetAnalysisPrompt,
} from './prompts/facet-analysis'
import {
  CODE_AUDIT_INSTRUCTIONS,
  buildCodeAuditPrompt,
} from './prompts/code-audit'

type DesignFacetAnalysis = {
  typography: TypographyFacetToken['value']
  layout: LayoutFacetToken['value']
  spacing: SpacingFacetToken['value']
  componentStyle: ComponentStyleFacetToken['value']
  moodKeywords: string[]
}

type OpenAIResponse = {
  output_text?: string
  output?: {
    type?: string
    content?: {
      type?: string
      text?: string
      refusal?: string
    }[]
  }[]
}

type OpenAIJSONOptions = {
  instructions?: string
  maxOutputTokens?: number
}

const DEFAULT_JSON_INSTRUCTIONS =
  'Return JSON that exactly matches the supplied schema.'

export async function analyzeDesignFacets(
  imageDataUrl: string,
  colorPalette: Record<string, string>
): Promise<DesignFacetAnalysis> {
  const analysis = await callOpenAIJSON<DesignFacetAnalysis>(
    'design_facet_analysis',
    designFacetSchema,
    [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildFacetAnalysisPrompt({ colorPalette }),
          },
          {
            type: 'input_image',
            image_url: imageDataUrl,
            detail: 'high',
          },
        ],
      },
    ],
    { instructions: FACET_ANALYSIS_INSTRUCTIONS }
  )

  return normalizeDesignFacetAnalysis(analysis)
}

export async function auditGeneratedCodeWithOpenAI(
  code: string,
  intentSpec: IntentSpec
): Promise<AuditReport['augmented']> {
  const audit = await callOpenAIJSON<AuditReport['augmented']>(
    'generated_code_audit',
    auditFacetSchema,
    [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildCodeAuditPrompt({ code, intentSpec }),
          },
        ],
      },
    ],
    { instructions: CODE_AUDIT_INSTRUCTIONS, maxOutputTokens: 3000 }
  )

  return normalizeAuditFacets(audit)
}

async function callOpenAIJSON<T>(
  schemaName: string,
  schema: Record<string, unknown>,
  input: unknown[],
  options: OpenAIJSONOptions = {}
): Promise<T> {
  const apiKey = requireConfig('OPENAI_API_KEY', config.openai.apiKey)

  const response = await fetch(config.openai.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.openai.model,
      instructions: options.instructions || DEFAULT_JSON_INSTRUCTIONS,
      input,
      max_output_tokens: options.maxOutputTokens || 1600,
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${error}`)
  }

  const data: OpenAIResponse = await response.json()
  const outputText = getOutputText(data)
  if (!outputText) {
    throw new Error('OpenAI response did not include output text')
  }

  return JSON.parse(outputText) as T
}

function getOutputText(data: OpenAIResponse): string | null {
  if (data.output_text) {
    return data.output_text
  }

  for (const output of data.output || []) {
    for (const content of output.content || []) {
      if (content.type === 'refusal' && content.refusal) {
        throw new Error(`OpenAI refusal: ${content.refusal}`)
      }
      if ((content.type === 'output_text' || content.type === 'text') && content.text) {
        return content.text
      }
    }
  }

  return null
}

function normalizeDesignFacetAnalysis(
  analysis: DesignFacetAnalysis
): DesignFacetAnalysis {
  return {
    typography: analysis.typography,
    layout: {
      ...analysis.layout,
      columns: analysis.layout.columns || undefined,
    },
    spacing: analysis.spacing,
    componentStyle: analysis.componentStyle,
    moodKeywords: analysis.moodKeywords.slice(0, 6),
  }
}

function normalizeAuditFacets(
  augmented: AuditReport['augmented']
): AuditReport['augmented'] {
  return {
    palette: dropNullValues(augmented.palette),
    typography: augmented.typography,
    spacing: augmented.spacing,
    componentStyle: augmented.componentStyle,
  }
}

function dropNullValues<T extends Record<string, unknown>>(
  value: T | undefined
): T | undefined {
  if (!value) return undefined

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null)
  ) as T
}

const nullableStringSchema = { type: ['string', 'null'] }

const numericScaleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['h1', 'h2', 'body', 'caption'],
  properties: {
    h1: { type: 'number' },
    h2: { type: 'number' },
    body: { type: 'number' },
    caption: { type: 'number' },
  },
}

const spacingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['baseUnit', 'scale', 'density'],
  properties: {
    baseUnit: { type: 'number', enum: [4, 8] },
    scale: {
      type: 'array',
      items: { type: 'number' },
    },
    density: { type: 'string', enum: ['compact', 'comfortable'] },
  },
}

const componentStyleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['radius', 'shadow', 'border'],
  properties: {
    radius: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'] },
    shadow: { type: 'string', enum: ['none', 'sm', 'md', 'lg'] },
    border: { type: 'string', enum: ['none', 'subtle', 'strong'] },
  },
}

const designFacetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['typography', 'layout', 'spacing', 'componentStyle', 'moodKeywords'],
  properties: {
    typography: {
      type: 'object',
      additionalProperties: false,
      required: ['role', 'fontCandidates', 'scale', 'lineHeight'],
      properties: {
        role: { type: 'string', enum: ['display', 'body'] },
        fontCandidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'weightHints'],
            properties: {
              name: { type: 'string' },
              weightHints: {
                type: 'array',
                items: { type: 'number' },
              },
            },
          },
        },
        scale: numericScaleSchema,
        lineHeight: {
          type: 'object',
          additionalProperties: false,
          required: ['display', 'body'],
          properties: {
            display: { type: 'number' },
            body: { type: 'number' },
          },
        },
      },
    },
    layout: {
      type: 'object',
      additionalProperties: false,
      required: ['pattern', 'columns', 'density', 'notes'],
      properties: {
        pattern: {
          type: 'string',
          enum: ['tabs', 'sidebar', 'cardGrid', 'masterDetail', 'topNav', 'unknown'],
        },
        columns: { type: ['number', 'null'] },
        density: { type: 'string', enum: ['compact', 'comfortable', 'unknown'] },
        notes: { type: 'string' },
      },
    },
    spacing: spacingSchema,
    componentStyle: componentStyleSchema,
    moodKeywords: {
      type: 'array',
      items: { type: 'string' },
    },
  },
}

const auditFacetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['palette', 'typography', 'spacing', 'componentStyle'],
  properties: {
    palette: {
      type: 'object',
      additionalProperties: false,
      required: ['primary', 'secondary', 'accent', 'background', 'surface', 'text'],
      properties: {
        primary: nullableStringSchema,
        secondary: nullableStringSchema,
        accent: nullableStringSchema,
        background: nullableStringSchema,
        surface: nullableStringSchema,
        text: nullableStringSchema,
      },
    },
    typography: {
      type: 'object',
      additionalProperties: false,
      required: ['role', 'fontCandidates', 'scale', 'lineHeight'],
      properties: {
        role: { type: ['string', 'null'], enum: ['display', 'body', null] },
        fontCandidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'weightHints'],
            properties: {
              name: { type: 'string' },
              weightHints: {
                type: 'array',
                items: { type: 'number' },
              },
            },
          },
        },
        scale: numericScaleSchema,
        lineHeight: {
          type: 'object',
          additionalProperties: false,
          required: ['display', 'body'],
          properties: {
            display: { type: ['number', 'null'] },
            body: { type: ['number', 'null'] },
          },
        },
      },
    },
    spacing: spacingSchema,
    componentStyle: componentStyleSchema,
  },
}
