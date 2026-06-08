'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { apiUrl } from '@/lib/api'
import { getReferenceImageSrc } from '@/lib/references'
import type { ReferenceAsset } from '@/lib/types'

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

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return

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
    [onUploadComplete]
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
    disabled: uploading,
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
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
          <div className="text-lg font-medium">
            {isDragActive
              ? 'Drop images here'
              : uploading
                ? 'Uploading...'
                : 'Drag & drop design assets'}
          </div>
          <p className="text-sm text-muted-foreground">
            UI screenshots, web/app captures, logos, color palettes, brand moodboards, and simple SVG/PNG/JPEG/WebP assets
          </p>
          <p className="text-xs text-muted-foreground">
            Up to 100MB each
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
              <Card key={ref.id} className="group relative overflow-hidden">
                <CardContent className="p-0">
                  {referenceImageSrc ? (
                    <img
                      src={referenceImageSrc}
                      alt={ref.filename}
                      className="w-full h-40 object-cover"
                    />
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center bg-muted">
                      <ImageIcon className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
