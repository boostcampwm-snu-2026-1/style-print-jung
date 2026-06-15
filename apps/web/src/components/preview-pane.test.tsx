import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PreviewPane } from './preview-pane'

describe('PreviewPane 컴포넌트', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  // 4.3 렌더링 테스트
  test('전달받은 previewUrl로 iframe을 렌더링한다', () => {
    render(
      <PreviewPane
        id="preview-1"
        code=""
        previewUrl="/generated-previews/preview-1/index.html"
      />
    )

    const iframe = screen.getByTitle('Generated UI preview')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute(
      'src',
      '/generated-previews/preview-1/index.html'
    )
    expect(screen.queryByText('Building preview...')).not.toBeInTheDocument()
  })

  // 4.4 동작 테스트
  test('previewUrl이 없으면 preview build API를 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        previewUrl: '/generated-previews/preview-2/index.html',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PreviewPane
        id="preview-2"
        code="export default function App() { return <div /> }"
        entryFile="App.tsx"
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/preview/build',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'preview-2',
            code: 'export default function App() { return <div /> }',
            files: [],
            entryFile: 'App.tsx',
          }),
        })
      )
    })
  })

  // 4.5 검증 테스트
  test('preview build 실패 응답이면 에러 메시지를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: 'Preview build failed',
        }),
      })
    )

    render(<PreviewPane id="preview-3" code="" />)

    expect(await screen.findByText('Preview build failed')).toBeInTheDocument()
    expect(screen.queryByTitle('Generated UI preview')).not.toBeInTheDocument()
  })
})
