$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\common.ps1')
Enable-ProjectPythonPath
$pythonExecutable = Resolve-ChestAiPython
Push-Location $PSScriptRoot
try {
    & $pythonExecutable -m uvicorn main:app --host 127.0.0.1 --port 8000
    if ($LASTEXITCODE -ne 0) { throw '影像分析服务启动失败' }
} finally {
    Pop-Location
}