use std::mem;
use std::slice;
use xxhash_rust::xxh3::xxh3_128;

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(size);
    let ptr = buffer.as_mut_ptr();
    mem::forget(buffer);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::<u8>::from_raw_parts(ptr, 0, size);
    }
}

#[no_mangle]
pub extern "C" fn compute_simhash(
    tokens_ptr: *const u8,
    offsets_ptr: *const u32,
    lengths_ptr: *const u32,
    count: usize,
) -> u64 {
    let offsets = unsafe { slice::from_raw_parts(offsets_ptr, count) };
    let lengths = unsafe { slice::from_raw_parts(lengths_ptr, count) };
    let mut weights = [0i32; 64];

    for index in 0..count {
        let offset = offsets[index] as usize;
        let length = lengths[index] as usize;
        let bytes = unsafe { slice::from_raw_parts(tokens_ptr.add(offset), length) };
        let hash = xxh3_128(bytes);
        let upper = (hash >> 64) as u64;
        for bit in 0..64 {
            let mask = 1u64 << bit;
            weights[bit] += if upper & mask == 0 { -1 } else { 1 };
        }
    }

    let mut result = 0u64;
    for bit in 0..64 {
        if weights[bit] >= 0 {
            result |= 1u64 << bit;
        }
    }
    result
}

#[no_mangle]
pub extern "C" fn compute_minhash_similarity(
    left_tokens_ptr: *const u16,
    left_offsets_ptr: *const u32,
    left_lengths_ptr: *const u32,
    left_count: usize,
    right_tokens_ptr: *const u16,
    right_offsets_ptr: *const u32,
    right_lengths_ptr: *const u32,
    right_count: usize,
    functions: usize,
) -> f64 {
    if functions == 0 || (left_count == 0 && right_count == 0) {
        return 1.0;
    }
    if left_count == 0 || right_count == 0 {
        return 0.0;
    }

    let left_offsets = unsafe { slice::from_raw_parts(left_offsets_ptr, left_count) };
    let left_lengths = unsafe { slice::from_raw_parts(left_lengths_ptr, left_count) };
    let right_offsets = unsafe { slice::from_raw_parts(right_offsets_ptr, right_count) };
    let right_lengths = unsafe { slice::from_raw_parts(right_lengths_ptr, right_count) };

    let mut equal = 0usize;
    for seed in 0..functions {
        let left_hash = minhash_seed(
            left_tokens_ptr,
            left_offsets,
            left_lengths,
            left_count,
            (seed + 1) as u32,
        );
        let right_hash = minhash_seed(
            right_tokens_ptr,
            right_offsets,
            right_lengths,
            right_count,
            (seed + 1) as u32,
        );
        if left_hash == right_hash {
            equal += 1;
        }
    }

    equal as f64 / functions as f64
}

#[no_mangle]
pub extern "C" fn compute_simhash_hamming_distances(
    query: u64,
    candidates_ptr: *const u64,
    count: usize,
    output_ptr: *mut u8,
) {
    let candidates = unsafe { slice::from_raw_parts(candidates_ptr, count) };
    let output = unsafe { slice::from_raw_parts_mut(output_ptr, count) };

    for index in 0..count {
        output[index] = (query ^ candidates[index]).count_ones() as u8;
    }
}

fn minhash_seed(
    tokens_ptr: *const u16,
    offsets: &[u32],
    lengths: &[u32],
    count: usize,
    seed: u32,
) -> u32 {
    let mut best = u32::MAX;
    for index in 0..count {
        let offset = offsets[index] as usize;
        let length = lengths[index] as usize;
        let units = unsafe { slice::from_raw_parts(tokens_ptr.add(offset), length) };
        best = best.min(seeded_hash(units, seed));
    }
    best
}

fn seeded_hash(units: &[u16], seed: u32) -> u32 {
    let mut hash = seed.wrapping_mul(2_654_435_761u32);
    for unit in units {
        hash ^= *unit as u32;
        hash = hash.wrapping_mul(16_777_619u32);
    }
    hash
}
