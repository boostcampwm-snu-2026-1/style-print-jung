import path from 'path'
import { pathToFileURL } from 'url'
import type { Browser, PlaywrightModule, ScreenshotResult } from './types'
import { publicPreviewRoot, sanitizePreviewId } from './paths'

export async function capturePreviewScreenshot(input: {
  id: string
  previewUrl: string
  webOrigin: string
}): Promise<ScreenshotResult> {
  const previewId = sanitizePreviewId(input.id)
  const publicDir = path.join(publicPreviewRoot, previewId)
  const screenshotPath = path.join(publicDir, 'screenshot.png')
  const screenshotUrl = `/generated-previews/${previewId}/screenshot.png?t=${Date.now()}`

  const playwright = await loadPlaywright()
  if (!playwright?.chromium) {
    return { error: 'Playwright is not installed' }
  }

  const urls = [
    new URL(input.previewUrl, input.webOrigin).toString(),
    pathToFileURL(path.join(publicDir, 'index.html')).toString(),
  ]

  let browser: Browser | null = null
  let lastError = ''

  try {
    browser = await playwright.chromium.launch({ headless: true })

    for (const url of urls) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 })
        await page.screenshot({ path: screenshotPath, fullPage: true })
        await page.close()
        return { screenshotUrl }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Screenshot capture failed'
        await page.close().catch(() => undefined)
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Screenshot capture failed'
  } finally {
    await browser?.close().catch(() => undefined)
  }

  return { error: lastError || 'Screenshot capture failed' }
}

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (
      specifier: string
    ) => Promise<PlaywrightModule>
    return await dynamicImport('playwright')
  } catch {
    return null
  }
}
