import type { ReferenceAsset } from './types'
import { apiAssetUrl } from './api'

export function getReferenceImageSrc(
  reference?: Pick<ReferenceAsset, 'dataUrl' | 'url'> | null
): string | undefined {
  return apiAssetUrl(reference?.url) || reference?.dataUrl
}
