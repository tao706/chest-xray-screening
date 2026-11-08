param([switch]$Force)
. (Join-Path $PSScriptRoot 'common.ps1')
$tool = Join-Path $PSScriptRoot 'local-database.mjs'
$status = & node $tool status
if ($LASTEXITCODE -ne 0) { throw 'Install server dependencies first: npm run setup.' }
if (-not $Force -and ($status | ConvertFrom-Json).ready) { Write-Host 'Existing local configuration retained. Use npm run configure -- -Force to change it.'; return }
function Read-Default([string]$Label, [string]$Default) {
  $value = Read-Host "$Label [$Default]"
  if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
  return $value
}
function Read-Secret([string]$Label) {
  $secret = Read-Host $Label -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }
}
$config = @{
  DB_HOST = Read-Default 'MySQL host' '127.0.0.1'
  DB_PORT = Read-Default 'MySQL port' '3306'
  DB_USER = Read-Default 'MySQL user (needs schema creation privileges)' 'root'
  DB_NAME = Read-Default 'Database name' 'chest_xray'
  AUTH_DEMO_USERNAME = Read-Default 'Initial administrator username' 'admin'
}
$config.DB_PASSWORD = Read-Secret 'MySQL password'
$config.AUTH_DEMO_PASSWORD = Read-Secret 'Initial administrator password (at least 12 characters)'
$confirmation = Read-Secret 'Confirm initial administrator password'
if ($config.AUTH_DEMO_PASSWORD -cne $confirmation) { $config.Clear(); $confirmation = $null; throw 'Passwords do not match. Configuration was not changed.' }
$confirmation = $null
$previousOutputEncoding = $OutputEncoding
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  $config | ConvertTo-Json -Compress | & node $tool save
  if ($LASTEXITCODE -ne 0) { throw 'Configuration not saved. Retry npm run configure.' }
} finally { $config.Clear(); $OutputEncoding = $previousOutputEncoding }
