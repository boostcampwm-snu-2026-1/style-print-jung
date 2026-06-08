import { config, requireConfig } from './config'
import { INTENT_EXPORT_SYSTEM_PROMPT } from './prompts/intent-export'

interface V0Message {
  role: 'system' | 'user' | 'assistant'
  content: string
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

interface V0ChatResponse {
  latestVersion?: {
    files?: V0GeneratedFile[]
  }
  messages?: {
    role: string
    content?: string
  }[]
}

interface V0GeneratedFile {
  name?: string
  content?: string
  lang?: string
}

const V0_REQUEST_TIMEOUT_MS = 300_000

export async function generateUICode(
  prompt: string,
  _mode: 'single' | 'staged' = 'single'
): Promise<string> {
  const system = INTENT_EXPORT_SYSTEM_PROMPT
  const messages: V0Message[] = [
    {
      role: 'system',
      content: system,
    },
    {
      role: 'user',
      content: prompt,
    },
  ]

  const response = config.v0.apiUrl.includes('/chat/completions')
    ? await callV0ModelAPI(messages)
    : await callV0PlatformAPI(system, prompt)

  const codeMatch = response.match(/```(?:jsx|tsx|javascript|react)?\n?([\s\S]*?)```/)
  if (codeMatch) {
    return codeMatch[1].trim()
  }

  return response
}

async function callV0ModelAPI(messages: V0Message[]): Promise<string> {
  const apiKey = requireConfig('V0_API_KEY', config.v0.apiKey)

  const response = await fetch(config.v0.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.v0.model,
      messages,
    }),
    signal: AbortSignal.timeout(V0_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`v0 API error: ${response.status} - ${error}`)
  }

  const data: V0Response = await response.json()
  const content = data.choices[0]?.message?.content
  if (!content) {
    throw new Error('v0 response did not include message content')
  }

  return content
}

async function callV0PlatformAPI(system: string, message: string): Promise<string> {
  const apiKey = requireConfig('V0_API_KEY', config.v0.apiKey)

  const response = await fetch(config.v0.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      system,
      message,
      responseMode: 'sync',
      modelConfiguration: {
        modelId: getPlatformModelId(config.v0.model),
        imageGenerations: false,
        thinking: false,
      },
    }),
    signal: AbortSignal.timeout(V0_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`v0 API error: ${response.status} - ${error}`)
  }

  const data: V0ChatResponse = await response.json()
  const generatedFiles = data.latestVersion?.files || []
  const preferredFile = selectGeneratedUIFile(generatedFiles)

  if (preferredFile?.content) {
    return preferredFile.content
  }

  const assistantMessage = data.messages
    ?.slice()
    .reverse()
    .find((entry) => entry.role === 'assistant' && entry.content)

  if (assistantMessage?.content) {
    return assistantMessage.content
  }

  throw new Error('v0 response did not include generated code content')
}

function selectGeneratedUIFile(files: V0GeneratedFile[]): V0GeneratedFile | undefined {
  const candidates = files.filter(
    (file) => file.content && isCodeFile(file) && !isGeneratedShellFile(file)
  )
  return candidates.sort((a, b) => scoreGeneratedFile(b) - scoreGeneratedFile(a))[0]
}

function isCodeFile(file: V0GeneratedFile): boolean {
  const name = file.name || ''
  return /\.(tsx|jsx|ts|js)$/.test(name) || /tsx|jsx|javascript|typescript/i.test(file.lang || '')
}

function scoreGeneratedFile(file: V0GeneratedFile): number {
  const name = (file.name || '').toLowerCase()
  const content = file.content || ''
  let score = 0

  if (/\/?app\/page\.(tsx|jsx)$/.test(name) || /(^|\/)page\.(tsx|jsx)$/.test(name)) score += 100
  if (/\/?components?\//.test(name)) score += 60
  if (/export\s+default\s+function/.test(content)) score += 30
  if (/className=/.test(content)) score += 20
  if (/\.(tsx|jsx)$/.test(name)) score += 10

  return score
}

function isGeneratedShellFile(file: V0GeneratedFile): boolean {
  const name = (file.name || '').toLowerCase()
  const content = file.content || ''
  return (
    /(^|\/)layout\.(tsx|jsx)$/.test(name) ||
    /(^|\/)(globals|global)\.css$/.test(name) ||
    /(^|\/)(next\.config|package|tsconfig)/.test(name) ||
    /metadata|RootLayout|@vercel\/analytics/.test(content)
  )
}

function getPlatformModelId(model: string): string {
  const platformModels = new Set(['v0-auto', 'v0-mini', 'v0-pro', 'v0-max', 'v0-max-fast'])
  if (platformModels.has(model)) {
    return model
  }

  return 'v0-auto'
}
