import { runMarkdownDiffInWorker } from './worker-entry'

interface DiffRequest {
  id: number
  oldMarkdown: string
  newMarkdown: string
}

self.onmessage = async (event: MessageEvent<DiffRequest>) => {
  const { id, oldMarkdown, newMarkdown } = event.data
  try {
    const result = await runMarkdownDiffInWorker(oldMarkdown, newMarkdown)
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
