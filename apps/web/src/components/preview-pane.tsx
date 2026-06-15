'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { apiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import type {
  GeneratedCodeFile,
  PreviewBuildResponse,
} from '@/lib/types'

const EMPTY_FILES: GeneratedCodeFile[] = []

interface PreviewPaneProps {
  id: string
  code: string
  files?: GeneratedCodeFile[]
  entryFile?: string
  previewUrl?: string
  className?: string
}

export function PreviewPane({
  id,
  code,
  files,
  entryFile,
  previewUrl,
  className,
}: PreviewPaneProps) {
  const previewFiles = files ?? EMPTY_FILES
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState(previewUrl)
  const [error, setError] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)

  useEffect(() => {
    setResolvedPreviewUrl(previewUrl)
    setError(null)

    if (previewUrl) {
      return
    }

    const controller = new AbortController()

    async function buildPreview() {
      setBuilding(true)

      try {
        const response = await fetch(apiUrl('/api/preview/build'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, code, files: previewFiles, entryFile }),
          signal: controller.signal,
        })
        const data = (await response.json()) as PreviewBuildResponse

        if (!response.ok || !data.success || !data.previewUrl) {
          throw new Error(
            data.error || `Preview build failed (${response.status})`
          )
        }

        setResolvedPreviewUrl(data.previewUrl)
      } catch (err) {
        if (controller.signal.aborted) {
          return
        }

        setError(err instanceof Error ? err.message : 'Preview build failed')
      } finally {
        if (!controller.signal.aborted) {
          setBuilding(false)
        }
      }
    }

    buildPreview()

    return () => controller.abort()
  }, [code, entryFile, id, previewFiles, previewUrl])

  return (
    <div className={cn('overflow-hidden rounded-md border bg-background', className)}>
      {error ? (
        <div className="flex items-start gap-2 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {building && !resolvedPreviewUrl ? (
        <div className="flex h-[620px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building preview...
        </div>
      ) : null}

      {resolvedPreviewUrl ? (
        <iframe
          key={resolvedPreviewUrl}
          title="Generated UI preview"
          src={resolvedPreviewUrl}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          className="block h-[620px] w-full border-0 bg-white"
        />
      ) : null}
    </div>
  )
}
