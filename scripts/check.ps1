param([ValidateSet('all','thesis','ledger','exceptions','proof','sync','openapi')][string]$Target='all')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$env:ENV='test'
$env:DISABLE_SQLALCHEMY_CEXT_RUNTIME='1'
$pythonPath=Join-Path $projectRoot '.venv/Scripts/python.exe'
if ($Target -eq 'openapi') {
  & $pythonPath scripts/export_openapi.py
} else {
  $testPath = if($Target -eq 'all') {'tests'} elseif($Target -eq 'thesis') {'tests/test_thesis.py'} else {"tests/$Target"}
  & $pythonPath -m pytest $testPath --basetemp=.test-tmp-check -q
}
exit $LASTEXITCODE
