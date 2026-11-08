param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-ProjectRoot
Assert-PortFree 3000
Assert-PortFree 8000
$required = @('frontend\node_modules','server\node_modules','frontend\dist\index.html','server\dist\app.js','inference\.venv312\Scripts\python.exe','server\.env','inference\.env')
$installed = $true
foreach ($item in $required) { if (-not (Test-Path -LiteralPath (Join-Path $root $item))) { $installed = $false } }
if (-not $installed) {
  Write-Host '[1/5] Installing dependencies and building. First run can take several minutes.'
  & (Join-Path $PSScriptRoot 'setup-system.ps1') -SkipModels
} else { Write-Host '[1/5] Reusing installed dependencies and builds. Run npm run setup after updating source or dependencies.' }
Write-Host '[2/5] Preparing local configuration. Online assistant API key is optional.'
& (Join-Path $PSScriptRoot 'configure-system.ps1')
Write-Host '[3/5] Initializing MySQL structure without clearing records.'
& node (Join-Path $PSScriptRoot 'local-database.mjs') init
if ($LASTEXITCODE -ne 0) { throw 'Database preparation failed; startup stopped.' }
Write-Host '[4/5] Preparing model files. Existing verified downloads are reused.'
& (Join-Path $PSScriptRoot 'prepare-models.ps1')
Write-Host '[5/5] Checking configuration and starting services.'
& (Join-Path $PSScriptRoot 'check-environment.ps1')
& (Join-Path $PSScriptRoot 'start-system.ps1') -NoBrowser:$NoBrowser
