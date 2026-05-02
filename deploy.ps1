param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("Status", "Prepare", "Execute")]
  [string]$Mode,

  [string]$Manifest = "",
  [string]$DeploymentId = "",
  [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$DeployRoot = Join-Path $Repo ".mcp_deploy"
$BackupRoot = Join-Path $Repo ".mcp_deploy_backup"
$AuditLog = Join-Path $Repo ".mcp_audit.log"

New-Item -ItemType Directory -Force -Path $DeployRoot | Out-Null
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

if (-not $DeploymentId) {
  $DeploymentId = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH-mm-ss-fffZ") + "_" + ([Guid]::NewGuid().ToString("N").Substring(0,8))
}

function Get-Sha256($Path) {
  return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Write-DeployAudit($Event, $Level, $Data) {
  $entry = [ordered]@{
    ts = (Get-Date).ToUniversalTime().ToString("o")
    level = $Level
    source = "deploy.ps1"
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

function Invoke-ValidationChecks($Phase) {
  if ($SkipChecks) {
    Write-DeployAudit "deploy_checks_skipped" "warn" @{ phase = $Phase }
    return
  }

  Write-DeployAudit "deploy_checks_start" "info" @{ phase = $Phase }

  Push-Location $Repo
  try {
    node --check "server_tools.js"
    if ($LASTEXITCODE -ne 0) { throw "node --check server_tools.js failed" }

    node --check "core/audit.js"
    if ($LASTEXITCODE -ne 0) { throw "node --check core/audit.js failed" }

    npm test
    if ($LASTEXITCODE -ne 0) { throw "npm test failed" }
  } finally {
    Pop-Location
  }

  Write-DeployAudit "deploy_checks_ok" "info" @{ phase = $Phase }
}

function Invoke-Prepare($ManifestPath) {
  if (-not $ManifestPath) { throw "Manifest required for Prepare mode" }
  if (-not (Test-Path $ManifestPath)) { throw "Manifest not found: $ManifestPath" }

  $manifestObj = Get-Content $ManifestPath -Raw | ConvertFrom-Json
  if (-not $manifestObj.files) { throw "Manifest has no files" }

  $prepared = @()
  foreach ($file in $manifestObj.files) {
    Assert-RelativeSafePath $file.source "source"
    Assert-RelativeSafePath $file.target "target"

    $sourceFull = Join-Path $Repo $file.source
    $targetFull = Join-Path $Repo $file.target
    if (-not (Test-Path $sourceFull)) { throw "Source missing: $($file.source)" }

    $targetExists = Test-Path $targetFull
    $prepared += [ordered]@{
      source = $file.source
      target = $file.target
      source_sha256 = Get-Sha256 $sourceFull
      source_bytes = (Get-Item $sourceFull).Length
      target_exists = $targetExists
      target_sha256 = $(if ($targetExists) { Get-Sha256 $targetFull } else { $null })
      target_bytes = $(if ($targetExists) { (Get-Item $targetFull).Length } else { $null })
    }
  }

  $record = [ordered]@{
    deployment_id = $DeploymentId
    deployment_name = $manifestObj.deployment_name
    prepared_at = (Get-Date).ToUniversalTime().ToString("o")
    manifest = $ManifestPath
    status = "prepared"
    files = $prepared
  }

  $out = Join-Path $DeployRoot "$DeploymentId.prepare.json"
  $record | ConvertTo-Json -Depth 20 | Set-Content -Path $out -Encoding UTF8
  Write-DeployAudit "deploy_prepare_ok" "info" @{ manifest = $ManifestPath; prepare_file = $out; file_count = $prepared.Count }
  Write-Host "PREPARED: $out"
}

if ($Mode -eq "Status") {
  Write-Host "DeployRoot: $DeployRoot"
  Write-Host "BackupRoot: $BackupRoot"
  Get-ChildItem $DeployRoot -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
  exit 0
}

try {
  Write-DeployAudit "deploy_start" "info" @{ mode = $Mode; manifest = $Manifest }
  if ($Mode -eq "Prepare") { Invoke-Prepare $Manifest }

  if ($Mode -eq "Execute") {
    Invoke-ValidationChecks "pre"
    if (-not $Manifest) { throw "Manifest required for Execute mode" }

    $manifestObj = Get-Content $Manifest -Raw | ConvertFrom-Json
    if (-not $manifestObj.files) { throw "Manifest has no files" }

    $backupDir = Join-Path $BackupRoot $DeploymentId
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

    $executed = @()

    foreach ($file in $manifestObj.files) {
      $sourceFull = Join-Path $Repo $file.source
      $targetFull = Join-Path $Repo $file.target

      if (-not (Test-Path $sourceFull)) { throw "Source missing: $($file.source)" }

      $sourceHash = Get-Sha256 $sourceFull
      $targetHashBefore = $null

      if (Test-Path $targetFull) {
        $targetHashBefore = Get-Sha256 $targetFull
        $backupPath = Join-Path $backupDir $file.target
        New-Item -ItemType Directory -Force -Path (Split-Path $backupPath) | Out-Null
        Copy-Item -Path $targetFull -Destination $backupPath -Force
      }

      Copy-Item -Path $sourceFull -Destination $targetFull -Force

      $targetHashAfter = Get-Sha256 $targetFull

      $executed += [ordered]@{
        source = $file.source
        target = $file.target
        source_sha256 = $sourceHash
        target_sha256_before = $targetHashBefore
        target_sha256_after = $targetHashAfter
      }
    }

    $record = [ordered]@{
      deployment_id = $DeploymentId
      executed_at = (Get-Date).ToUniversalTime().ToString("o")
      manifest = $Manifest
      backup_root = $backupDir
      files = $executed
      status = "executed"
    }

    $out = Join-Path $DeployRoot "$DeploymentId.executed.json"
    $record | ConvertTo-Json -Depth 20 | Set-Content -Path $out -Encoding UTF8

    Write-DeployAudit "deploy_execute_ok" "info" @{ executed_file = $out; file_count = $executed.Count }
    Write-Host "EXECUTED: $out"

    Invoke-ValidationChecks "post"
  }
  Write-DeployAudit "deploy_finish" "info" @{ mode = $Mode; status = "ok" }
} catch {
  Write-DeployAudit "deploy_error" "error" @{ mode = $Mode; error = $_.Exception.Message }
  throw
}
