. (Join-Path $PSScriptRoot 'common.ps1')
Enable-ProjectPythonPath
$python = Resolve-ChestAiPython
& $python (Join-Path $PSScriptRoot 'download-model.py')
if ($LASTEXITCODE -ne 0) { throw 'Disease model preparation failed. See docs/MODEL_DOWNLOAD.md.' }
& $python (Join-Path $PSScriptRoot 'download-image-gate.py')
if ($LASTEXITCODE -ne 0) { throw 'Image admission model preparation failed. Check network access to Hugging Face and retry npm run models:prepare.' }
