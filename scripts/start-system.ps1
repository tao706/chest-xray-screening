param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot "common.ps1")
$root = Get-ProjectRoot
$runtime = Join-Path $root ".runtime"
$logs = Join-Path $root "server\logs"
$stateFile = Join-Path $runtime "processes.json"

if (Test-Path -LiteralPath $stateFile) { throw "A runtime state file already exists. Run npm stop first." }
Assert-PortFree 3000
Assert-PortFree 8000
$configOutput = & node (Join-Path $PSScriptRoot 'local-database.mjs') status
if ($LASTEXITCODE -ne 0) { throw 'Local configuration check failed. Run npm run setup.' }
$localConfig = $configOutput | ConvertFrom-Json
if (-not $localConfig.ready) { throw 'Configure local settings first: npm run configure.' }
if (-not (Test-TcpPort $localConfig.dbHost $localConfig.dbPort)) { throw 'Configured MySQL endpoint is unavailable. Start MySQL and check npm run configure.' }
if (-not (Test-Path -LiteralPath (Join-Path $root "frontend\dist\index.html"))) { throw "Frontend build is missing. Run npm run build." }
if (-not (Test-Path -LiteralPath (Join-Path $root "server\dist\app.js"))) { throw "Server build is missing. Run npm run build." }
if (-not (Test-Path -LiteralPath (Join-Path $root "server\.env"))) { throw "server/.env is missing." }

Enable-ProjectPythonPath
$python = Resolve-ChestAiPython
$node = (Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $runtime, $logs | Out-Null

$inferenceArgs = @("-m", "uvicorn", "main:app", "--app-dir", ('"' + (Join-Path $root "inference") + '"'), "--host", "127.0.0.1", "--port", "8000")
$inference = Start-Process -FilePath $python -ArgumentList $inferenceArgs -WorkingDirectory (Join-Path $root "inference") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "inference.out.log") -RedirectStandardError (Join-Path $logs "inference.err.log") -PassThru
$serverEntry = Join-Path $root "server\dist\app.js"
$server = Start-Process -FilePath $node -ArgumentList ('"' + $serverEntry + '"') -WorkingDirectory (Join-Path $root "server") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "server.out.log") -RedirectStandardError (Join-Path $logs "server.err.log") -PassThru

@{
  project_root = $root
  started_at = (Get-Date).ToString("o")
  processes = @(
    @{ name = "FastAPI"; pid = $inference.Id },
    @{ name = "Express"; pid = $server.Id }
  )
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8

$healthy = $false
for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 2
    if ($health.success) { $healthy = $true; break }
  } catch { }
}
if (-not $healthy) {
  & (Join-Path $PSScriptRoot "stop-system.ps1")
  throw "Health check failed. Inspect server/logs."
}

Write-Host "System started: http://127.0.0.1:3000" -ForegroundColor Green
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:3000" }
