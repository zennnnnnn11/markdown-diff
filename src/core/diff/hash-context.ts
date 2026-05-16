import { xxhash128 } from 'hash-wasm'
import { stableStringify } from './utils'

const HASH_SEED_LOW = 0
const HASH_SEED_HIGH = 0
const textEncoder = new TextEncoder()

export interface HashContext {
  hashText(value: string): Promise<string>
  hashCanonical(value: unknown): Promise<string>
}

export function createHashContext(): HashContext {
  const textCache = new Map<string, string>()
  const canonicalCache = new Map<string, string>()

  return {
    async hashText(value: string): Promise<string> {
      let result = textCache.get(value)
      if (result === undefined) {
        result = await xxhash128(textEncoder.encode(value), HASH_SEED_LOW, HASH_SEED_HIGH)
        textCache.set(value, result)
      }
      return result
    },
    async hashCanonical(value: unknown): Promise<string> {
      const key = stableStringify(value)
      let result = canonicalCache.get(key)
      if (result === undefined) {
        result = await xxhash128(textEncoder.encode(key), HASH_SEED_LOW, HASH_SEED_HIGH)
        canonicalCache.set(key, result)
      }
      return result
    },
  }
}
