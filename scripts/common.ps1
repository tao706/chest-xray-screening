$ErrorActionPreference = 'Stop'

function Get-ProjectRoot { return (Split-Path -Parent $PSScriptRoot) }

function Test-ChestPython([string]$Executable) {
  if (-not $Executable -or -not (Test-Path -LiteralPath $Executable)) { return $false }
  $version = & $Executable -c 'import sys; print(sys.version_info.major,sys.version_info.minor,sep=chr(46))' 2>$null
  return $LASTEXITCODE -eq 0 -and "$version" -eq '3.12'
}

function Resolve-ChestAiPython([switch]$BaseOnly) {
  $root = Get-ProjectRoot
  $venv = Join-Path $root 'inference\.venv312\Scripts\python.exe'
  if (-not $BaseOnly -and (Test-Path -LiteralPath $venv)) {
    if (Test-ChestPython $venv) { return $venv }
    throw 'The project .venv312 is invalid or is not Python 3.12. Recreate it with Python 3.12; do not copy virtual environments between computers.'
  }
  if ($env:CHEST_AI_PYTHON) {
    if (Test-ChestPython $env:CHEST_AI_PYTHON) { return $env:CHEST_AI_PYTHON }
    throw 'CHEST_AI_PYTHON must point to a working Python 3.12 executable.'
  }
  $command = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($command -and (Test-ChestPython $command.Source)) { return $command.Source }
  $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($launcher) {
    $candidate = & $launcher.Source -3.12 -c 'import sys; print(sys.executable)' 2>$null
    if ($LASTEXITCODE -eq 0 -and (Test-ChestPython "$candidate")) { return "$candidate" }
  }
  throw 'Install Python 3.12 and add it to PATH, or set CHEST_AI_PYTHON to its executable path.'
}

function Enable-ProjectPythonPath {
  $env:PYTHONPATH = $null
  $env:PYTHONNOUSERSITE = '1'
}

function Test-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutMs = 1200) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync($HostName, $Port)
    return $task.Wait($TimeoutMs) -and $client.Connected
  } catch { return $false } finally { $client.Dispose() }
}

function Assert-PortFree([int]$Port) {
  if (Test-TcpPort '127.0.0.1' $Port 300) { throw "Port $Port is already in use. Run npm stop or close the owning process." }
}
