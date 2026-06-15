import { toImportSpecifier } from './paths'

export function buildMain(entryPath: string): string {
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

export function buildPreviewHtml(cacheKey: number, hasCss: boolean): string {
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
