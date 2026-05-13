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
