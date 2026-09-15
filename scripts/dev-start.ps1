#!/usr/bin/env pwsh
# Canonical implementation loads load-ports.ps1 and honors:
# WEB_PORT AGENT_PORT SKILL_PORT INVENTORY_SEARCH_PORT TRADE_IN_VALUE_PORT
# RATE_SHEET_PORT DEAL_DOC_PORT AZURITE_BLOB_PORT AZURITE_QUEUE_PORT
# AZURITE_TABLE_PORT
[CmdletBinding()]
param(
    [switch]$SkipSkills,
    [switch]$SkipAgent,
    [switch]$SkipWeb,
    [switch]$KeepExisting
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$implementation = Join-Path $repoRoot 'canvases\unity-studio\templates\shared\dealer\scripts\dev-start.ps1'
if (-not (Test-Path $implementation)) {
    throw "Dealer startup implementation not found: $implementation"
}

$previousRepoRoot = $env:DEALER_REPO_ROOT
$previousScriptDir = $env:DEALER_SCRIPT_DIR
$env:DEALER_REPO_ROOT = $repoRoot
$env:DEALER_SCRIPT_DIR = $PSScriptRoot
try {
    & $implementation @PSBoundParameters
} finally {
    $env:DEALER_REPO_ROOT = $previousRepoRoot
    $env:DEALER_SCRIPT_DIR = $previousScriptDir
}
