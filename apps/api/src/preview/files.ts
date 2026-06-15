import type { GeneratedCodeFile } from '@style-print-jung/shared'
import type { PreviewFileMap, PreviewInput } from './types'
import { buildCss, isCssFile, sanitizeGeneratedCss } from './css'
import { rewritePreviewImports } from './imports'
import { normalizePath } from './paths'
import { addCommonRuntimeStubs, addMissingAliasStubs } from './stubs'
import { buildMain } from './templates'

export function buildPreviewFiles(input: PreviewInput): PreviewFileMap {
  const generatedFiles = normalizeGeneratedFiles(input.files || [])
  const entryPath =
    resolveEntryPath(input.entryFile, generatedFiles) || '/GeneratedComponent.tsx'
  const availablePaths = new Set([
    ...generatedFiles.map((file) => file.path),
    entryPath,
    '/styles.css',
  ])
  const previewFiles: PreviewFileMap = new Map()

  addMissingAliasStubs(generatedFiles, availablePaths, previewFiles)
  addCommonRuntimeStubs(previewFiles)

  generatedFiles.forEach((file) => {
    if (isCssFile(file.path)) {
      previewFiles.set(file.path, sanitizeGeneratedCss(file.code))
      return
    }

    previewFiles.set(
      file.path,
      rewritePreviewImports(file.code, file.path, availablePaths)
    )
  })

  if (!previewFiles.has(entryPath)) {
    previewFiles.set(
      entryPath,
      rewritePreviewImports(input.code, entryPath, availablePaths)
    )
  }

  previewFiles.set('/main.tsx', buildMain(entryPath))
  previewFiles.set('/styles.css', buildCss(generatedFiles))

  return previewFiles
}

function normalizeGeneratedFiles(files: GeneratedCodeFile[]): GeneratedCodeFile[] {
  const seen = new Set<string>()

  return files.flatMap((file) => {
    const normalized = normalizePath(file.path)

    if (!normalized || !file.code || seen.has(normalized)) {
      return []
    }

    seen.add(normalized)
    return [{ path: normalized, code: file.code }]
  })
}

function resolveEntryPath(
  entryFile: string | undefined,
  files: GeneratedCodeFile[]
): string | null {
  const normalized = normalizePath(entryFile)

  if (normalized && files.some((file) => file.path === normalized)) {
    return normalized
  }

  return null
}
