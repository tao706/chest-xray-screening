. (Join-Path $PSScriptRoot "common.ps1")
$root = Get-ProjectRoot
$stateFile = Join-Path $root ".runtime\processes.json"
if (-not (Test-Path -LiteralPath $stateFile)) {
  Write-Host "No managed runtime processes were found." -ForegroundColor Yellow
  exit 0
}

$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
foreach ($entry in $state.processes) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  $commandLine = [string]$process.CommandLine
  if ($commandLine -notlike "*$root*") {
    Write-Host "Skipped PID $($entry.pid): command line does not belong to this project." -ForegroundColor Yellow
    continue
  }
  Stop-Process -Id ([int]$entry.pid) -Force
  Write-Host "Stopped $($entry.name) (PID $($entry.pid))." -ForegroundColor Green
}
Remove-Item -LiteralPath $stateFile -Force
