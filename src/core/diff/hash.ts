import { xxhash128 } from 'hash-wasm'
import { charikarSimHashWasm, simHashHammingDistanceBatchWasm } from './simhash-wasm'

const HASH_SEED_LOW = 0
const HASH_SEED_HIGH = 0
const textEncoder = new TextEncoder()

export async function hashCanonical(value: unknown): Promise<string> {
  return xxhash128(textEncoder.encode(stableStringify(value)), HASH_SEED_LOW, HASH_SEED_HIGH)
}

export async function hashText(value: string): Promise<string> {
  return xxhash128(textEncoder.encode(value), HASH_SEED_LOW, HASH_SEED_HIGH)
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortCanonical(value))
}

export async function charikarSimHash(tokens: readonly string[]): Promise<string | undefined> {
  if (tokens.length === 0) return undefined
  try {
    return await charikarSimHashWasm(tokens)
  } catch {
    return charikarSimHashLegacy(tokens)
  }
}

export function simHashHammingDistance(left?: string, right?: string): number | undefined {
  if (!left || !right) return undefined
  const xor = BigInt(`0x${left}`) ^ BigInt(`0x${right}`)
  let value = xor
  let distance = 0
  while (value !== 0n) {
    distance += Number(value & 1n)
    value >>= 1n
  }
  return distance
}

export function simHashHammingDistanceBatch(
  query: string | undefined,
  candidates: readonly (string | undefined)[],
): Array<number | undefined> {
  try {
    return simHashHammingDistanceBatchWasm(query, candidates)
  } catch {
    return candidates.map((candidate) => simHashHammingDistance(query, candidate))
  }
}

function sortCanonical(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => sortCanonical(item))
  if (typeof value === 'number') return Number(value)
  if (typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    const entry = sortCanonical(record[key])
    if (entry !== undefined) result[key] = entry
  }
  return result
}

async function charikarSimHashLegacy(tokens: readonly string[]): Promise<string | undefined> {
  const hashed = await Promise.all(tokens.map((token) => hashText(token)))
  const weights = Array.from<number>({ length: 64 }).fill(0)
  for (const hex of hashed) {
    const value = BigInt(`0x${hex.slice(0, 16)}`)
    for (let bit = 0; bit < 64; bit++) {
      const mask = 1n << BigInt(bit)
      weights[bit] = (weights[bit] ?? 0) + ((value & mask) === 0n ? -1 : 1)
    }
  }

  let result = 0n
  for (let bit = 0; bit < 64; bit++) {
    if ((weights[bit] ?? 0) >= 0) result |= 1n << BigInt(bit)
  }
  return result.toString(16).padStart(16, '0')
}
