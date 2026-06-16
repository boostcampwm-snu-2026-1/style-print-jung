'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Search, Minus, Plus } from 'lucide-react'
import { apiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  GeneratedCodeFile,
  PreviewBuildResponse,
} from '@/lib/types'

const EMPTY_FILES: GeneratedCodeFile[] = []
const PREVIEW_HEIGHT = 620
const PREVIEW_ZOOM_OPTIONS = [
  { value: 1, label: '100%' },
  { value: 0.75, label: '75%' },
  { value: 0.5, label: '50%' },
] as const
type PreviewZoom = (typeof PREVIEW_ZOOM_OPTIONS)[number]['value']

function getPreviewZoom(value: string): PreviewZoom {
  return (
    PREVIEW_ZOOM_OPTIONS.find((option) => String(option.value) === value)
      ?.value ?? 1
  )
}

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
  const [previewZoom, setPreviewZoom] = useState<PreviewZoom>(1)
  const [iframeReady, setIframeReady] = useState(false)

  useEffect(() => {
    setResolvedPreviewUrl(previewUrl)
    setError(null)
    setIframeReady(false)

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

  const zoomLabel =
    PREVIEW_ZOOM_OPTIONS.find((option) => option.value === previewZoom)?.label ??
    '100%'

  const shiftZoom = (delta: 1 | -1) => {
    const nextIndex = PREVIEW_ZOOM_OPTIONS.findIndex(
      (option) => option.value === previewZoom
    )
    const targetIndex = Math.min(
      PREVIEW_ZOOM_OPTIONS.length - 1,
      Math.max(0, nextIndex + delta)
    )
    setPreviewZoom(PREVIEW_ZOOM_OPTIONS[targetIndex]?.value ?? 1)
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.12)]',
        className
      )}
    >
      {error ? (
        <div className="flex items-start gap-2 border-b border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {building && !resolvedPreviewUrl ? (
        <div className="preview-canvas flex h-[620px] items-center justify-center text-sm text-muted-foreground">
          <div className="rounded-xl border bg-white/92 px-6 py-5 text-center shadow-sm backdrop-blur">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
            <p className="font-medium text-foreground">Building preview...</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Rendering generated UI artifact
            </p>
          </div>
        </div>
      ) : null}

      {resolvedPreviewUrl ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-[linear-gradient(135deg,#151826,#1f2937)] px-3 py-2 text-white">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5c7a]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200">
                  Live preview
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  Rendered from generated code
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-white/15 bg-white/10 text-[11px] text-slate-100 backdrop-blur"
              >
                {zoomLabel}
              </Badge>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-md text-slate-200 hover:bg-white/10 hover:text-white"
                onClick={() => shiftZoom(1)}
                disabled={previewZoom === PREVIEW_ZOOM_OPTIONS[PREVIEW_ZOOM_OPTIONS.length - 1]?.value}
                aria-label="Zoom out preview"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-md text-slate-200 hover:bg-white/10 hover:text-white"
                onClick={() => shiftZoom(-1)}
                disabled={previewZoom === PREVIEW_ZOOM_OPTIONS[0]?.value}
                aria-label="Zoom in preview"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300"
                />
                <select
                  aria-label="Preview zoom"
                  value={String(previewZoom)}
                  onChange={(event) =>
                    setPreviewZoom(getPreviewZoom(event.target.value))
                  }
                  className="h-8 rounded-md border border-white/15 bg-white/10 py-0 pl-8 pr-8 text-sm text-white ring-offset-[#151826] backdrop-blur focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2"
                >
                  {PREVIEW_ZOOM_OPTIONS.map((option) => (
                    <option key={option.value} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="preview-canvas relative h-[620px] overflow-hidden">
            {!iframeReady ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                <div className="rounded-xl border bg-white px-5 py-4 text-center shadow-sm">
                  <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-primary" />
                  <p className="text-sm font-medium text-foreground">
                    Loading canvas
                  </p>
                </div>
              </div>
            ) : null}
            <iframe
              key={resolvedPreviewUrl}
              title="Generated UI preview"
              src={resolvedPreviewUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={() => setIframeReady(true)}
              className={cn(
                'block border-0 bg-white shadow-sm transition-opacity duration-300',
                iframeReady ? 'opacity-100' : 'opacity-0'
              )}
              style={{
                width: `${100 / previewZoom}%`,
                height: `${PREVIEW_HEIGHT / previewZoom}px`,
                transform: `scale(${previewZoom})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
