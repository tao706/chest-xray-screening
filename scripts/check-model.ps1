. (Join-Path $PSScriptRoot "common.ps1")
$root = Get-ProjectRoot
Enable-ProjectPythonPath
$python = Resolve-ChestAiPython
Push-Location (Join-Path $root "inference")
try {
  & $python "model_self_check.py"
  if ($LASTEXITCODE -ne 0) { throw "Model contract self-check failed." }
} finally {
  Pop-Location
}
