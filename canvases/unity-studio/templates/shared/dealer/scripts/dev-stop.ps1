#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stops everything this workspace's dev-start.ps1 recorded.

.DESCRIPTION
    `func start` and `npm run dev` both spawn child processes, so killing
    only the PID Start-Process handed back can leave orphans behind. This
    script kills each recorded launcher's process tree, but never sweeps
    ports or terminates an untracked process from another Unity app.

.EXAMPLE
    .\scripts\dev-stop.ps1
    Stops the tracked Azurite, skills, agent, and web app process trees.
#>
[CmdletBinding()]
param()

$RepoRoot = if ($env:DEALER_REPO_ROOT) { $env:DEALER_REPO_ROOT } else { Split-Path -Parent $PSScriptRoot }
$RunDir = Join-Path $RepoRoot '.dev-run'
$StateFile = Join-Path $RunDir 'processes.json'

function Stop-ProcessTree {
    param([int]$ProcessId)
    try {
        # taskkill /T kills the whole tree (parent + children), which
        # Stop-Process alone does not do - needed for func.exe/node.exe
        # child workers spawned by func start / npm run dev.
        & taskkill /PID $ProcessId /T /F 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

Write-Host "=== dev-stop ===" -ForegroundColor Green

$stoppedAny = $false
$stoppedPids = @{}
$protectedPids = @{}
$ancestorPid = [int]$PID
while ($ancestorPid -gt 0 -and -not $protectedPids.ContainsKey($ancestorPid)) {
    $protectedPids[$ancestorPid] = $true
    try {
        $ancestor = Get-CimInstance Win32_Process -Filter "ProcessId=$ancestorPid" -ErrorAction Stop
        $ancestorPid = [int]$ancestor.ParentProcessId
    } catch {
        break
    }
}

# Stop launchers recorded immediately by dev-start.ps1. This catches failed
# or still-booting processes that never reached LISTEN state.
if (Test-Path $StateFile) {
    try {
        $tracked = @(Get-Content $StateFile -Raw | ConvertFrom-Json)
        foreach ($entry in $tracked) {
            $trackedPid = 0
            if (
                -not $entry.pid -or
                -not [int]::TryParse("$($entry.pid)", [ref]$trackedPid) -or
                $trackedPid -le 1 -or
                $protectedPids.ContainsKey($trackedPid)
            ) {
                if ($entry.pid) {
                    Write-Host ("{0,-18} tracked pid {1,-6} SKIPPED (protected or invalid PID)" -f $entry.name, $entry.pid) -ForegroundColor Yellow
                }
                continue
            }
            if ($stoppedPids.ContainsKey($trackedPid)) {
                continue
            }
            $proc = Get-Process -Id $trackedPid -ErrorAction SilentlyContinue
            if ($proc) {
                if ($entry.startedAt) {
                    $actualStart = $proc.StartTime.ToUniversalTime().ToString('O')
                    if ($actualStart -ne $entry.startedAt) {
                        Write-Host ("{0,-18} tracked pid {1,-6} SKIPPED (PID was reused)" -f $entry.name, $entry.pid) -ForegroundColor Yellow
                        continue
                    }
                }
                $ok = Stop-ProcessTree -ProcessId $trackedPid
                $stoppedPids[$trackedPid] = $true
                if ($ok) {
                    $stoppedAny = $true
                    Write-Host ("{0,-18} tracked pid {1,-6} STOPPED ({2})" -f $entry.name, $entry.pid, $proc.ProcessName) -ForegroundColor Yellow
                } else {
                    Write-Host ("{0,-18} tracked pid {1,-6} FAILED to stop ({2})" -f $entry.name, $entry.pid, $proc.ProcessName) -ForegroundColor Red
                }
            }
        }
    } catch {
        Write-Host "Could not read process state; no untracked processes will be stopped." -ForegroundColor Yellow
    }
}

if (Test-Path $StateFile) {
    Remove-Item $StateFile -Force
}

Write-Host ""
if ($stoppedAny) {
    Write-Host "Done. This workspace's tracked process trees were stopped." -ForegroundColor Green
} else {
    Write-Host "No live processes owned by this workspace were recorded." -ForegroundColor Green
}
