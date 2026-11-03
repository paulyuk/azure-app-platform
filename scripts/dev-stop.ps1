#!/usr/bin/env pwsh
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$implementation = Join-Path $repoRoot 'canvases\azure-app-platform\templates\shared\dealer\scripts\dev-stop.ps1'
if (-not (Test-Path $implementation)) {
    throw "Dealer shutdown implementation not found: $implementation"
}

$previousRepoRoot = $env:DEALER_REPO_ROOT
$env:DEALER_REPO_ROOT = $repoRoot
try {
    & $implementation
} finally {
    $env:DEALER_REPO_ROOT = $previousRepoRoot
}
