$ErrorActionPreference = 'Stop'
$CrateDir = Join-Path $PSScriptRoot 'diff-wasm'
$Out = Join-Path $PSScriptRoot '..\src\core\diff\diff-wasm.generated.ts'

cargo build --release --target wasm32-unknown-unknown --manifest-path (Join-Path $CrateDir 'Cargo.toml')

$WasmPath = Join-Path $CrateDir 'target\wasm32-unknown-unknown\release\diff_wasm.wasm'
$Bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $WasmPath))
$Base64 = [System.Convert]::ToBase64String($Bytes)
$Content = "export const DIFF_WASM_BASE64 = '$Base64'`n"
[System.IO.File]::WriteAllText((Resolve-Path $Out), $Content, [System.Text.Encoding]::UTF8)

Write-Output "Built diff-wasm: $($Bytes.Length) bytes -> $($Base64.Length) base64 chars"
