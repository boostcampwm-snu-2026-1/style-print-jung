'use client'

import { useState } from 'react'
import { Sandpack } from '@codesandbox/sandpack-react'
import { cn } from '@/lib/utils'

interface PreviewPaneProps {
  code: string
  cssVariables?: string
  className?: string
}

export function PreviewPane({ code, cssVariables = '', className }: PreviewPaneProps) {
  // Sandpack spins up an in-browser bundler (web worker + iframe) on mount,
  // which is the heaviest CPU/memory consumer in the app. Gate it behind an
  // explicit user action so it never runs until the preview is actually wanted.
  const [showPreview, setShowPreview] = useState(false)

  if (!showPreview) {
    return (
      <div
        className={cn(
          'rounded-lg border flex flex-col items-center justify-center gap-3 py-16 text-center',
          className
        )}
      >
        <p className="text-sm text-muted-foreground max-w-sm">
          The live preview runs a bundler inside your browser and can be CPU- and
          memory-heavy. Load it only when you need it.
        </p>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Load live preview
        </button>
      </div>
    )
  }

  // Wrap the generated code in an App component
  const appCode = `
import GeneratedComponent from './GeneratedComponent';

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <GeneratedComponent />
    </div>
  );
}
`

  // Create CSS with Tailwind CDN and custom variables
  const cssCode = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
  ${cssVariables}
}

* {
  border-color: hsl(var(--border));
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}

.bg-background {
  background-color: hsl(var(--background));
}

.bg-primary {
  background-color: hsl(var(--primary));
}

.text-primary {
  color: hsl(var(--primary));
}

.bg-secondary {
  background-color: hsl(var(--secondary));
}

.text-secondary {
  color: hsl(var(--secondary));
}

.bg-muted {
  background-color: hsl(var(--muted));
}

.text-muted-foreground {
  color: hsl(var(--muted-foreground));
}

.bg-card {
  background-color: hsl(var(--card));
}

.text-card-foreground {
  color: hsl(var(--card-foreground));
}

.border {
  border-width: 1px;
}

.rounded-lg {
  border-radius: var(--radius);
}

.rounded-md {
  border-radius: calc(var(--radius) - 2px);
}

.shadow-sm {
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.shadow-md {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}
`

  return (
    <div className={cn('rounded-lg overflow-hidden border', className)}>
      <Sandpack
        template="react"
        theme="dark"
        options={{
          showNavigator: false,
          showTabs: true,
          showLineNumbers: true,
          editorHeight: 500,
          externalResources: ['https://cdn.tailwindcss.com'],
        }}
        files={{
          '/App.js': appCode,
          '/GeneratedComponent.js': {
            code: code,
            active: true,
          },
          '/styles.css': cssCode,
        }}
        customSetup={{
          entry: '/App.js',
          dependencies: {},
        }}
      />
    </div>
  )
}
