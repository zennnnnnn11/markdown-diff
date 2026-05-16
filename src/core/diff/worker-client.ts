import type { DiffResult } from './types'

interface DiffResponse {
  id: number
  result?: DiffResult
  error?: string
}

let worker: Worker | undefined
let nextId = 0

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function runDiffInWorker(oldMarkdown: string, newMarkdown: string): Promise<DiffResult> {
  const id = nextId++
  const w = getWorker()
  return new Promise((resolve, reject) => {
    function messageHandler(event: MessageEvent<DiffResponse>) {
      if (event.data.id !== id) return
      cleanup()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(event.data.result!)
    }
    function errorHandler(event: ErrorEvent) {
      cleanup()
      reject(new Error(event.message || 'Worker error'))
    }
    function cleanup() {
      w.removeEventListener('message', messageHandler)
      w.removeEventListener('error', errorHandler)
    }
    w.addEventListener('message', messageHandler)
    w.addEventListener('error', errorHandler)
    w.postMessage({ id, oldMarkdown, newMarkdown })
  })
}

export function terminateDiffWorker(): void {
  worker?.terminate()
  worker = undefined
}
