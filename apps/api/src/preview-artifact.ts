import { promises as fs } from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { build } from 'esbuild'
import type { GeneratedCodeFile } from '@style-print-jung/shared'

type PreviewInput = {
  id: string
  code: string
  files?: GeneratedCodeFile[]
  entryFile?: string
}

type PreviewFileMap = Map<string, string>

type ScreenshotResult = {
  screenshotUrl?: string
  error?: string
}

type PreviewArtifactFile = {
  buffer: Buffer
  contentType: string
}

type BrowserPage = {
  goto: (url: string, options: { waitUntil: 'networkidle'; timeout: number }) => Promise<unknown>
  screenshot: (options: { path: string; fullPage: boolean }) => Promise<unknown>
  close: () => Promise<unknown>
}

type Browser = {
  newPage: (options: { viewport: { width: number; height: number } }) => Promise<BrowserPage>
  close: () => Promise<unknown>
}

type PlaywrightModule = {
  chromium?: {
    launch: (options: { headless: boolean }) => Promise<Browser>
  }
}

const workspaceRoot = process.cwd()
const sourcePreviewRoot = path.join(workspaceRoot, '.styleprint-preview')
const publicPreviewRoot = path.join(
  workspaceRoot,
  'apps',
  'web',
  'public',
  'generated-previews'
)

export async function writePreviewArtifact(input: PreviewInput): Promise<string> {
  const previewId = sanitizePreviewId(input.id)
  const sourceDir = path.join(sourcePreviewRoot, previewId)
  const publicDir = path.join(publicPreviewRoot, previewId)
  const files = buildPreviewFiles(input)

  await fs.rm(sourceDir, { recursive: true, force: true })
  await fs.rm(publicDir, { recursive: true, force: true })
  await fs.mkdir(sourceDir, { recursive: true })
  await fs.mkdir(publicDir, { recursive: true })

  for (const [previewPath, code] of files) {
    await writePreviewFile(sourceDir, previewPath, code)
  }

  const bundle = await bundlePreview(path.join(sourceDir, 'main.tsx'), publicDir)
  const cacheKey = Date.now()

  await fs.writeFile(path.join(publicDir, 'preview.js'), bundle.js, 'utf8')
  if (bundle.css) {
    await fs.writeFile(path.join(publicDir, 'preview.css'), bundle.css, 'utf8')
  }
  await fs.writeFile(
    path.join(publicDir, 'index.html'),
    buildPreviewHtml(cacheKey, Boolean(bundle.css)),
    'utf8'
  )

  return `/generated-previews/${previewId}/index.html?t=${cacheKey}`
}

export async function readPreviewArtifactFile(
  id: string,
  filename: string
): Promise<PreviewArtifactFile | null> {
  const previewId = sanitizePreviewId(id)
  const safeName = path.basename(filename)

  if (!['index.html', 'preview.js', 'preview.css', 'screenshot.png'].includes(safeName)) {
    return null
  }

  try {
    const buffer = await fs.readFile(path.join(publicPreviewRoot, previewId, safeName))
    return { buffer, contentType: getPreviewContentType(safeName) }
  } catch {
    return null
  }
}

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

// Compile the generated component (plus React) into a single self-contained
// IIFE bundle. This deliberately avoids the Vite dev server's on-the-fly `/@fs`
// transform, which injects `@vitejs/plugin-react` Fast Refresh code that only
// works when its preamble is present in a Vite-processed HTML entry. Our preview
// HTML is a static file, so that preamble is never injected and the runtime
// throws "can't detect preamble". A pre-built bundle has no such dependency and
// renders identically in dev and in a static (Vercel) deployment.
async function bundlePreview(
  entryFile: string,
  outDir: string
): Promise<{ js: string; css?: string }> {
  const result = await build({
    entryPoints: [entryFile],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    loader: { '.css': 'css' },
    absWorkingDir: workspaceRoot,
    outdir: outDir,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  })

  let js = ''
  let css: string | undefined

  for (const file of result.outputFiles) {
    if (file.path.endsWith('.css')) {
      css = file.text
    } else if (file.path.endsWith('.js')) {
      js = file.text
    }
  }

  return { js, css }
}

function buildPreviewFiles(input: PreviewInput): PreviewFileMap {
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

function buildMain(entryPath: string): string {
  const entryImport = toImportSpecifier('/main.tsx', entryPath)

  return `
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import GeneratedComponent from '${entryImport}';

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="preview-error">
          <h1>Preview failed</h1>
          <pre>{this.state.error.message}</pre>
        </main>
      );
    }

    return this.props.children;
  }
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Preview root element not found');
}

createRoot(root).render(
  <React.StrictMode>
    <PreviewErrorBoundary>
      <GeneratedComponent />
    </PreviewErrorBoundary>
  </React.StrictMode>
);
`
}

function buildCss(files: GeneratedCodeFile[]): string {
  const generatedCss = files
    .filter((file) => isCssFile(file.path))
    .map((file) => sanitizeGeneratedCss(file.code))
    .filter(Boolean)
    .join('\n\n')

  // Fonts are loaded via <link> in the preview HTML head, so no @import here —
  // a stray @import after these rules violates the CSS spec ("@import must
  // precede all other statements") and breaks the esbuild CSS bundle.
  return `
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --border: 214.3 31.8% 91.4%;
  --radius: 0.5rem;
}

* {
  box-sizing: border-box;
  border-color: hsl(var(--border));
}

html,
body,
#root {
  min-height: 100%;
  margin: 0;
}

body {
  font-family: 'Inter', 'Noto Sans KR', system-ui, sans-serif;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.preview-error {
  padding: 24px;
  color: #991b1b;
  background: #fef2f2;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.min-h-screen { min-height: 100vh; }
.w-full { width: 100%; }
.h-full { height: 100%; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.block { display: block; }
.inline-block { display: inline-block; }
.grid { display: grid; }
.hidden { display: none; }
.flex-col { flex-direction: column; }
.flex-row { flex-direction: row; }
.flex-wrap { flex-wrap: wrap; }
.items-start { align-items: flex-start; }
.items-center { align-items: center; }
.items-end { align-items: flex-end; }
.justify-start { justify-content: flex-start; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.text-center { text-align: center; }
.font-sans { font-family: 'Inter', 'Noto Sans KR', system-ui, sans-serif; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.uppercase { text-transform: uppercase; }
.rounded-full { border-radius: 9999px; }
.rounded-lg { border-radius: var(--radius); }
.rounded-md { border-radius: calc(var(--radius) - 2px); }
.border { border-width: 1px; border-style: solid; }
.shadow-sm { box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
.shadow-md { box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); }
.transition-all { transition-property: all; }
.transition-colors { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; }
.duration-150 { transition-duration: 150ms; }
.duration-200 { transition-duration: 200ms; }
.bg-background { background-color: hsl(var(--background)); }
.bg-card { background-color: hsl(var(--card)); }
.bg-primary { background-color: hsl(var(--primary)); }
.bg-secondary { background-color: hsl(var(--secondary)); }
.bg-muted { background-color: hsl(var(--muted)); }
.text-primary { color: hsl(var(--primary)); }
.text-secondary { color: hsl(var(--secondary)); }
.text-muted-foreground { color: hsl(var(--muted-foreground)); }
.text-card-foreground { color: hsl(var(--card-foreground)); }

${generatedCss}
`
}

function addMissingAliasStubs(
  files: GeneratedCodeFile[],
  availablePaths: Set<string>,
  previewFiles: PreviewFileMap
) {
  for (const file of files) {
    for (const specifier of extractImportSpecifiers(file.code)) {
      if (!specifier.startsWith('@/')) continue
      if (resolveAliasPath(specifier, availablePaths)) continue

      const target = normalizePath(specifier.replace(/^@\//, '/'))
      if (!target) continue

      const stubPath = `${target}.tsx`

      if (/^\/components\/ui\//.test(target)) {
        availablePaths.add(stubPath)
        previewFiles.set(stubPath, buildUiStub(target))
      }

      if (target === '/lib/utils') {
        const utilsPath = '/lib/utils.ts'
        availablePaths.add(utilsPath)
        previewFiles.set(utilsPath, buildUtilsStub())
      }
    }
  }
}

function addCommonRuntimeStubs(previewFiles: PreviewFileMap) {
  previewFiles.set('/__stubs__/next-image.tsx', buildNextImageStub())
  previewFiles.set('/__stubs__/next-link.tsx', buildNextLinkStub())
  previewFiles.set('/__stubs__/next-font-google.ts', buildNextFontStub())
}

function buildUiStub(target: string): string {
  const moduleName = path.basename(target)
  const exportsByModule: Record<string, string[]> = {
    button: ['Button'],
    card: ['Card', 'CardHeader', 'CardFooter', 'CardTitle', 'CardDescription', 'CardContent'],
    badge: ['Badge'],
    input: ['Input'],
    label: ['Label'],
    separator: ['Separator'],
    progress: ['Progress'],
    tabs: ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'],
    dialog: [
      'Dialog',
      'DialogTrigger',
      'DialogContent',
      'DialogHeader',
      'DialogFooter',
      'DialogTitle',
      'DialogDescription',
    ],
    select: ['Select', 'SelectTrigger', 'SelectValue', 'SelectContent', 'SelectItem'],
    'scroll-area': ['ScrollArea'],
    textarea: ['Textarea'],
    avatar: ['Avatar', 'AvatarImage', 'AvatarFallback'],
    'dropdown-menu': [
      'DropdownMenu',
      'DropdownMenuTrigger',
      'DropdownMenuContent',
      'DropdownMenuItem',
      'DropdownMenuLabel',
      'DropdownMenuSeparator',
    ],
  }
  const exportNames = exportsByModule[moduleName] || ['Stub']

  return `
import * as React from 'react';

type Props = React.HTMLAttributes<HTMLElement> & {
  value?: string;
  asChild?: boolean;
};

function Primitive({ children, className, ...props }: Props) {
  return <div className={className} {...props}>{children}</div>;
}

${exportNames
  .map((name) => `export const ${name} = Primitive;`)
  .join('\n')}
`
}

function buildUtilsStub(): string {
  return `
export function cn(...inputs: unknown[]) {
  return inputs.flat(Infinity).filter(Boolean).join(' ');
}
`
}

function buildNextImageStub(): string {
  return `
import * as React from 'react';

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
};

export default function Image({ fill, priority, alt = '', style, ...props }: ImageProps) {
  return (
    <img
      alt={alt}
      style={{ objectFit: props.objectFit as string | undefined, ...(fill ? { width: '100%', height: '100%' } : null), ...style }}
      {...props}
    />
  );
}
`
}

function buildNextLinkStub(): string {
  return `
import * as React from 'react';

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export default function Link({ href, children, ...props }: LinkProps) {
  return <a href={href} {...props}>{children}</a>;
}
`
}

function buildNextFontStub(): string {
  return `
const font = { className: '', variable: '', style: {} };
export const Inter = () => font;
export const Geist = () => font;
export const Geist_Mono = () => font;
export const Noto_Sans_KR = () => font;
export default () => font;
`
}

function rewritePreviewImports(
  code: string,
  filePath: string,
  availablePaths: Set<string>
): string {
  return code
    .replace(
      /(from\s+['"]|import\s+['"]|import\(\s*['"])(@\/[^'"]+)(['"])/g,
      (match, prefix: string, specifier: string, suffix: string) => {
        const resolvedPath = resolveAliasPath(specifier, availablePaths)

        if (!resolvedPath) {
          return match
        }

        return `${prefix}${toImportSpecifier(filePath, resolvedPath)}${suffix}`
      }
    )
    .replace(
      /(from\s+['"])next\/image(['"])/g,
      `$1${toImportSpecifier(filePath, '/__stubs__/next-image.tsx')}$2`
    )
    .replace(
      /(from\s+['"])next\/link(['"])/g,
      `$1${toImportSpecifier(filePath, '/__stubs__/next-link.tsx')}$2`
    )
    .replace(
      /(from\s+['"])next\/font\/google(['"])/g,
      `$1${toImportSpecifier(filePath, '/__stubs__/next-font-google.ts')}$2`
    )
}

function extractImportSpecifiers(code: string): string[] {
  return [
    ...code.matchAll(
      /(?:from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"])/g
    ),
  ].map((match) => match[1] || match[2] || match[3])
}

function resolveAliasPath(
  specifier: string,
  availablePaths: Set<string>
): string | null {
  const target = normalizePath(specifier.replace(/^@\//, '/'))

  if (!target) {
    return null
  }

  for (const availablePath of availablePaths) {
    if (
      availablePath === target ||
      stripJsExtension(availablePath) === target ||
      stripJsExtension(availablePath) === `${target}/index`
    ) {
      return availablePath
    }
  }

  return null
}

function toImportSpecifier(fromPath: string, targetPath: string): string {
  const fromParts = dirname(fromPath).split('/').filter(Boolean)
  const targetParts = stripJsExtension(targetPath).split('/').filter(Boolean)
  let shared = 0

  while (
    shared < fromParts.length &&
    shared < targetParts.length &&
    fromParts[shared] === targetParts[shared]
  ) {
    shared += 1
  }

  const relativeParts = [
    ...fromParts.slice(shared).map(() => '..'),
    ...targetParts.slice(shared),
  ]
  const relativePath = relativeParts.join('/') || '.'

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

function normalizePath(filePath?: string): string | null {
  const normalized = filePath?.trim().replace(/\\/g, '/').replace(/^\/+/, '')

  if (!normalized || normalized.includes('\0')) {
    return null
  }

  return `/${normalized}`
}

function stripJsExtension(filePath: string): string {
  return filePath.replace(/\.(tsx|jsx|ts|js)$/, '')
}

function dirname(filePath: string): string {
  const index = filePath.lastIndexOf('/')
  return index <= 0 ? '/' : filePath.slice(0, index)
}

function isCssFile(filePath: string): boolean {
  return /\.css$/.test(filePath)
}

function sanitizeGeneratedCss(code: string): string {
  return removeCssAtRuleBlock(
    code
      // Drop every @import: bare tailwind/tw-animate directives and remote font
      // URLs alike. Fonts are loaded via <link> in the preview HTML head, and a
      // generated @import placed after other rules breaks CSS bundling.
      .replace(/@import[^;]*;\s*/g, '')
      .replace(/@custom-variant[^\n]*\n/g, '')
      .replace(/^\s*@apply[^\n;]*;?\s*$/gm, ''),
    ['@theme', '@layer']
  ).trim()
}

function removeCssAtRuleBlock(code: string, atRules: string[]): string {
  let output = code

  atRules.forEach((atRule) => {
    let index = output.indexOf(atRule)

    while (index >= 0) {
      const openBrace = output.indexOf('{', index)
      const statementEnd = output.indexOf(';', index)

      if (openBrace < 0) {
        break
      }

      if (statementEnd >= 0 && statementEnd < openBrace) {
        index = output.indexOf(atRule, statementEnd + 1)
        continue
      }

      let depth = 0
      let end = openBrace

      for (; end < output.length; end += 1) {
        if (output[end] === '{') depth += 1
        if (output[end] === '}') depth -= 1
        if (depth === 0) {
          end += 1
          break
        }
      }

      output = `${output.slice(0, index)}${output.slice(end)}`
      index = output.indexOf(atRule)
    }
  })

  return output
}

async function writePreviewFile(
  rootDir: string,
  previewPath: string,
  code: string
) {
  const normalized = normalizePath(previewPath)

  if (!normalized) {
    return
  }

  const filePath = path.join(rootDir, normalized)

  if (!filePath.startsWith(rootDir)) {
    throw new Error(`Invalid preview file path: ${previewPath}`)
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, code, 'utf8')
}

function buildPreviewHtml(cacheKey: number, hasCss: boolean): string {
  const cssLink = hasCss
    ? `\n    <link rel="stylesheet" href="./preview.css?t=${cacheKey}" />`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap"
    />
    <script src="https://cdn.tailwindcss.com"></script>${cssLink}
    <title>StylePrint Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="./preview.js?t=${cacheKey}"></script>
  </body>
</html>
`
}

function sanitizePreviewId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function getPreviewContentType(filename: string): string {
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filename.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filename.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}
