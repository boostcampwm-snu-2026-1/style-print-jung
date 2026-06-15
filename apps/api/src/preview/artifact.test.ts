import { promises as fs } from 'fs'
import path from 'path'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { app } from '../server'
import {
  readPreviewArtifactFile,
  writePreviewArtifact,
} from './artifact'
import {
  publicPreviewRoot,
  sanitizePreviewId,
  sourcePreviewRoot,
} from './paths'

const previewIds = new Set<string>()

afterEach(async () => {
  await Promise.all([...previewIds].map(cleanupPreview))
  previewIds.clear()
})

afterAll(async () => {
  await app.close()
})

describe('preview artifact', () => {
  test('writes preview html and bundle files', async () => {
    const id = trackPreviewId('artifact-test-preview')

    const previewUrl = await writePreviewArtifact({
      id,
      code: 'export default function GeneratedComponent() { return <main>Hello preview</main> }',
    })

    const publicDir = path.join(publicPreviewRoot, sanitizePreviewId(id))
    const html = await fs.readFile(path.join(publicDir, 'index.html'), 'utf8')
    const js = await fs.readFile(path.join(publicDir, 'preview.js'), 'utf8')

    expect(previewUrl).toMatch(
      /^\/generated-previews\/artifact-test-preview\/index\.html\?t=\d+$/
    )
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('./preview.js?t=')
    expect(js).toContain('Hello preview')
  })

  test('reads only allowed preview files', async () => {
    const id = trackPreviewId('artifact-read-preview')

    await writePreviewArtifact({
      id,
      code: 'export default function GeneratedComponent() { return <main>Read preview</main> }',
    })

    const html = await readPreviewArtifactFile(id, 'index.html')
    const js = await readPreviewArtifactFile(id, 'preview.js')
    const unknown = await readPreviewArtifactFile(id, 'main.tsx')
    const traversal = await readPreviewArtifactFile(id, '../index.html')

    expect(html?.contentType).toBe('text/html; charset=utf-8')
    expect(js?.contentType).toBe('text/javascript; charset=utf-8')
    expect(unknown).toBeNull()
    expect(traversal).toBeNull()
  })
})

describe('/api/preview/build', () => {
  test('returns 400 when generated code is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/preview/build',
      payload: { id: 'missing-code' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      success: false,
      error: 'No generated code provided',
    })
  })

  test('returns a previewUrl for valid generated code', async () => {
    const id = trackPreviewId('route-preview-build')

    const response = await app.inject({
      method: 'POST',
      url: '/api/preview/build',
      payload: {
        id,
        code: 'export default function GeneratedComponent() { return <main>Route preview</main> }',
      },
    })

    const body = response.json() as {
      success: boolean
      previewUrl?: string
    }

    expect(response.statusCode).toBe(200)
    expect(body.success).toBe(true)
    expect(body.previewUrl).toMatch(
      /^http:\/\/localhost:\d+\/generated-previews\/route-preview-build\/index\.html\?t=\d+$/
    )
  })
})

function trackPreviewId(id: string): string {
  previewIds.add(id)
  return id
}

async function cleanupPreview(id: string) {
  const previewId = sanitizePreviewId(id)

  await fs.rm(path.join(sourcePreviewRoot, previewId), {
    recursive: true,
    force: true,
  })
  await fs.rm(path.join(publicPreviewRoot, previewId), {
    recursive: true,
    force: true,
  })
}
