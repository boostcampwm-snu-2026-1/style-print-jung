import path from 'path'

export const workspaceRoot = process.cwd()
export const sourcePreviewRoot = path.join(workspaceRoot, '.styleprint-preview')
export const publicPreviewRoot = path.join(
  workspaceRoot,
  'apps',
  'web',
  'public',
  'generated-previews'
)

export function sanitizePreviewId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function getPreviewContentType(filename: string): string {
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filename.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filename.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

export function normalizePath(filePath?: string): string | null {
  const normalized = filePath?.trim().replace(/\\/g, '/').replace(/^\/+/, '')

  if (!normalized || normalized.includes('\0')) {
    return null
  }

  return `/${normalized}`
}

export function stripJsExtension(filePath: string): string {
  return filePath.replace(/\.(tsx|jsx|ts|js)$/, '')
}

export function dirname(filePath: string): string {
  const index = filePath.lastIndexOf('/')
  return index <= 0 ? '/' : filePath.slice(0, index)
}

export function toImportSpecifier(fromPath: string, targetPath: string): string {
  const fromParts = dirname(fromPath).split('/').filter(Boolean)
  const targetParts = stripJsExtension(targetPath).split('/').filter(Boolean)
  let shared = 0

  while (
    shared < fromParts.length &&
    shared < targetParts.length &&
    fromParts[shared] === targetParts[shared]
  ) {
    shared += 1
  }

  const relativeParts = [
    ...fromParts.slice(shared).map(() => '..'),
    ...targetParts.slice(shared),
  ]
  const relativePath = relativeParts.join('/') || '.'

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
