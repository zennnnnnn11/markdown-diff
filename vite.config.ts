import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

function normalizeId(id: string): string {
  return id.replaceAll('\\', '/')
}

function manualChunks(id: string): string | undefined {
  const normalized = normalizeId(id)

  if (normalized.includes('/src/features/diff-workbench/components/DiffDebugPanel.vue')) {
    return 'debug-panel'
  }

  if (normalized.includes('/src/features/diff-workbench/components/DiffDetailModal.vue')) {
    return 'detail-modal'
  }

  if (normalized.includes('/src/features/diff-workbench/components/markdown-code-languages')) {
    return 'codemirror-languages'
  }

  if (
    normalized.includes('/node_modules/@codemirror/view/')
    || normalized.includes('/node_modules/@codemirror/state/')
    || normalized.includes('/node_modules/@codemirror/commands/')
  ) {
    return 'codemirror-editor-core'
  }

  if (
    normalized.includes('/node_modules/@codemirror/language/')
    || normalized.includes('/node_modules/@lezer/')
  ) {
    return 'codemirror-language-core'
  }

  if (normalized.includes('/node_modules/@codemirror/lang-markdown/')) {
    return 'codemirror-markdown'
  }

  if (normalized.includes('/node_modules/@codemirror/lang-javascript/')) {
    return 'codemirror-lang-javascript'
  }

  if (normalized.includes('/node_modules/@codemirror/lang-html/')) {
    return 'codemirror-lang-html'
  }

  if (normalized.includes('/node_modules/@codemirror/lang-css/')) {
    return 'codemirror-lang-css'
  }

  if (normalized.includes('/node_modules/@codemirror/lang-sql/')) {
    return 'codemirror-lang-sql'
  }

  if (normalized.includes('/node_modules/@codemirror/lang-yaml/')) {
    return 'codemirror-lang-yaml'
  }

  if (normalized.includes('/node_modules/@codemirror/lang-python/')) {
    return 'codemirror-lang-python'
  }

  if (
    normalized.includes('/node_modules/@codemirror/')
    || normalized.includes('/node_modules/codemirror/')
  ) {
    return 'codemirror-misc'
  }

  if (
    normalized.includes('/src/core/diff/diff-wasm')
    || normalized.includes('/src/core/diff/simhash-wasm')
    || normalized.includes('/src/core/diff/wasm-utils')
  ) {
    return 'diff-worker-wasm'
  }

  if (
    normalized.includes('/src/core/diff/diff.worker.ts')
    || normalized.includes('/src/core/diff/worker-entry.ts')
    || normalized.includes('/src/core/diff/engine/')
    || normalized.includes('/src/core/diff/indexer.ts')
    || normalized.includes('/src/core/diff/sequence.ts')
    || normalized.includes('/src/core/diff/similarity.ts')
  ) {
    return 'diff-worker-core'
  }

  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), cloudflare()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    conditions: ['worker'],
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks,
      },
    },
  },
  worker: {
    format: 'es',
    plugins: () => [],
    rolldownOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
