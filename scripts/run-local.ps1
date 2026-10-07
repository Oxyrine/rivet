param([ValidateSet('api','web')][string]$Service='api')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if($Service -eq 'api') {
  $env:ENV='demo'
  $env:DISABLE_SQLALCHEMY_CEXT_RUNTIME='1'
  New-Item -ItemType Directory -Path (Join-Path $projectRoot 'data') -Force | Out-Null
  if (-not $env:DATABASE_URL) { $env:DATABASE_URL='sqlite:///data/local-demo.db' }
  & (Join-Path $projectRoot '.venv/Scripts/python.exe') -m uvicorn api.app.main:app --host 127.0.0.1 --port 8000
} else {
  Set-Location -LiteralPath (Join-Path $projectRoot 'web')
  & npm.cmd run dev
}
