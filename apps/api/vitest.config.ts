import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@style-print-jung/shared': path.resolve(
        __dirname,
        '../../packages/shared/src/index.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
