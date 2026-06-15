import { build } from 'esbuild'
import { workspaceRoot } from './paths'

// Compile the generated component (plus React) into a single self-contained
// IIFE bundle. This deliberately avoids the Vite dev server's on-the-fly `/@fs`
// transform, which injects `@vitejs/plugin-react` Fast Refresh code that only
// works when its preamble is present in a Vite-processed HTML entry. Our preview
// HTML is a static file, so that preamble is never injected and the runtime
// throws "can't detect preamble". A pre-built bundle has no such dependency and
// renders identically in dev and in a static (Vercel) deployment.
export async function bundlePreview(
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
