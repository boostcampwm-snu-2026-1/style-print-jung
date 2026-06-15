# Test Notes

## Test files

- `apps/web/src/components/preview-pane.test.tsx`
  - Verifies `PreviewPane` rendering, preview build behavior, and error UI.
- `apps/web/src/components/manual-facet-selector.test.tsx`
  - Verifies `ManualFacetSelector` empty state, facet previews, source selection behavior, and fallback UI.
- `apps/api/src/preview/artifact.test.ts`
  - Verifies preview artifact file generation, safe file reads, and `/api/preview/build` responses.

## Mocking

### PreviewPane

- `vi.stubGlobal('fetch', fetchMock)`
  - Replaces the real `/api/preview/build` request.
  - Used because the component should be tested without starting the Fastify API.
- `vi.fn()`
  - Tracks whether `fetch` was called with the expected method, headers, and request body.
- `vi.unstubAllGlobals()`
  - Restores the mocked global `fetch` after each test.

### ManualFacetSelector

- `vi.fn()`
  - Mocks callback props such as `onChange` and `onApply`.
  - Lets the test verify callback arguments without wiring real app state.
- `Element.prototype.hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `scrollIntoView`
  - jsdom browser API shims required by Radix Select.
  - These are test-environment shims, not app behavior mocks.
- `references`, `fullFacetPack`, `betaFacetPack`
  - Fixture data for component rendering.
  - These replace real uploaded assets and extracted facet API results.

## Required files

- `package.json`
  - Contains `npm run test` and test dependencies.
- `package-lock.json`
  - Locks installed test dependency versions.
- `apps/web/vite.config.ts`
  - Configures Vite for web dev/build.
- `apps/web/vitest.config.ts`
  - Configures Vitest with `jsdom` and `setupFiles`.
- `apps/web/src/test/setup-tests.ts`
  - Registers `@testing-library/jest-dom/vitest` matchers.
- `apps/web/src/components/preview-pane.test.tsx`
  - Component test for preview rendering and build behavior.
- `apps/web/src/components/manual-facet-selector.test.tsx`
  - Component test for manual facet source selection.
- `apps/api/vitest.config.ts`
  - Configures API tests with the Node environment.
- `apps/api/src/preview/artifact.test.ts`
  - API/preview artifact tests for generated preview files and preview build route behavior.
- `.gitignore`
  - Keeps generated `node_modules` and Vite test cache files out of git.

## Run

```bash
npm run test
```

The root command runs the web Vitest config first and then the API Vitest config.
