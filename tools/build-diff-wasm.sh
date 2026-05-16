#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRATE_DIR="$SCRIPT_DIR/diff-wasm"
OUT="$SCRIPT_DIR/../src/core/diff/diff-wasm.generated.ts"

cargo build --release --target wasm32-unknown-unknown --manifest-path "$CRATE_DIR/Cargo.toml"

WASM="$CRATE_DIR/target/wasm32-unknown-unknown/release/diff_wasm.wasm"
BASE64=$(base64 -w0 "$WASM" 2>/dev/null || base64 -i "$WASM")
echo "export const DIFF_WASM_BASE64 = '$BASE64'" > "$OUT"

SIZE=$(wc -c < "$WASM" | tr -d ' ')
echo "Built diff-wasm: ${SIZE} bytes -> $(echo -n "$BASE64" | wc -c | tr -d ' ') base64 chars"
