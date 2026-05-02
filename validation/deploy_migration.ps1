param(
    [switch]$Execute
)

$Source = "C:\Work\_mcp_next\mcp_new"
$Target = "C:\Work\mcp"

Write-Host "== MCP STRUCTURE MIGRATION =="
Write-Host "Source: $Source"
Write-Host "Target: $Target"
Write-Host "Execute: $Execute"

if (-not (Test-Path $Source)) {
    throw "Missing staging: $Source"
}

$BackupDir = "C:\Work\.mcp_deploy_backups\migration_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

Copy-Item $Target $BackupDir -Recurse -Force
Write-Host "BACKUP: $BackupDir"

if ($Execute) {
    Get-ChildItem $Target -Force |
        Where-Object {
            $_.Name -notlike ".mcp_*" -and
            $_.Name -ne "node_modules"
        } |
        Remove-Item -Recurse -Force

    Copy-Item "$Source\*" $Target -Recurse -Force -Exclude "node_modules"

    Write-Host "DEPLOYED NEW STRUCTURE"
    Write-Host "PRESERVED: node_modules"
} else {
    Write-Host "DRY RUN - no changes applied"
}

Write-Host "DONE"
