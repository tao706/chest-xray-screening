param([switch]$SkipModels)
. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-ProjectRoot
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12+ or 24 LTS first.' }
$nodeVersion = [version]((& node --version).TrimStart('v'))
if ($nodeVersion -lt [version]'22.12.0') { throw 'Node.js 22.12+ or 24 LTS is required.' }
$basePython = Resolve-ChestAiPython -BaseOnly
Enable-ProjectPythonPath
foreach ($part in @('frontend','server')) {
  & npm.cmd --prefix (Join-Path $root $part) ci
  if ($LASTEXITCODE -ne 0) { throw "$part npm ci failed." }
}
$venv = Join-Path $root 'inference\.venv312'
$python = Join-Path $venv 'Scripts\python.exe'
if (Test-Path -LiteralPath $python) {
  if (-not (Test-ChestPython $python)) { throw 'Existing .venv312 is invalid or not Python 3.12. Recreate it explicitly; setup does not delete existing environments.' }
} else {
  & $basePython -m venv $venv
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create Python virtual environment.' }
}
& $python -m pip install -r (Join-Path $root 'inference\requirements-win-cpu.lock.txt') --extra-index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
& $python -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Python dependency conflict detected.' }
& $python -c 'import fastapi, uvicorn, torch, torchvision, PIL, numpy, transformers'
if ($LASTEXITCODE -ne 0) { throw 'Python import verification failed.' }
foreach ($part in @('server','inference')) {
  $config = Join-Path $root "$part\.env"
  if (-not (Test-Path -LiteralPath $config)) { Copy-Item -LiteralPath (Join-Path $root "$part\.env.example") -Destination $config }
}
& (Join-Path $PSScriptRoot 'build-production.ps1')
if (-not $SkipModels) { & (Join-Path $PSScriptRoot 'prepare-models.ps1') }
Write-Host 'Setup completed. Run npm run quickstart for guided configuration, database initialization and startup.'
