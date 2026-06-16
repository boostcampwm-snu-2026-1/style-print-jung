import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config()

const webOrigins = parseCsv(process.env.WEB_ORIGIN || 'http://localhost:5173')

export const config = {
  api: {
    port: Number(process.env.PORT || process.env.API_PORT || 4000),
    webOrigin: webOrigins[0] || 'http://localhost:5173',
    webOrigins,
  },
  upload: {
    maxFileSize: 100 * 1024 * 1024,
    dir: path.join(process.cwd(), 'public', 'uploads'),
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    mimeExtensions: {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    } as Record<string, string>,
  },
  openai: {
    apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    judgeModel: process.env.OPENAI_JUDGE_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  },
  v0: {
    apiUrl: process.env.V0_API_URL || 'https://api.v0.dev/v1/chats',
    apiKey: process.env.V0_API_KEY || '',
    model: process.env.V0_MODEL || 'v0-mini',
  },
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

export function requireConfig(name: string, value: string): string {
  if (!value.trim()) {
    throw new Error(`${name} is required`)
  }

  return value
}
