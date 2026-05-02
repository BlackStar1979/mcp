param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("Status", "Enable", "Disable", "Report", "Tail")]
  [string]$Mode,

  [int]$Limit = 200,
  [int]$Top = 20
)

$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$FlagFile = Join-Path $Repo ".mcp_perf_on"
$PerfLog = Join-Path $Repo ".mcp_perf.log"
$AuditLog = Join-Path $Repo ".mcp_audit.log"

function Write-PerfAudit($Event, $Level, $Data) {
  $entry = [ordered]@{
    ts = (Get-Date).ToUniversalTime().ToString("o")
    level = $Level
    source = "perf.ps1"
    event = $Event
    action = $Event
    pid = $PID
  }
  if ($Data) {
    foreach ($key in $Data.Keys) { $entry[$key] = $Data[$key] }
  }
  ($entry | ConvertTo-Json -Compress -Depth 20) | Add-Content -Path $AuditLog -Encoding UTF8
}

function Read-PerfRows($MaxRows) {
  if (-not (Test-Path $PerfLog)) { return @() }
  $lines = Get-Content $PerfLog -Tail $MaxRows
  $rows = @()
  foreach ($line in $lines) {
    if (-not $line) { continue }
    try { $rows += ($line | ConvertFrom-Json) } catch {}
  }
  return $rows
}

function Show-Status {
  [ordered]@{
    enabled_by_flag = Test-Path $FlagFile
    flag_file = $FlagFile
    log_file = $PerfLog
    log_exists = Test-Path $PerfLog
    log_bytes = $(if (Test-Path $PerfLog) { (Get-Item $PerfLog).Length } else { 0 })
  } | ConvertTo-Json -Depth 5
}

function Show-Report {
  $rows = Read-PerfRows $Limit
  $slow = @($rows | Where-Object { $_.slow -eq $true })
  $errors = @($rows | Where-Object { $_.ok -eq $false })
  $toolRows = @($rows | Where-Object { $_.type -eq "tool" })
  $requestRows = @($rows | Where-Object { $_.type -eq "request" })

  $topSlow = @($rows | Sort-Object -Property ms -Descending | Select-Object -First $Top | ForEach-Object {
    [ordered]@{
      ts = $_.ts
      type = $_.type
      name = $_.name
      method = $_.method
      url = $_.url
      ms = $_.ms
      slow = $_.slow
      ok = $_.ok
      error = $_.error
    }
  })

  $byTool = @($toolRows | Group-Object -Property name | ForEach-Object {
    $items = @($_.Group)
    $avg = if ($items.Count) { ($items | Measure-Object -Property ms -Average).Average } else { 0 }
    $max = if ($items.Count) { ($items | Measure-Object -Property ms -Maximum).Maximum } else { 0 }
    [ordered]@{
      name = $_.Name
      count = $items.Count
      avg_ms = [math]::Round($avg, 3)
      max_ms = [math]::Round($max, 3)
      slow_count = @($items | Where-Object { $_.slow -eq $true }).Count
      error_count = @($items | Where-Object { $_.ok -eq $false }).Count
    }
  } | Sort-Object -Property max_ms -Descending | Select-Object -First $Top)

  [ordered]@{
    status = "ok"
    sampled = $rows.Count
    tool_calls = $toolRows.Count
    requests = $requestRows.Count
    slow_count = $slow.Count
    error_count = $errors.Count
    top_slow = $topSlow
    by_tool = $byTool
  } | ConvertTo-Json -Depth 20
}

try {
  if ($Mode -eq "Enable") {
    New-Item -ItemType File -Force -Path $FlagFile | Out-Null
    Write-PerfAudit "perf_enable" "info" @{ flag_file = $FlagFile }
    Show-Status
    exit 0
  }

  if ($Mode -eq "Disable") {
    if (Test-Path $FlagFile) { Remove-Item $FlagFile -Force }
    Write-PerfAudit "perf_disable" "info" @{ flag_file = $FlagFile }
    Show-Status
    exit 0
  }

  if ($Mode -eq "Status") {
    Show-Status
    exit 0
  }

  if ($Mode -eq "Tail") {
    if (Test-Path $PerfLog) { Get-Content $PerfLog -Tail $Limit }
    exit 0
  }

  if ($Mode -eq "Report") {
    Show-Report
    exit 0
  }
} catch {
  Write-PerfAudit "perf_error" "error" @{ mode = $Mode; error = $_.Exception.Message }
  throw
}
