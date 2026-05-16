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

  simulateError(message: string): void {
    const event = { message } as ErrorEvent
    for (const handler of this.listeners.get('error') ?? []) {
      handler(event)
    }
  }
}

describe('worker-client', () => {
  let mockWorker: MockWorker

  beforeEach(() => {
    mockWorker = new MockWorker()
    vi.stubGlobal('Worker', vi.fn(function () { return mockWorker }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    mockWorker.simulateResponse({ id: sentId + 999, result: { wrong: true } })

    mockWorker.simulateResponse({ id: sentId, result: { correct: true } })

    const result = await promise
    expect(result).toEqual({ correct: true })
  })

  it('terminates worker and allows recreation', async () => {
    const { runDiffInWorker, terminateDiffWorker } = await import('../worker-client')

    const p1 = runDiffInWorker('a', 'b')
    const id1 = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: id1, result: {} })
    await p1

    terminateDiffWorker()
    expect(mockWorker.terminate).toHaveBeenCalled()
  })

  it('rejects on Worker error event', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const promise = runDiffInWorker('a', 'b')

    mockWorker.simulateError('Script load failed')

    await expect(promise).rejects.toThrow('Script load failed')
  })

  it('rejects with fallback message when Worker error has no message', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const promise = runDiffInWorker('a', 'b')

    mockWorker.simulateError('')

    await expect(promise).rejects.toThrow('Worker error')
  })

  it('cleans up both listeners after successful response', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const promise = runDiffInWorker('a', 'b')

    const sentId = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: sentId, result: {} })
    await promise

    expect(mockWorker.listeners.get('message')?.size ?? 0).toBe(0)
    expect(mockWorker.listeners.get('error')?.size ?? 0).toBe(0)
  })

  it('cleans up both listeners after error response', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const promise = runDiffInWorker('a', 'b')

    const sentId = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: sentId, error: 'fail' })
    await promise.catch(() => {})

    expect(mockWorker.listeners.get('message')?.size ?? 0).toBe(0)
    expect(mockWorker.listeners.get('error')?.size ?? 0).toBe(0)
  })

  it('cleans up both listeners after Worker error event', async () => {
    const { runDiffInWorker } = await import('../worker-client')
    const promise = runDiffInWorker('a', 'b')

    mockWorker.simulateError('crash')
    await promise.catch(() => {})

    expect(mockWorker.listeners.get('message')?.size ?? 0).toBe(0)
    expect(mockWorker.listeners.get('error')?.size ?? 0).toBe(0)
  })

  it('handles concurrent requests with different IDs independently', async () => {
    const { runDiffInWorker } = await import('../worker-client')

    const p1 = runDiffInWorker('old1', 'new1')
    const p2 = runDiffInWorker('old2', 'new2')

    expect(mockWorker.postMessage).toHaveBeenCalledTimes(2)
    const id1 = mockWorker.postMessage.mock.calls[0]![0].id
    const id2 = mockWorker.postMessage.mock.calls[1]![0].id
    expect(id1).not.toBe(id2)

    mockWorker.simulateResponse({ id: id2, result: { second: true } })
    mockWorker.simulateResponse({ id: id1, result: { first: true } })

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual({ first: true })
    expect(r2).toEqual({ second: true })
  })

  it('reuses the same Worker instance across calls', async () => {
    const { runDiffInWorker } = await import('../worker-client')

    const p1 = runDiffInWorker('a', 'b')
    const id1 = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: id1, result: {} })
    await p1

    const p2 = runDiffInWorker('c', 'd')
    const id2 = mockWorker.postMessage.mock.calls[1]![0].id
    mockWorker.simulateResponse({ id: id2, result: {} })
    await p2

    expect(vi.mocked(Worker)).toHaveBeenCalledTimes(1)
  })

  it('creates a new Worker after termination', async () => {
    const { runDiffInWorker, terminateDiffWorker } = await import('../worker-client')

    const p1 = runDiffInWorker('a', 'b')
    const id1 = mockWorker.postMessage.mock.calls[0]![0].id
    mockWorker.simulateResponse({ id: id1, result: {} })
    await p1

    terminateDiffWorker()

    const newMockWorker = new MockWorker()
    vi.mocked(Worker).mockImplementation(function () { return newMockWorker as any })

    const p2 = runDiffInWorker('c', 'd')
    const id2 = newMockWorker.postMessage.mock.calls[0]![0].id
    newMockWorker.simulateResponse({ id: id2, result: {} })
    await p2

    expect(vi.mocked(Worker)).toHaveBeenCalledTimes(2)
  })

  it('increments request IDs monotonically', async () => {
    const { runDiffInWorker } = await import('../worker-client')

    const promises: Promise<any>[] = []
    for (let i = 0; i < 5; i++) {
      promises.push(runDiffInWorker(`old${i}`, `new${i}`))
    }

    const ids = mockWorker.postMessage.mock.calls.map((call: any) => call[0].id)
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]!)
    }

    for (const id of ids) {
      mockWorker.simulateResponse({ id, result: {} })
    }
    await Promise.all(promises)
  })
})
