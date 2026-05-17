import { SIMHASH_WASM_BASE64 } from './simhash-wasm.generated'

const textEncoder = new TextEncoder()

interface SimHashWasmExports {
  memory: WebAssembly.Memory
  alloc(size: number): number
  dealloc(ptr: number, size: number): void
  compute_simhash(tokensPtr: number, offsetsPtr: number, lengthsPtr: number, count: number): bigint
  compute_minhash_similarity(
    leftTokensPtr: number,
    leftOffsetsPtr: number,
    leftLengthsPtr: number,
    leftCount: number,
    rightTokensPtr: number,
    rightOffsetsPtr: number,
    rightLengthsPtr: number,
    rightCount: number,
    functions: number,
  ): number
  compute_simhash_hamming_distances(
    query: bigint,
    candidatesPtr: number,
    count: number,
    outputPtr: number,
  ): void
}

let wasmExports: SimHashWasmExports | undefined

export async function charikarSimHashWasm(tokens: readonly string[]): Promise<string | undefined> {
  if (tokens.length === 0) return undefined

  const wasm = loadSimHashWasm()
  const encodedTokens = tokens.map((token) => textEncoder.encode(token))
  const totalBytes = encodedTokens.reduce((sum, token) => sum + token.length, 0)
  const offsets = new Uint32Array(tokens.length)
  const lengths = new Uint32Array(tokens.length)

  let runningOffset = 0
  for (let index = 0; index < encodedTokens.length; index++) {
    offsets[index] = runningOffset
    lengths[index] = encodedTokens[index]?.length ?? 0
    runningOffset += lengths[index] ?? 0
  }

  const tokensPtr = wasm.alloc(totalBytes)
  const offsetsPtr = wasm.alloc(offsets.byteLength)
  const lengthsPtr = wasm.alloc(lengths.byteLength)

  try {
    const memory = new Uint8Array(wasm.memory.buffer)
    const memoryU32 = new Uint32Array(wasm.memory.buffer)

    let cursor = tokensPtr
    for (const bytes of encodedTokens) {
      memory.set(bytes, cursor)
      cursor += bytes.length
    }

    memoryU32.set(offsets, offsetsPtr / Uint32Array.BYTES_PER_ELEMENT)
    memoryU32.set(lengths, lengthsPtr / Uint32Array.BYTES_PER_ELEMENT)

    const raw = wasm.compute_simhash(tokensPtr, offsetsPtr, lengthsPtr, tokens.length)
    return BigInt.asUintN(64, raw).toString(16).padStart(16, '0')
  } finally {
    wasm.dealloc(tokensPtr, totalBytes)
    wasm.dealloc(offsetsPtr, offsets.byteLength)
    wasm.dealloc(lengthsPtr, lengths.byteLength)
  }
}

export function estimateMinHashSimilarityWasm(
  leftTokens: readonly string[],
  rightTokens: readonly string[],
  functions: number,
): number {
  const wasm = loadSimHashWasm()
  const left = packUtf16Tokens([...new Set(leftTokens)])
  const right = packUtf16Tokens([...new Set(rightTokens)])
  const leftUnitsPtr = wasm.alloc(left.units.byteLength)
  const leftOffsetsPtr = wasm.alloc(left.offsets.byteLength)
  const leftLengthsPtr = wasm.alloc(left.lengths.byteLength)
  const rightUnitsPtr = wasm.alloc(right.units.byteLength)
  const rightOffsetsPtr = wasm.alloc(right.offsets.byteLength)
  const rightLengthsPtr = wasm.alloc(right.lengths.byteLength)

  try {
    const memoryU16 = new Uint16Array(wasm.memory.buffer)
    const memoryU32 = new Uint32Array(wasm.memory.buffer)

    memoryU16.set(left.units, leftUnitsPtr / Uint16Array.BYTES_PER_ELEMENT)
    memoryU32.set(left.offsets, leftOffsetsPtr / Uint32Array.BYTES_PER_ELEMENT)
    memoryU32.set(left.lengths, leftLengthsPtr / Uint32Array.BYTES_PER_ELEMENT)
    memoryU16.set(right.units, rightUnitsPtr / Uint16Array.BYTES_PER_ELEMENT)
    memoryU32.set(right.offsets, rightOffsetsPtr / Uint32Array.BYTES_PER_ELEMENT)
    memoryU32.set(right.lengths, rightLengthsPtr / Uint32Array.BYTES_PER_ELEMENT)

    return wasm.compute_minhash_similarity(
      leftUnitsPtr,
      leftOffsetsPtr,
      leftLengthsPtr,
      left.offsets.length,
      rightUnitsPtr,
      rightOffsetsPtr,
      rightLengthsPtr,
      right.offsets.length,
      functions,
    )
  } finally {
    wasm.dealloc(leftUnitsPtr, left.units.byteLength)
    wasm.dealloc(leftOffsetsPtr, left.offsets.byteLength)
    wasm.dealloc(leftLengthsPtr, left.lengths.byteLength)
    wasm.dealloc(rightUnitsPtr, right.units.byteLength)
    wasm.dealloc(rightOffsetsPtr, right.offsets.byteLength)
    wasm.dealloc(rightLengthsPtr, right.lengths.byteLength)
  }
}

export function simHashHammingDistanceBatchWasm(
  query: string | undefined,
  candidates: readonly (string | undefined)[],
): Array<number | undefined> {
  if (!query) return candidates.map(() => undefined)

  const wasm = loadSimHashWasm()
  const values = new BigUint64Array(candidates.length)
  const definedIndices: number[] = []
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    if (!candidate) continue
    values[index] = BigInt(`0x${candidate}`)
    definedIndices.push(index)
  }

  if (definedIndices.length === 0) return candidates.map(() => undefined)

  const candidatesPtr = wasm.alloc(values.byteLength)
  const output = new Uint8Array(candidates.length)
  const outputPtr = wasm.alloc(output.byteLength)

  try {
    const memoryU64 = new BigUint64Array(wasm.memory.buffer)
    const memoryU8 = new Uint8Array(wasm.memory.buffer)
    memoryU64.set(values, candidatesPtr / BigUint64Array.BYTES_PER_ELEMENT)
    wasm.compute_simhash_hamming_distances(
      BigInt(`0x${query}`),
      candidatesPtr,
      candidates.length,
      outputPtr,
    )
    output.set(memoryU8.subarray(outputPtr, outputPtr + output.length))
    return candidates.map((candidate, index) => (candidate ? output[index] : undefined))
  } finally {
    wasm.dealloc(candidatesPtr, values.byteLength)
    wasm.dealloc(outputPtr, output.byteLength)
  }
}

function loadSimHashWasm(): SimHashWasmExports {
  if (wasmExports) return wasmExports
  const bytes = decodeBase64(SIMHASH_WASM_BASE64)
  const source = new Uint8Array(bytes.byteLength)
  source.set(bytes)
  const module = new WebAssembly.Module(source)
  const instance = new WebAssembly.Instance(module)
  const exports = instance.exports as unknown as Partial<SimHashWasmExports>
  if (
    !exports.memory ||
    !exports.alloc ||
    !exports.dealloc ||
    !exports.compute_simhash ||
    !exports.compute_minhash_similarity ||
    !exports.compute_simhash_hamming_distances
  ) {
    throw new Error('SimHash WASM exports are incomplete')
  }
  wasmExports = exports as SimHashWasmExports
  return wasmExports
}

function packUtf16Tokens(tokens: readonly string[]): {
  units: Uint16Array
  offsets: Uint32Array
  lengths: Uint32Array
} {
  const offsets = new Uint32Array(tokens.length)
  const lengths = new Uint32Array(tokens.length)
  const chunks: Uint16Array[] = []
  let totalUnits = 0

  for (let index = 0; index < tokens.length; index++) {
    const units = stringToUtf16Units(tokens[index] ?? '')
    chunks.push(units)
    offsets[index] = totalUnits
    lengths[index] = units.length
    totalUnits += units.length
  }

  const packed = new Uint16Array(totalUnits)
  let cursor = 0
  for (const units of chunks) {
    packed.set(units, cursor)
    cursor += units.length
  }

  return { units: packed, offsets, lengths }
}

function stringToUtf16Units(value: string): Uint16Array {
  const units = new Uint16Array(value.length)
  for (let index = 0; index < value.length; index++) {
    units[index] = value.charCodeAt(index)
  }
  return units
}

import { decodeBase64 } from './wasm-utils'
