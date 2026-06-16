'use client'

import { useState } from 'react'
import { Copy, Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface CodeViewerProps {
  code: string
  language?: string
}

export function CodeViewer({ code, language = 'tsx' }: CodeViewerProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const downloadCode = () => {
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `generated-component.${language}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Simple syntax highlighting (basic)
  const highlightedCode = highlightSyntax(code)

  return (
    <div className="relative overflow-hidden rounded-lg border bg-[#151826] shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-slate-300">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5c7a]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
        <span className="ml-2">generated-component.{language}</span>
      </div>
      {/* Actions */}
      <div className="absolute right-4 top-2.5 z-10 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={copyToClipboard}
          className="h-8"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={downloadCode}
          className="h-8"
        >
          <Download className="h-3 w-3 mr-1" />
          Download
        </Button>
      </div>

      {/* Code Display */}
      <ScrollArea className="h-[500px] bg-zinc-950">
        <pre className="p-4 text-sm font-mono text-zinc-100">
          <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
        </pre>
      </ScrollArea>
    </div>
  )
}

// Basic syntax highlighting for JSX/TSX
function highlightSyntax(code: string): string {
  // Keywords
  const keywords =
    /\b(const|let|var|function|return|if|else|for|while|import|export|from|default|class|extends|new|this|true|false|null|undefined|async|await)\b/g

  // Strings
  const strings = /(["'`])(?:(?!\1|\\).|\\.)*\1/g

  // JSX tags
  const jsxTags = /<\/?([A-Za-z][A-Za-z0-9]*)/g

  // Comments
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm

  // Numbers
  const numbers = /\b(\d+\.?\d*)\b/g

  // Attributes
  const attributes = /\s([a-zA-Z-]+)=/g

  // className special
  const classNames = /className="([^"]*)"/g

  let highlighted = code
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Then apply highlighting
    .replace(
      comments,
      '<span style="color: #6a737d;">$1</span>'
    )
    .replace(
      strings,
      '<span style="color: #9ecbff;">$&</span>'
    )
    .replace(
      keywords,
      '<span style="color: #f97583;">$1</span>'
    )
    .replace(
      numbers,
      '<span style="color: #79b8ff;">$1</span>'
    )
    .replace(
      /&lt;\/?\/?([A-Za-z][A-Za-z0-9]*)/g,
      '&lt;<span style="color: #85e89d;">$1</span>'
    )
    .replace(
      attributes,
      ' <span style="color: #ffab70;">$1</span>='
    )

  return highlighted
}
