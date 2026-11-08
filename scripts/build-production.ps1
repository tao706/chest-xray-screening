. (Join-Path $PSScriptRoot "common.ps1")
$root = Get-ProjectRoot

Write-Host "Building Vue frontend..." -ForegroundColor Cyan
& npm.cmd --prefix (Join-Path $root "frontend") run build
if ($LASTEXITCODE -ne 0) { throw "Vue build failed." }

Write-Host "Building Express server..." -ForegroundColor Cyan
& npm.cmd --prefix (Join-Path $root "server") run build
if ($LASTEXITCODE -ne 0) { throw "Express build failed." }

Enable-ProjectPythonPath
$python = Resolve-ChestAiPython
Write-Host "Checking FastAPI code..." -ForegroundColor Cyan
& $python -m compileall -q (Join-Path $root "inference\main.py") (Join-Path $root "inference\model_runtime") (Join-Path $root "inference\model_self_check.py")
if ($LASTEXITCODE -ne 0) { throw "FastAPI syntax check failed." }

Write-Host "Production build completed." -ForegroundColor Green
