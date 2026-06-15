import { promises as fs } from 'fs'
import path from 'path'
import type { PreviewArtifactFile, PreviewInput } from './types'
import { bundlePreview } from './bundle'
import { buildPreviewFiles } from './files'
import {
  getPreviewContentType,
  normalizePath,
  publicPreviewRoot,
  sanitizePreviewId,
  sourcePreviewRoot,
} from './paths'
import { buildPreviewHtml } from './templates'

export async function writePreviewArtifact(input: PreviewInput): Promise<string> {
  const previewId = sanitizePreviewId(input.id)
  const sourceDir = path.join(sourcePreviewRoot, previewId)
  const publicDir = path.join(publicPreviewRoot, previewId)
  const files = buildPreviewFiles(input)

  await fs.rm(sourceDir, { recursive: true, force: true })
  await fs.rm(publicDir, { recursive: true, force: true })
  await fs.mkdir(sourceDir, { recursive: true })
  await fs.mkdir(publicDir, { recursive: true })

  for (const [previewPath, code] of files) {
    await writePreviewFile(sourceDir, previewPath, code)
  }

  const bundle = await bundlePreview(path.join(sourceDir, 'main.tsx'), publicDir)
  const cacheKey = Date.now()

  await fs.writeFile(path.join(publicDir, 'preview.js'), bundle.js, 'utf8')
  if (bundle.css) {
    await fs.writeFile(path.join(publicDir, 'preview.css'), bundle.css, 'utf8')
  }
  await fs.writeFile(
    path.join(publicDir, 'index.html'),
    buildPreviewHtml(cacheKey, Boolean(bundle.css)),
    'utf8'
  )

  return `/generated-previews/${previewId}/index.html?t=${cacheKey}`
}

export async function readPreviewArtifactFile(
  id: string,
  filename: string
): Promise<PreviewArtifactFile | null> {
  const previewId = sanitizePreviewId(id)
  const safeName = path.basename(filename)

  if (
    filename !== safeName ||
    !['index.html', 'preview.js', 'preview.css', 'screenshot.png'].includes(safeName)
  ) {
    return null
  }

  try {
    const buffer = await fs.readFile(path.join(publicPreviewRoot, previewId, safeName))
    return { buffer, contentType: getPreviewContentType(safeName) }
  } catch {
    return null
  }
}

async function writePreviewFile(
  rootDir: string,
  previewPath: string,
  code: string
) {
  const normalized = normalizePath(previewPath)

  if (!normalized) {
    return
  }

  const filePath = path.join(rootDir, normalized)

  if (!filePath.startsWith(rootDir)) {
    throw new Error(`Invalid preview file path: ${previewPath}`)
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, code, 'utf8')
}
