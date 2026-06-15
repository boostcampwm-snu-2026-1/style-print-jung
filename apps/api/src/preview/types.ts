import type { GeneratedCodeFile } from '@style-print-jung/shared'

export type PreviewInput = {
  id: string
  code: string
  files?: GeneratedCodeFile[]
  entryFile?: string
}

export type PreviewFileMap = Map<string, string>

export type ScreenshotResult = {
  screenshotUrl?: string
  error?: string
}

export type PreviewArtifactFile = {
  buffer: Buffer
  contentType: string
}

export type BrowserPage = {
  goto: (url: string, options: { waitUntil: 'networkidle'; timeout: number }) => Promise<unknown>
  screenshot: (options: { path: string; fullPage: boolean }) => Promise<unknown>
  close: () => Promise<unknown>
}

export type Browser = {
  newPage: (options: { viewport: { width: number; height: number } }) => Promise<BrowserPage>
  close: () => Promise<unknown>
}

export type PlaywrightModule = {
  chromium?: {
    launch: (options: { headless: boolean }) => Promise<Browser>
  }
}
