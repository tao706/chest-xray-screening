. (Join-Path $PSScriptRoot "common.ps1")
$root = Get-ProjectRoot
$failures = 0

function Report([string]$Name, [bool]$Passed, [string]$Detail) {
  if ($Passed) { Write-Host "[PASS] $Name - $Detail" -ForegroundColor Green }
  else { Write-Host "[FAIL] $Name - $Detail" -ForegroundColor Red; $script:failures += 1 }
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$nodeDetail = if ($node) { (& node --version) } else { "not installed" }
$npmDetail = if ($npm) { (& npm --version) } else { "not installed" }
Report "Node.js" ([bool]$node) $nodeDetail
Report "npm" ([bool]$npm) $npmDetail

try {
  Enable-ProjectPythonPath
  $python = Resolve-ChestAiPython
  $pythonVersion = & $python --version 2>&1
  Report "Python" $true "$pythonVersion ($python)"
  & $python -c 'import fastapi, uvicorn, torch, torchvision, PIL, numpy, transformers'
  Report "Python dependencies" ($LASTEXITCODE -eq 0) "FastAPI, PyTorch, TorchVision, Pillow, NumPy, Transformers"
} catch { Report "Python" $false $_.Exception.Message }

$configReady = $false
$dbHost = '127.0.0.1'
$dbPort = 3306
if (Test-Path -LiteralPath (Join-Path $root 'server/node_modules/dotenv')) {
  $configOutput = & node (Join-Path $PSScriptRoot 'local-database.mjs') status
  if ($LASTEXITCODE -eq 0) {
    $localConfig = $configOutput | ConvertFrom-Json
    $configReady = $localConfig.ready
    $dbHost = $localConfig.dbHost
    $dbPort = $localConfig.dbPort
  }
}
Report "Service config" $configReady "Run npm run configure for local database and initial administrator settings"
$modelReady = $false
if ($python) {
  & $python (Join-Path $PSScriptRoot 'download-model.py') --check
  $modelReady = $LASTEXITCODE -eq 0
}
Report "Model weights" $modelReady "SHA-256 validation; run npm run models:prepare if missing or damaged"
$gateRoot = Join-Path $root "inference\weights\image_gate"
$gateReady = $true
foreach ($file in @('config.json','preprocessor_config.json','tokenizer_config.json','special_tokens_map.json','vocab.json','merges.txt','pytorch_model.bin')) {
  if (-not (Test-Path -LiteralPath (Join-Path $gateRoot $file))) { $gateReady = $false }
}
Report "Image admission weights" $gateReady "Run inference/.venv312/Scripts/python.exe scripts/download-image-gate.py; full loading is checked at startup"
Report "MySQL port" (Test-TcpPort $dbHost $dbPort) "Configured MySQL endpoint"
Report "Frontend dependencies" (Test-Path -LiteralPath (Join-Path $root "frontend\node_modules")) "frontend/node_modules"
Report "Server dependencies" (Test-Path -LiteralPath (Join-Path $root "server\node_modules")) "server/node_modules"
Report "Frontend build" (Test-Path -LiteralPath (Join-Path $root "frontend\dist\index.html")) "frontend/dist/index.html"
Report "Server build" (Test-Path -LiteralPath (Join-Path $root "server\dist\app.js")) "server/dist/app.js"

if ($failures -gt 0) { throw "Environment check found $failures problem(s)." }
Write-Host "All environment checks passed." -ForegroundColor Cyan
