use std::mem;
use std::slice;

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

// ---------------------------------------------------------------------------
// Hungarian (Kuhn-Munkres) O(n³) optimal bipartite assignment
// ---------------------------------------------------------------------------

const LARGE_COST: f64 = 1e18;

#[no_mangle]
pub extern "C" fn hungarian_assignment(
    cost_ptr: *const f64,
    rows: usize,
    cols: usize,
    output_ptr: *mut i32,
) -> usize {
    if rows == 0 || cols == 0 {
        return 0;
    }

    let flat = unsafe { slice::from_raw_parts(cost_ptr, rows * cols) };

    let n = rows.max(cols);

    // Build square cost matrix, marking infeasible cells.
    let mut c = vec![0.0f64; n * n];
    let mut infeasible = vec![false; rows * cols];
    for i in 0..rows {
        for j in 0..cols {
            let v = flat[i * cols + j];
            if v >= LARGE_COST || v.is_infinite() || v.is_nan() {
                c[i * n + j] = LARGE_COST;
                infeasible[i * cols + j] = true;
            } else {
                c[i * n + j] = v;
            }
        }
    }

    // Potentials and assignment (1-indexed internally).
    let mut u = vec![0.0f64; n + 1];
    let mut v = vec![0.0f64; n + 1];
    let mut col_assign = vec![0i32; n + 1]; // col_assign[j] = row assigned to col j

    for i in 1..=n {
        let mut link = vec![0i32; n + 1];
        let mut min_cost = vec![f64::INFINITY; n + 1];
        let mut used = vec![false; n + 1];

        col_assign[0] = i as i32;
        let mut j0: usize = 0;

        loop {
            used[j0] = true;
            let row_of_j0 = col_assign[j0] as usize;
            let mut delta = f64::INFINITY;
            let mut j1: usize = 0;

            for j in 1..=n {
                if used[j] {
                    continue;
                }
                let cur = c[(row_of_j0 - 1) * n + (j - 1)] - u[row_of_j0] - v[j];
                if cur < min_cost[j] {
                    min_cost[j] = cur;
                    link[j] = j0 as i32;
                }
                if min_cost[j] < delta {
                    delta = min_cost[j];
                    j1 = j;
                }
            }

            for j in 0..=n {
                if used[j] {
                    u[col_assign[j] as usize] += delta;
                    v[j] -= delta;
                } else {
                    min_cost[j] -= delta;
                }
            }

            j0 = j1;
            if col_assign[j0] == 0 {
                break;
            }
        }

        while j0 != 0 {
            let prev = link[j0] as usize;
            col_assign[j0] = col_assign[prev];
            j0 = prev;
        }
    }

    // Extract valid assignments.
    let output = unsafe { slice::from_raw_parts_mut(output_ptr, n.min(rows) * 2) };
    let mut count = 0usize;
    for j in 1..=n {
        let row = col_assign[j] as usize - 1;
        let col = j - 1;
        if row < rows && col < cols && !infeasible[row * cols + col] {
            output[count * 2] = row as i32;
            output[count * 2 + 1] = col as i32;
            count += 1;
        }
    }
    count
}

// ---------------------------------------------------------------------------
// Myers O((N+M)*D) shortest edit script
// ---------------------------------------------------------------------------

const OP_EQUAL: i32 = 0;
const OP_INSERT: i32 = 1;
const OP_DELETE: i32 = 2;

#[no_mangle]
pub extern "C" fn myers_diff(
    old_ptr: *const u32,
    old_len: usize,
    new_ptr: *const u32,
    new_len: usize,
    output_ptr: *mut i32,
) -> usize {
    let old = unsafe { slice::from_raw_parts(old_ptr, old_len) };
    let new = unsafe { slice::from_raw_parts(new_ptr, new_len) };

    let max_d = old_len + new_len;
    if max_d == 0 {
        return 0;
    }

    let offset = max_d;
    let vec_len = max_d * 2 + 1;

    let mut paths = vec![0i32; vec_len];
    // Flat trace: trace[d] starts at d * vec_len
    let mut trace: Vec<i32> = Vec::with_capacity(vec_len * (max_d + 1));

    for d in 0..=max_d {
        trace.extend_from_slice(&paths);

        for k_raw in (0..=2 * d).step_by(2) {
            let k = k_raw as i32 - d as i32;
            let vi = (k + offset as i32) as usize;

            let mut x: i32;
            if k == -(d as i32)
                || (k != d as i32
                    && paths[vi.wrapping_sub(1).min(vec_len - 1)]
                        < paths[(vi + 1).min(vec_len - 1)])
            {
                x = paths[(vi + 1).min(vec_len - 1)];
            } else {
                x = paths[vi.wrapping_sub(1).min(vec_len - 1)] + 1;
            }

            let mut y = x - k;
            while (x as usize) < old_len
                && (y as usize) < new_len
                && old[x as usize] == new[y as usize]
            {
                x += 1;
                y += 1;
            }

            paths[vi] = x;
            if x as usize >= old_len && y as usize >= new_len {
                return backtrack_myers(
                    old, new, &trace, d, offset, vec_len, output_ptr,
                );
            }
        }
    }

    0
}

fn backtrack_myers(
    old: &[u32],
    new: &[u32],
    trace: &[i32],
    distance: usize,
    offset: usize,
    vec_len: usize,
    output_ptr: *mut i32,
) -> usize {
    let mut edits: Vec<(i32, i32, i32)> = Vec::new(); // (op, oldIndex, newIndex)
    let mut x = old.len() as i32;
    let mut y = new.len() as i32;

    for d in (1..=distance).rev() {
        let k = x - y;
        let snapshot = &trace[d * vec_len..d * vec_len + vec_len];
        let choose_insert = k == -(d as i32)
            || (k != d as i32
                && snapshot[(k - 1 + offset as i32) as usize]
                    < snapshot[(k + 1 + offset as i32) as usize]);

        let prev_k = if choose_insert { k + 1 } else { k - 1 };
        let prev_x = snapshot[(prev_k + offset as i32) as usize];
        let prev_y = prev_x - prev_k;

        while x > prev_x && y > prev_y {
            edits.push((OP_EQUAL, x - 1, y - 1));
            x -= 1;
            y -= 1;
        }

        if choose_insert {
            edits.push((OP_INSERT, -1, prev_y));
            y = prev_y;
            x = prev_x;
        } else {
            edits.push((OP_DELETE, prev_x, -1));
            x = prev_x;
            y = prev_y;
        }
    }

    while x > 0 && y > 0 {
        edits.push((OP_EQUAL, x - 1, y - 1));
        x -= 1;
        y -= 1;
    }
    while x > 0 {
        edits.push((OP_DELETE, x - 1, -1));
        x -= 1;
    }
    while y > 0 {
        edits.push((OP_INSERT, -1, y - 1));
        y -= 1;
    }

    edits.reverse();

    let output = unsafe { slice::from_raw_parts_mut(output_ptr, edits.len() * 3) };
    for (i, (op, oi, ni)) in edits.iter().enumerate() {
        output[i * 3] = *op;
        output[i * 3 + 1] = *oi;
        output[i * 3 + 2] = *ni;
    }

    edits.len()
}
