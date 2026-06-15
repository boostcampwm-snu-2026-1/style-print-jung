import path from 'path'
import type { GeneratedCodeFile } from '@style-print-jung/shared'
import type { PreviewFileMap } from './types'
import { extractImportSpecifiers, resolveAliasPath } from './imports'
import { normalizePath } from './paths'

export function addMissingAliasStubs(
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

export function addCommonRuntimeStubs(previewFiles: PreviewFileMap) {
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
