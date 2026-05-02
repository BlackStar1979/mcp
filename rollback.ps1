param(
  [Parameter(Mandatory=$true)]
  [string]$DeploymentId,

  [switch]$WhatIfOnly
)

$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $Repo) -eq ".mcp_warzone") {
  $Repo = Split-Path -Parent $Repo
}

$DeployRoot = Join-Path $Repo ".mcp_deploy"
$BackupRoot = Join-Path $Repo ".mcp_deploy_backup"
$AuditLog = Join-Path $Repo ".mcp_audit.log"

function Get-Sha256($Path) {
  return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Write-RollbackAudit($Event, $Level, $Data) {
  $entry = [ordered]@{
    ts = (Get-Date).ToUniversalTime().ToString("o")
    level = $Level
    source = "rollback.ps1"
    event = $Event
    action = $Event
    pid = $PID
    deployment_id = $DeploymentId
  }
  if ($Data) {
    foreach ($key in $Data.Keys) { $entry[$key] = $Data[$key] }
  }
  ($entry | ConvertTo-Json -Compress -Depth 20) | Add-Content -Path $AuditLog -Encoding UTF8
}

function Assert-RelativeSafePath($PathValue, $Kind) {
  if (-not $PathValue) { throw "$Kind path missing" }
  if ($PathValue -match "(^[A-Za-z]:)|(^\\\\)|(^|[\\/])\.\.([\\/]|$)") { throw "Unsafe $Kind path: $PathValue" }
}

function Remove-EmptyParentDirs($PathValue) {
  $dir = Split-Path $PathValue
  while ($dir -and ($dir -ne $Repo) -and ($dir.StartsWith($Repo))) {
    if ((Test-Path $dir) -and -not (Get-ChildItem $dir -Force | Select-Object -First 1)) {
      Remove-Item $dir -Force
      $dir = Split-Path $dir
    } else {
      break
    }
  }
}

$executedFile = Join-Path $DeployRoot "$DeploymentId.executed.json"
if (-not (Test-Path $executedFile)) { throw "Executed deployment record not found: $executedFile" }

try {
  Write-RollbackAudit "rollback_start" "info" @{ executed_file = $executedFile; what_if = [bool]$WhatIfOnly }

  $record = Get-Content $executedFile -Raw | ConvertFrom-Json
  if ($record.status -ne "executed") { throw "Deployment record is not executed: $($record.status)" }
  if (-not $record.files) { throw "Deployment record has no files" }

  $backupDir = Join-Path $BackupRoot $DeploymentId
  if (-not (Test-Path $backupDir)) { throw "Backup directory not found: $backupDir" }

  $rolledBack = @()

  foreach ($file in $record.files) {
    Assert-RelativeSafePath $file.target "target"

    $targetFull = Join-Path $Repo $file.target
    $backupFull = Join-Path $backupDir $file.target
    $targetExistedBeforeDeploy = $null -ne $file.target_sha256_before
    $targetExistsNow = Test-Path $targetFull

    if ($targetExistedBeforeDeploy) {
      if (-not $targetExistsNow) { throw "Target file missing: $targetFull" }
      if (-not (Test-Path $backupFull)) { throw "Backup file missing: $backupFull" }

      $targetBefore = Get-Sha256 $targetFull
      $backupHash = Get-Sha256 $backupFull

      if (-not $WhatIfOnly) {
        Copy-Item -Path $backupFull -Destination $targetFull -Force
      }

      $targetAfter = $(if ($WhatIfOnly) { $targetBefore } else { Get-Sha256 $targetFull })

      $rolledBack += [ordered]@{
        target = $file.target
        action = "restore"
        backup = $backupFull
        target_sha256_before = $targetBefore
        backup_sha256 = $backupHash
        target_sha256_after = $targetAfter
        applied = -not [bool]$WhatIfOnly
      }
    } else {
      if ($targetExistsNow) {
        $targetBefore = Get-Sha256 $targetFull
        if (-not $WhatIfOnly) {
          Remove-Item -Path $targetFull -Force
          Remove-EmptyParentDirs $targetFull
        }
        $rolledBack += [ordered]@{
          target = $file.target
          action = "delete_new_file"
          backup = $null
          target_sha256_before = $targetBefore
          backup_sha256 = $null
          target_sha256_after = $(if ($WhatIfOnly) { $targetBefore } else { $null })
          applied = -not [bool]$WhatIfOnly
        }
      } else {
        $rolledBack += [ordered]@{
          target = $file.target
          action = "already_absent"
          backup = $null
          target_sha256_before = $null
          backup_sha256 = $null
          target_sha256_after = $null
          applied = $false
        }
      }
    }
  }

  $rollbackRecord = [ordered]@{
    deployment_id = $DeploymentId
    rolled_back_at = (Get-Date).ToUniversalTime().ToString("o")
    status = $(if ($WhatIfOnly) { "rollback_dry_run" } else { "rolled_back" })
    files = $rolledBack
  }

  $suffix = $(if ($WhatIfOnly) { "rollback-dry-run" } else { "rollback" })
  $out = Join-Path $DeployRoot "$DeploymentId.$suffix.json"
  $rollbackRecord | ConvertTo-Json -Depth 20 | Set-Content -Path $out -Encoding UTF8

  Write-RollbackAudit "rollback_finish" "info" @{ rollback_file = $out; status = $rollbackRecord.status; file_count = $rolledBack.Count }
  Write-Host "ROLLBACK RECORD: $out"
} catch {
  Write-RollbackAudit "rollback_error" "error" @{ error = $_.Exception.Message }
  throw
}
