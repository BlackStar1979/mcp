param(
  [switch]$Execute,
  [string]$DeploymentId = ""
)

$ErrorActionPreference = "Stop"

$Base = "C:\Work"
$Next = Join-Path $Base "_mcp_next"
$Prod = Join-Path $Base "mcp"
$BackupBase = Join-Path $Base ".mcp_deploy_backups"

if (-not $DeploymentId) {
  $DeploymentId = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH-mm-ss-fffZ") + "_manual"
}

$BackupRoot = Join-Path $BackupBase $DeploymentId

$manifest = Get-Content (Join-Path $NEXT "validation\runtime_manifest.json") | ConvertFrom-Json
$Files = $manifest.files

function Check($Name, $ScriptBlock) {
  Write-Host "CHECK: $Name"
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    throw "CHECK FAILED: $Name (exit code $LASTEXITCODE)"
  }
  Write-Host "OK: $Name"
}

Check "syntax code_tools" { node --check (Join-Path $Next "code_tools.js") }
Check "syntax server_tools" { node --check (Join-Path $Next "server_tools.js") }
Check "contract" { node (Join-Path $Next "contract_check.js") $Next }
Check "registry" { node (Join-Path $Next "registry\validate_registry.js") }
Check "selfcheck" { node (Join-Path $Next "validation\system_selfcheck.js") }
Check "promotion gate" { node (Join-Path $Next "validation\promotion_gate.js") }

Write-Host "DeploymentId: $DeploymentId"
Write-Host "BackupRoot: $BackupRoot"
Write-Host "Mode:" ($(if ($Execute) { "EXECUTE" } else { "DRY_RUN" }))

foreach ($Rel in $Files) {
  $From = Join-Path $Next $Rel
  $To = Join-Path $Prod $Rel
  $BackupTo = Join-Path $BackupRoot $Rel

  if (-not (Test-Path $From)) {
    throw "Source missing: $From"
  }

  if ($Execute) {
    New-Item -ItemType Directory -Force -Path (Split-Path $To) | Out-Null
    if (Test-Path $To) {
      New-Item -ItemType Directory -Force -Path (Split-Path $BackupTo) | Out-Null
      Copy-Item $To $BackupTo -Force
    }
    Copy-Item $From $To -Force
  }

  Write-Host "FILE:" $Rel
}

if ($Execute) {
  Check "prod syntax code_tools" { node --check (Join-Path $Prod "code_tools.js") }
  Check "prod syntax server_tools" { node --check (Join-Path $Prod "server_tools.js") }
  Check "prod contract" { node (Join-Path $Prod "contract_check.js") $Prod }
  Check "prod registry" { node (Join-Path $Prod "registry\validate_registry.js") }
  Check "prod selfcheck" { node (Join-Path $Prod "validation\system_selfcheck.js") }
  Write-Host "DEPLOYMENT COMPLETE: $DeploymentId"
} else {
  Write-Host "DRY_RUN COMPLETE. Re-run with -Execute to deploy."
}
