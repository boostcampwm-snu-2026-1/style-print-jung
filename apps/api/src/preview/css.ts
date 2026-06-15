import type { GeneratedCodeFile } from '@style-print-jung/shared'

export function buildCss(files: GeneratedCodeFile[]): string {
  const generatedCss = files
    .filter((file) => isCssFile(file.path))
    .map((file) => sanitizeGeneratedCss(file.code))
    .filter(Boolean)
    .join('\n\n')

  // Fonts are loaded via <link> in the preview HTML head, so no @import here:
  // a stray @import after these rules violates the CSS spec and breaks bundling.
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

export function isCssFile(filePath: string): boolean {
  return /\.css$/.test(filePath)
}

export function sanitizeGeneratedCss(code: string): string {
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
