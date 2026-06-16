'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { apiUrl } from '@/lib/api'
import { getReferenceImageSrc } from '@/lib/references'
import type { ReferenceAsset } from '@/lib/types'

const MAX_REFERENCE_ASSETS = 10

interface ReferenceUploaderProps {
  onUploadComplete?: (references: ReferenceAsset[]) => void
  existingReferences?: ReferenceAsset[]
  onDeleteReference?: (id: string) => void
}

export function ReferenceUploader({
  onUploadComplete,
  existingReferences = [],
  onDeleteReference,
}: ReferenceUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remainingSlots = Math.max(0, MAX_REFERENCE_ASSETS - existingReferences.length)

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return

      if (acceptedFiles.length > remainingSlots) {
        setError(`Upload limit reached. Keep ${MAX_REFERENCE_ASSETS} or fewer reference images.`)
        return
      }

      setUploading(true)
      setError(null)

      try {
        const formData = new FormData()
        acceptedFiles.forEach((file) => {
          formData.append('files', file)
        })

        // Upload to API
        const response = await fetch(apiUrl('/api/references/upload'), {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()

        if (!data.success) {
          setError(data.error || 'Upload failed')
          return
        }

        onUploadComplete?.(data.references)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [onUploadComplete, remainingSlots]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
      'image/svg+xml': ['.svg'],
    },
    maxSize: 100 * 1024 * 1024, // 100MB
    maxFiles: remainingSlots,
    disabled: uploading || remainingSlots === 0,
  })

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(apiUrl(`/api/references/upload?id=${id}`), {
        method: 'DELETE',
      })
      const data = await response.json()
      if (data.success) {
        onDeleteReference?.(id)
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={cn(
          'group relative overflow-hidden rounded-lg border-2 border-dashed p-8 text-center transition-all duration-300',
          isDragActive
            ? 'border-primary bg-[linear-gradient(135deg,#fff0f4,#eef4ff)] shadow-accent'
            : 'cursor-pointer border-muted-foreground/25 bg-[linear-gradient(135deg,#ffffff,#fff7fa_48%,#f8fafc)] hover:border-primary/50 hover:shadow-[0_16px_35px_rgba(15,23,42,0.1)]',
          uploading && 'cursor-not-allowed opacity-70'
        )}
      >
        <input {...getInputProps()} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#ff4267,#2563eb,#10b981)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <div className="rounded-full bg-white p-3 shadow-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-full bg-[linear-gradient(135deg,#151826,#334155)] p-3 text-white shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5">
              <Upload className="h-8 w-8" />
            </div>
          )}
          <div className="text-lg font-medium">
            {remainingSlots === 0
              ? 'Reference limit reached'
              : isDragActive
              ? 'Drop images here'
              : uploading
                ? 'Uploading...'
                : 'Drag & drop design assets'}
          </div>
          <p className="text-sm text-muted-foreground">
            UI screenshots, web/app captures, logos, color palettes, brand moodboards, and simple SVG/PNG/JPEG/WebP assets
          </p>
          <p className="text-xs text-muted-foreground">
            Up to {MAX_REFERENCE_ASSETS} images total, 100MB each
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      )}

      {/* Existing References Grid */}
      {existingReferences.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {existingReferences.map((ref) => {
            const referenceImageSrc = getReferenceImageSrc(ref)

            return (
              <div
                key={ref.id}
                className="group relative overflow-hidden rounded-lg border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(15,23,42,0.14)]"
              >
                <div className="p-0">
                  {referenceImageSrc ? (
                    <img
                      src={referenceImageSrc}
                      alt={ref.filename}
                      className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-muted">
                      <ImageIcon className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-[#151826]/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(ref.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                    <p className="text-xs text-white truncate">
                      Ref #{ref.id.slice(0, 6)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
