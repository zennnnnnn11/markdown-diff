import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  listeners: Map<string, Set<Function>> = new Map()
  postMessage = vi.fn()
  terminate = vi.fn()

  addEventListener(type: string, handler: Function): void {
    let set = this.listeners.get(type)
    if (!set) { set = new Set(); this.listeners.set(type, set) }
    set.add(handler)
  }

  removeEventListener(type: string, handler: Function): void {
    this.listeners.get(type)?.delete(handler)
  }

  simulateResponse(data: any): void {
    const event = { data } as MessageEvent
    for (const handler of this.listeners.get('message') ?? []) {
      handler(event)
    }
  }
}

describe('worker-client', () => {
  let mockWorker: MockWorker
  const originalWorker = globalThis.Worker

  beforeEach(() => {
    mockWorker = new MockWorker()
    // Must use regular function (not arrow) so it can be called with `new`
    vi.stubGlobal('Worker', vi.fn(function () { return mockWorker }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Reset module state
    vi.resetModules()
  })

  it('sends correct request format', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const promise = runDiffInWorker('old', 'new')

    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      id: expect.any(Number),
      oldMarkdown: 'old',
      newMarkdown: 'new',
    })

    // Resolve to prevent hanging
    const sentId = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: sentId, result: { mock: true } })
    await promise
  })

  it('resolves with result on success', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const fakeResult = { root: {}, stats: {} }
    const promise = runDiffInWorker('a', 'b')

    const sentId = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: sentId, result: fakeResult })

    const result = await promise
    expect(result).toEqual(fakeResult)
  })

  it('rejects with error on failure', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const promise = runDiffInWorker('a', 'b')

    const sentId = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: sentId, error: 'something went wrong' })

    await expect(promise).rejects.toThrow('something went wrong')
  })

  it('ignores messages with mismatched ids', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const promise = runDiffInWorker('a', 'b')

    const sentId = mockWorker.postMessage.mock.calls[0]![0].id
    // Send response with wrong id
    mockWorker.simulateResponse({ id: sentId + 999, result: { wrong: true } })

    // Promise should still be pending, resolve with correct id
    mockWorker.simulateResponse({ id: sentId, result: { correct: true } })

    const result = await promise
    expect(result).toEqual({ correct: true })
  })

  it('terminates worker and allows recreation', async () => {
    const { runDiffInWorker, terminateDiffWorker } = await import('../worker-client')

    // First call creates worker
    const p1 = runDiffInWorker('a', 'b')
    const id1 = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: id1, result: {} })
    await p1

    terminateDiffWorker()
    expect(mockWorker.terminate).toHaveBeenCalled()
  })
})
