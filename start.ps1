param([int]$Port = 5175)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portable = Join-Path $env:USERPROFILE '.copilot\tools\node-v24.21.0-win-x64'
    if (-not (Test-Path (Join-Path $portable 'node.exe'))) {
        throw 'Node.js 22.18+ is required. Install Node.js, then run this script again.'
    }
    $env:Path = "$portable;$env:Path"
}
if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules\vite'))) {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& npm.cmd run dev -- --port $Port
exit $LASTEXITCODE
