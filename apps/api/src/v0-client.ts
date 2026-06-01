/**
 * v0 Model API Client
 *
 * Supports both real API calls (when V0_API_KEY is set) and mock responses for testing.
 *
 * API endpoint: https://api.v0.dev/v1/chat/completions
 * Headers: Authorization: Bearer $V0_API_KEY
 */

import type {
  TypographyFacetToken,
  LayoutFacetToken,
  SpacingFacetToken,
  ComponentStyleFacetToken,
} from '@style-print-jung/shared'

const V0_API_URL = 'https://api.v0.dev/v1/chat/completions'
const V0_MODEL = 'v0-1.5-md'

interface V0Message {
  role: 'system' | 'user' | 'assistant'
  content: string | V0ContentPart[]
}

interface V0ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

interface V0Response {
  id: string
  choices: {
    message: {
      role: string
      content: string
    }
  }[]
}

/**
 * Check if API key is configured
 */
export function isV0Configured(): boolean {
  return !!process.env.V0_API_KEY
}

/**
 * Call v0 Model API
 */
async function callV0API(messages: V0Message[]): Promise<string> {
  const apiKey = process.env.V0_API_KEY

  if (!apiKey) {
    throw new Error('V0_API_KEY not configured')
  }

  const response = await fetch(V0_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: V0_MODEL,
      messages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`v0 API error: ${response.status} - ${error}`)
  }

  const data: V0Response = await response.json()
  return data.choices[0]?.message?.content || ''
}

/**
 * Extract typography from image using v0 API or mock
 */
export async function extractTypography(
  imageBase64: string
): Promise<TypographyFacetToken['value']> {
  if (!isV0Configured()) {
    // Return mock data
    return getMockTypography()
  }

  try {
    const response = await callV0API([
      {
        role: 'system',
        content: `You are a UI design analyst. Analyze the typography in UI screenshots and return JSON only.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageBase64 },
          },
          {
            type: 'text',
            text: `Analyze the typography in this UI screenshot. Return a JSON object with this exact structure:
{
  "role": "display" or "body",
  "fontCandidates": [{"name": "font name", "weightHints": [400, 500, 700]}],
  "scale": {"h1": number, "h2": number, "body": number, "caption": number},
  "lineHeight": {"display": number, "body": number}
}
Return ONLY the JSON, no other text.`,
          },
        ],
      },
    ])

    return parseJSONResponse(response, getMockTypography())
  } catch (error) {
    console.error('Typography extraction error:', error)
    return getMockTypography()
  }
}

/**
 * Extract layout from image using v0 API or mock
 */
export async function extractLayout(
  imageBase64: string
): Promise<LayoutFacetToken['value']> {
  if (!isV0Configured()) {
    return getMockLayout()
  }

  try {
    const response = await callV0API([
      {
        role: 'system',
        content: `You are a UI design analyst. Analyze layout patterns in UI screenshots and return JSON only.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageBase64 },
          },
          {
            type: 'text',
            text: `Analyze the layout pattern in this UI screenshot. Return a JSON object with this exact structure:
{
  "pattern": "tabs" | "sidebar" | "cardGrid" | "masterDetail" | "topNav" | "unknown",
  "columns": number or null,
  "density": "compact" | "comfortable" | "unknown",
  "notes": "optional description"
}
Return ONLY the JSON, no other text.`,
          },
        ],
      },
    ])

    return parseJSONResponse(response, getMockLayout())
  } catch (error) {
    console.error('Layout extraction error:', error)
    return getMockLayout()
  }
}

/**
 * Extract mood keywords from image using v0 API or mock
 */
export async function extractMood(imageBase64: string): Promise<string[]> {
  if (!isV0Configured()) {
    return getMockMood()
  }

  try {
    const response = await callV0API([
      {
        role: 'system',
        content: `You are a UI design analyst. Describe the visual mood and style of UI screenshots.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageBase64 },
          },
          {
            type: 'text',
            text: `Describe the visual mood/style of this UI in 3-6 keywords. Return a JSON array of strings only.
Example: ["professional", "minimal", "clean", "modern"]
Return ONLY the JSON array, no other text.`,
          },
        ],
      },
    ])

    const parsed = parseJSONResponse<string[]>(response, getMockMood())
    return Array.isArray(parsed) ? parsed : getMockMood()
  } catch (error) {
    console.error('Mood extraction error:', error)
    return getMockMood()
  }
}

/**
 * Generate UI code from intent spec using v0 API or mock
 */
export async function generateUICode(
  prompt: string,
  mode: 'single' | 'staged' = 'single'
): Promise<string> {
  if (!isV0Configured()) {
    return getMockGeneratedCode()
  }

  try {
    const response = await callV0API([
      {
        role: 'system',
        content: `You are an expert React and Tailwind CSS developer. Generate clean, production-ready code.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ])

    // Extract code from response (might be wrapped in markdown)
    const codeMatch = response.match(/```(?:jsx|tsx|javascript|react)?\n?([\s\S]*?)```/)
    if (codeMatch) {
      return codeMatch[1].trim()
    }

    return response
  } catch (error) {
    console.error('Code generation error:', error)
    return getMockGeneratedCode()
  }
}

// Helper to parse JSON responses with fallback
function parseJSONResponse<T>(response: string, fallback: T): T {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return JSON.parse(response)
  } catch {
    console.warn('Failed to parse JSON response, using fallback')
    return fallback
  }
}

// Mock data generators
function getMockTypography(): TypographyFacetToken['value'] {
  return {
    role: 'display',
    fontCandidates: [
      { name: 'Inter', weightHints: [400, 500, 600, 700] },
      { name: 'system-ui', weightHints: [400, 500, 700] },
      { name: 'SF Pro Display', weightHints: [400, 600] },
    ],
    scale: { h1: 48, h2: 32, body: 16, caption: 12 },
    lineHeight: { display: 1.2, body: 1.5 },
  }
}

function getMockLayout(): LayoutFacetToken['value'] {
  return {
    pattern: 'cardGrid',
    columns: 3,
    density: 'comfortable',
    notes: 'Responsive grid layout with card components',
  }
}

function getMockMood(): string[] {
  return ['professional', 'clean', 'modern', 'minimal']
}

function getMockGeneratedCode(): string {
  return `export default function GeneratedComponent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">
          Welcome to Your App
        </h1>
        <p className="text-slate-600 text-lg">
          A beautiful, modern interface built with your design tokens
        </p>
      </header>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Feature {item}
            </h3>
            <p className="text-slate-600 text-sm">
              This is a brief description of feature {item}. It highlights the key benefits.
            </p>
            <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Learn More
            </button>
          </div>
        ))}
      </div>

      {/* Stats Section */}
      <section className="mt-12 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Key Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Users', value: '12,345' },
            { label: 'Active Projects', value: '234' },
            { label: 'Completion Rate', value: '98.5%' },
            { label: 'Avg. Response', value: '1.2s' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="mt-12 bg-blue-600 rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">
          Ready to Get Started?
        </h2>
        <p className="text-blue-100 mb-6 max-w-xl mx-auto">
          Join thousands of users who are already building amazing products with our platform.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-6 py-3 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors">
            Start Free Trial
          </button>
          <button className="px-6 py-3 bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 transition-colors">
            Contact Sales
          </button>
        </div>
      </section>
    </div>
  );
}`
}
