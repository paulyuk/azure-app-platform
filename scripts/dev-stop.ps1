#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stops everything started by dev-start.ps1 (4 Hosted Skills, agent, web
    app), plus a best-effort sweep of anything still listening on their
    known ports even if this script's own state file is stale or missing.

.DESCRIPTION
    `func start` and `npm run dev` both spawn child processes, so killing
    only the PID Start-Process handed back can leave orphans behind. Instead
    this stops by port: find whatever process (if any) is LISTENing on each
    known port and kill its whole process tree. This is more reliable than
    trusting the state file alone, and also cleans up leftovers from a crash
    or a manually-started terminal on the same ports.

.EXAMPLE
    .\scripts\dev-stop.ps1
    Stops the 4 skills, the agent, and the web app - whatever is actually
    running on their ports, tracked or not.
#>
[CmdletBinding()]
param()

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $RepoRoot '.dev-run'
$StateFile = Join-Path $RunDir 'processes.json'

# Same ports dev-start.ps1 uses. Kept in sync manually - both scripts print
# them at start/stop so a mismatch would be obvious immediately.
$Targets = [ordered]@{
    'azurite-blob'     = 10000
    'azurite-queue'    = 10001
    'azurite-table'    = 10002
    'inventory-search' = 7071
    'trade-in-value'   = 7072
    'rate-sheet'       = 7073
    'deal-doc'         = 7074
    'agent'            = 8088
    'web'              = 3000
}

function Stop-ProcessTree {
    param([int]$ProcessId)
    try {
        # taskkill /T kills the whole tree (parent + children), which
        # Stop-Process alone does not do - needed for func.exe/node.exe
        # child workers spawned by func start / npm run dev.
        & taskkill /PID $ProcessId /T /F 2>$null | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Host "=== dev-stop ===" -ForegroundColor Green

$stoppedAny = $false
$stoppedPids = @{}

# Stop launchers recorded immediately by dev-start.ps1. This catches failed
# or still-booting processes that never reached LISTEN state.
if (Test-Path $StateFile) {
    try {
        $tracked = @(Get-Content $StateFile -Raw | ConvertFrom-Json)
        foreach ($entry in $tracked) {
            if (-not $entry.pid -or $stoppedPids.ContainsKey([int]$entry.pid)) {
                continue
            }
            $proc = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
            if ($proc) {
                $ok = Stop-ProcessTree -ProcessId $entry.pid
                $stoppedPids[[int]$entry.pid] = $true
                $stoppedAny = $true
                if ($ok) {
                    Write-Host ("{0,-18} tracked pid {1,-6} STOPPED ({2})" -f $entry.name, $entry.pid, $proc.ProcessName) -ForegroundColor Yellow
                }
            }
        }
    } catch {
        Write-Host "Could not read stale process state; continuing with port cleanup." -ForegroundColor Yellow
    }
}

foreach ($name in $Targets.Keys) {
    $port = $Targets[$name]
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host ("{0,-18} port {1,-6} nothing listening" -f $name, $port) -ForegroundColor DarkGray
        continue
    }

    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        if ($stoppedPids.ContainsKey([int]$procId)) {
            continue
        }
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $procName = if ($proc) { $proc.ProcessName } else { 'unknown' }
        $ok = Stop-ProcessTree -ProcessId $procId
        $stoppedAny = $true
        if ($ok) {
            Write-Host ("{0,-18} port {1,-6} STOPPED pid={2} ({3})" -f $name, $port, $procId, $procName) -ForegroundColor Yellow
        } else {
            Write-Host ("{0,-18} port {1,-6} FAILED to stop pid={2} ({3}) - stop it manually" -f $name, $port, $procId, $procName) -ForegroundColor Red
        }
    }
}

if (Test-Path $StateFile) {
    Remove-Item $StateFile -Force
}

Write-Host ""
if ($stoppedAny) {
    Write-Host "Done. Re-check with: Get-NetTCPConnection -LocalPort 10000,10001,10002,7071,7072,7073,7074,8088,3000 -State Listen -ErrorAction SilentlyContinue" -ForegroundColor Green
} else {
    Write-Host "Nothing was listening on any tracked port - already clean." -ForegroundColor Green
}
