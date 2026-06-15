import chroma from 'chroma-js'
import sharp from 'sharp'
import type { ColorFacetToken, ColorRole, Evidence } from '@style-print-jung/shared'
import { nanoid } from 'nanoid'

/**
 * Extract dominant colors from an image using k-means clustering
 */
export async function extractColorsFromBase64(
  base64Data: string,
  numColors: number = 6
): Promise<{ hex: string; frequency: number }[]> {
  const buffer = dataUrlToBuffer(base64Data)
  const { data, info } = await sharp(buffer)
    .resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels: [number, number, number][] = []
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = data[i + 3]
    if (alpha > 128) {
      pixels.push([data[i], data[i + 1], data[i + 2]])
    }
  }

  return kMeansClustering(pixels, numColors)
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/i)
  return Buffer.from(match?.[1] ?? dataUrl, 'base64')
}

/**
 * Assign semantic roles to extracted colors
 */
export function assignColorRoles(
  colors: { hex: string; frequency: number }[]
): ColorFacetToken[] {
  const tokens: ColorFacetToken[] = []
  const evidence: Evidence = { refId: '' } // Will be set by caller

  // Sort by luminance to identify background/text candidates
  const sortedByLum = [...colors].sort((a, b) => {
    return chroma(b.hex).luminance() - chroma(a.hex).luminance()
  })

  // Lightest color is likely background
  if (sortedByLum.length > 0) {
    const bgColor = sortedByLum[0]
    tokens.push(createColorToken('background', bgColor.hex, evidence))
  }

  // Darkest color is likely text
  if (sortedByLum.length > 1) {
    const textColor = sortedByLum[sortedByLum.length - 1]
    tokens.push(createColorToken('text', textColor.hex, evidence))
  }

  // Most frequent non-background/text color is primary
  const remainingColors = colors.filter(
    (c) =>
      c.hex !== sortedByLum[0]?.hex &&
      c.hex !== sortedByLum[sortedByLum.length - 1]?.hex
  )

  if (remainingColors.length > 0) {
    // Most saturated remaining color is primary
    const sortedBySat = [...remainingColors].sort((a, b) => {
      const satA = chroma(a.hex).get('hsl.s')
      const satB = chroma(b.hex).get('hsl.s')
      return satB - satA
    })

    tokens.push(createColorToken('primary', sortedBySat[0].hex, evidence))

    if (sortedBySat.length > 1) {
      tokens.push(createColorToken('secondary', sortedBySat[1].hex, evidence))
    }

    if (sortedBySat.length > 2) {
      tokens.push(createColorToken('accent', sortedBySat[2].hex, evidence))
    }
  }

  // Add surface color (slightly darker than background)
  if (sortedByLum.length > 0) {
    const bgLum = chroma(sortedByLum[0].hex).luminance()
    const surfaceColor = chroma(sortedByLum[0].hex)
      .luminance(Math.max(0, bgLum - 0.05))
      .hex()
    tokens.push(createColorToken('surface', surfaceColor, evidence))
  }

  return tokens
}

function createColorToken(
  role: ColorRole,
  hex: string,
  evidence: Evidence
): ColorFacetToken {
  return {
    id: nanoid(),
    facetType: 'color',
    role: `color.${role}`,
    confidence: 0.8,
    evidence,
    value: {
      hex,
      role,
    },
  }
}

/**
 * Calculate WCAG contrast ratio between two colors
 */
export function calculateContrastRatio(fg: string, bg: string): number {
  const fgLum = chroma(fg).luminance()
  const bgLum = chroma(bg).luminance()

  const lighter = Math.max(fgLum, bgLum)
  const darker = Math.min(fgLum, bgLum)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check if contrast ratio meets WCAG standards
 */
export function checkWCAGCompliance(ratio: number): {
  aa: boolean
  aaLarge: boolean
  aaa: boolean
  aaaLarge: boolean
} {
  return {
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  }
}

/**
 * Adjust color to meet minimum contrast ratio
 */
export function adjustForContrast(
  fg: string,
  bg: string,
  targetRatio: number = 4.5
): string {
  const bgLum = chroma(bg).luminance()
  let adjusted = chroma(fg)

  // Determine if we need to darken or lighten
  const shouldDarken = bgLum > 0.5

  for (let i = 0; i < 20; i++) {
    const currentRatio = calculateContrastRatio(adjusted.hex(), bg)
    if (currentRatio >= targetRatio) {
      return adjusted.hex()
    }

    if (shouldDarken) {
      adjusted = adjusted.darken(0.1)
    } else {
      adjusted = adjusted.brighten(0.1)
    }
  }

  return adjusted.hex()
}

// For client-side color extraction with Canvas
export function extractColorsFromCanvas(
  canvas: HTMLCanvasElement,
  numColors: number = 6
): { hex: string; frequency: number }[] {
  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels: [number, number, number][] = []

  // Sample every nth pixel for performance
  const step = Math.max(1, Math.floor(imageData.data.length / 4 / 10000))

  for (let i = 0; i < imageData.data.length; i += 4 * step) {
    const r = imageData.data[i]
    const g = imageData.data[i + 1]
    const b = imageData.data[i + 2]
    const a = imageData.data[i + 3]

    // Skip transparent pixels
    if (a > 128) {
      pixels.push([r, g, b])
    }
  }

  // Simple k-means clustering
  return kMeansClustering(pixels, numColors)
}

// Simple k-means implementation
function kMeansClustering(
  pixels: [number, number, number][],
  k: number
): { hex: string; frequency: number }[] {
  if (pixels.length === 0) return []

  const centroids: [number, number, number][] = []
  const centroidCount = Math.min(k, pixels.length)
  for (let i = 0; i < centroidCount; i++) {
    const idx =
      centroidCount === 1
        ? 0
        : Math.floor((i * (pixels.length - 1)) / (centroidCount - 1))
    centroids.push([...pixels[idx]])
  }

  const maxIterations = 10
  let assignments: number[] = new Array(pixels.length).fill(0)

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign pixels to nearest centroid
    const newAssignments = pixels.map((pixel) => {
      let minDist = Infinity
      let nearest = 0
      for (let c = 0; c < centroids.length; c++) {
        const dist = colorDistance(pixel, centroids[c])
        if (dist < minDist) {
          minDist = dist
          nearest = c
        }
      }
      return nearest
    })

    // Check for convergence
    if (arraysEqual(assignments, newAssignments)) break
    assignments = newAssignments

    // Update centroids
    for (let c = 0; c < centroids.length; c++) {
      const assigned = pixels.filter((_, i) => assignments[i] === c)
      if (assigned.length > 0) {
        centroids[c] = [
          Math.round(assigned.reduce((s, p) => s + p[0], 0) / assigned.length),
          Math.round(assigned.reduce((s, p) => s + p[1], 0) / assigned.length),
          Math.round(assigned.reduce((s, p) => s + p[2], 0) / assigned.length),
        ]
      }
    }
  }

  // Count assignments and return colors
  const counts = new Array(centroids.length).fill(0)
  assignments.forEach((a) => counts[a]++)
  const total = assignments.length

  return centroids
    .map((c, i) => ({
      hex: chroma(c[0], c[1], c[2]).hex(),
      frequency: counts[i] / total,
    }))
    .filter((c) => c.frequency > 0)
    .sort((a, b) => b.frequency - a.frequency)
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
    Math.pow(a[1] - b[1], 2) +
    Math.pow(a[2] - b[2], 2)
  )
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
