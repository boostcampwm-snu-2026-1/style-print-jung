const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || ''

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}

export function apiAssetUrl(path?: string): string | undefined {
  if (!path) return undefined
  if (/^(https?:|data:|blob:)/.test(path)) return path
  return apiUrl(path)
}
