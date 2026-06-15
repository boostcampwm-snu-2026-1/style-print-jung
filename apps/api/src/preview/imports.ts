import {
  normalizePath,
  stripJsExtension,
  toImportSpecifier,
} from './paths'

export function rewritePreviewImports(
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

export function extractImportSpecifiers(code: string): string[] {
  return [
    ...code.matchAll(
      /(?:from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"])/g
    ),
  ].map((match) => match[1] || match[2] || match[3])
}

export function resolveAliasPath(
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
