export function decodeBase64(base64: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  }

  const bufferCtor = (globalThis as typeof globalThis & { Buffer?: { from(data: string, encoding: string): Uint8Array } }).Buffer
  if (bufferCtor) {
    return Uint8Array.from(bufferCtor.from(base64, 'base64'))
  }

  throw new Error('No base64 decoder available')
}
