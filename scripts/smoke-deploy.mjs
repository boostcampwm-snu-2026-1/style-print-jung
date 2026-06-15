const apiBaseUrl = normalizeBaseUrl(
  process.env.SMOKE_API_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:4000'
)
const webBaseUrl = normalizeBaseUrl(process.env.SMOKE_WEB_BASE_URL || 'http://localhost:5173')

const previewId = `smoke-${Date.now()}`
const generatedCode = `
export default function GeneratedComponent() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-primary">
      <section className="rounded-md border bg-card p-6 shadow-sm">
        <h1 className="font-semibold">StylePrint smoke preview</h1>
        <p className="text-muted-foreground">Generated preview artifact is reachable.</p>
      </section>
    </main>
  )
}
`

await checkHealth()
await checkWeb()
await checkPreviewBuild()

console.log('smoke:deploy passed')

async function checkHealth() {
  const response = await fetch(`${apiBaseUrl}/health`)
  const body = await response.text()

  if (!response.ok) {
    throw new Error(`health check failed: ${response.status} ${body}`)
  }

  console.log(`health ${response.status}`)
}

async function checkWeb() {
  const response = await fetch(`${webBaseUrl}/`)
  const body = await response.text()

  if (!response.ok || !body.includes('<html')) {
    throw new Error(`web check failed: ${response.status} ${body.slice(0, 120)}`)
  }

  console.log(`web ${response.status}`)
}

async function checkPreviewBuild() {
  const response = await fetch(`${apiBaseUrl}/api/preview/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: previewId,
      code: generatedCode,
    }),
  })
  const body = await response.json()

  if (!response.ok || !body.success || !body.previewUrl) {
    throw new Error(`preview build failed: ${response.status} ${JSON.stringify(body)}`)
  }

  console.log(`preview build ${response.status}`)

  const previewUrl = new URL(body.previewUrl, apiBaseUrl).toString()
  const previewResponse = await fetch(previewUrl)
  const previewHtml = await previewResponse.text()

  if (
    !previewResponse.ok ||
    !previewHtml.includes('<div id="root"></div>') ||
    !previewHtml.includes('./preview.js?t=')
  ) {
    throw new Error(
      `preview asset failed: ${previewResponse.status} ${previewHtml.slice(0, 120)}`
    )
  }

  console.log(`preview asset ${previewResponse.status}`)
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, '')
}
