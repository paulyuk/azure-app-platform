#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts the full local "live" deal-finder stack in the right order: the 4
    Hosted Skills (MCP tool servers), the agent, and the web app.

.DESCRIPTION
    Each Hosted Skill is a normal uv project with its own pyproject.toml.
    Startup follows the README pattern exactly: run `uv run func start` from
    inside each skill folder and let uv create/sync `.venv` automatically.
    On Microsoft corp networks, the script defaults uv to the documented
    internal package mirror unless UV_DEFAULT_INDEX or UV_INDEX_URL is already
    set. It also creates each missing local.settings.json from its example,
    filling in the AI Gateway endpoint/key from src/agent/.env.

    Start order matters: skills first (so the agent's own startup diagnostics
    can connect to them), then the agent, then the web app last.

.PARAMETER SkipSkills
    Don't start the 4 Hosted Skills (e.g. you already have them running, or
    you're using a real Foundry Toolbox via TOOLBOX_ENDPOINT).

.PARAMETER SkipAgent
    Don't start the deal-finder agent.

.PARAMETER SkipWeb
    Don't start the Next.js web app.

.PARAMETER KeepExisting
    Reuse live processes already recorded for this workspace. Untracked
    listeners are never reused or stopped.

.EXAMPLE
    .\scripts\dev-start.ps1
    Starts everything: 4 skills, agent, web app.

.EXAMPLE
    .\scripts\dev-start.ps1 -SkipSkills
    Starts just the agent + web app (e.g. tools already up, or using a real
    Foundry Toolbox).
#>
[CmdletBinding()]
param(
    [switch]$SkipSkills,
    [switch]$SkipAgent,
    [switch]$SkipWeb,
    [switch]$KeepExisting
)

$ErrorActionPreference = 'Stop'

$DealerScriptRoot = if ($env:DEALER_SCRIPT_DIR) { $env:DEALER_SCRIPT_DIR } else { $PSScriptRoot }
$RepoRoot = if ($env:DEALER_REPO_ROOT) { $env:DEALER_REPO_ROOT } else { Split-Path -Parent $DealerScriptRoot }
$RunDir = Join-Path $RepoRoot '.dev-run'
$LogDir = Join-Path $RunDir 'logs'
$StateFile = Join-Path $RunDir 'processes.json'

$portLoader = Join-Path $DealerScriptRoot 'load-ports.ps1'
if (-not (Test-Path $portLoader)) {
    $portLoader = Join-Path $RepoRoot 'canvases\unity-studio\templates\shared\load-ports.ps1'
}
if (-not (Test-Path $portLoader)) {
    throw 'Port loader not found. Expected scripts\load-ports.ps1 or the Unity Studio shared loader.'
}
. $portLoader
Import-UnityPorts $RepoRoot

function Resolve-Port {
    param([string]$Name, [int]$Default)
    $raw = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrEmpty($raw)) {
        return $Default
    }
    $port = 0
    if (-not [int]::TryParse($raw, [ref]$port) -or $port -lt 1024 -or $port -gt 65535) {
        throw "$Name must be an integer from 1024 to 65535."
    }
    return $port
}

$WebPort = Resolve-Port 'WEB_PORT' 3000
$AgentPort = Resolve-Port 'AGENT_PORT' 8088
$InventorySearchPort = Resolve-Port 'INVENTORY_SEARCH_PORT' 7071
$TradeInValuePort = Resolve-Port 'TRADE_IN_VALUE_PORT' 7072
$RateSheetPort = Resolve-Port 'RATE_SHEET_PORT' 7073
$DealDocPort = Resolve-Port 'DEAL_DOC_PORT' 7074
$AzuriteBlobPort = Resolve-Port 'AZURITE_BLOB_PORT' 10000
$AzuriteQueuePort = Resolve-Port 'AZURITE_QUEUE_PORT' 10001
$AzuriteTablePort = Resolve-Port 'AZURITE_TABLE_PORT' 10002

$selectedPorts = @(
    $WebPort, $AgentPort, $InventorySearchPort, $TradeInValuePort,
    $RateSheetPort, $DealDocPort, $AzuriteBlobPort, $AzuriteQueuePort,
    $AzuriteTablePort
)
if (($selectedPorts | Sort-Object -Unique).Count -ne $selectedPorts.Count) {
    throw 'Dealer ports must be unique.'
}
@{
    WEB_PORT = $WebPort
    AGENT_PORT = $AgentPort
    INVENTORY_SEARCH_PORT = $InventorySearchPort
    TRADE_IN_VALUE_PORT = $TradeInValuePort
    RATE_SHEET_PORT = $RateSheetPort
    DEAL_DOC_PORT = $DealDocPort
    AZURITE_BLOB_PORT = $AzuriteBlobPort
    AZURITE_QUEUE_PORT = $AzuriteQueuePort
    AZURITE_TABLE_PORT = $AzuriteTablePort
}.GetEnumerator() | ForEach-Object {
    [Environment]::SetEnvironmentVariable($_.Key, "$($_.Value)", 'Process')
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw 'uv was not found on PATH. Install uv, then rerun this script.'
}

if (-not $KeepExisting) {
    Write-Host "[setup] stopping this workspace's tracked processes so startup order is deterministic..." -ForegroundColor DarkCyan
    & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
    # taskkill is asynchronous with respect to child handle cleanup. Give
    # Node/Functions workers a moment to release ports and log handles before
    # recreating the stack.
    Start-Sleep -Seconds 2
}

# Skills to start, in the order they're listed.
$Skills = [ordered]@{
    'inventory-search' = $InventorySearchPort
    'trade-in-value'   = $TradeInValuePort
    'rate-sheet'       = $RateSheetPort
    'deal-doc'         = $DealDocPort
}

# Automate src/README.md "Corporate network / proxy note" exactly:
# 1. respect an explicit uv index;
# 2. otherwise inherit pip's configured index, if it has one;
# 3. otherwise use Microsoft's package feed proxy.
# Public files.pythonhosted.org is blocked by the Microsoft corporate proxy.
if (-not $env:UV_DEFAULT_INDEX -and -not $env:UV_INDEX_URL) {
    $indexUrl = $env:PIP_INDEX_URL
    if (-not $indexUrl) {
        $indexUrl = (& python -m pip config get global.index-url 2>$null)
        if ($LASTEXITCODE -ne 0) {
            $indexUrl = $null
        }
    }
    if (-not $indexUrl) {
        $indexUrl = 'https://packagefeedproxy.microsoft.io/pypi/simple/'
    }
    $env:UV_INDEX_URL = $indexUrl
    $env:UV_DEFAULT_INDEX = $indexUrl
    Write-Host "[setup] uv index not set; using the README-resolved package index." -ForegroundColor DarkCyan
} else {
    Write-Host "[setup] using the caller-configured uv package index." -ForegroundColor DarkCyan
}

# Existing state (if any) from a prior run this script didn't clean up.
$existing = @()
if (Test-Path $StateFile) {
    try {
        $existing = @(Get-Content $StateFile -Raw | ConvertFrom-Json)
    } catch {
        $existing = @()
    }
}

$processes = New-Object System.Collections.Generic.List[object]

function Test-PortListening {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return [bool]$conns
}

function Test-TrackedProcess {
    param([object]$Entry)
    if (-not $Entry -or -not $Entry.pid) {
        return $false
    }
    $process = Get-Process -Id $Entry.pid -ErrorAction SilentlyContinue
    if (-not $process) {
        return $false
    }
    if ($Entry.startedAt) {
        $actual = $process.StartTime.ToUniversalTime().ToString('O')
        if ($actual -ne $Entry.startedAt) {
            return $false
        }
    }
    return $true
}

function Save-ProcessState {
    if ($processes.Count -eq 0) {
        Set-Content -Path $StateFile -Value '[]'
    } else {
        $processes | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile
    }
}

if ($KeepExisting) {
    foreach ($entry in $existing) {
        if (Test-TrackedProcess -Entry $entry) {
            $processes.Add($entry)
        }
    }
    Save-ProcessState
}

function Wait-PortListening {
    param(
        [string]$Name,
        [int]$Port,
        [int]$TimeoutSeconds = 120
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) {
            Write-Host ("[{0}] READY on port {1}" -f $Name, $Port) -ForegroundColor Green
            return $true
        }
        $entry = $processes | Where-Object name -EQ $Name | Select-Object -First 1
        if ($entry.pid -and -not (Get-Process -Id $entry.pid -ErrorAction SilentlyContinue)) {
            Write-Host ("[{0}] process exited before opening port {1}" -f $Name, $Port) -ForegroundColor Red
            foreach ($logPath in @($entry.log, $entry.errlog)) {
                if ($logPath -and (Test-Path $logPath)) {
                    Write-Host "--- tail: $logPath ---" -ForegroundColor Red
                    Get-Content $logPath -Tail 40 | Write-Host
                }
            }
            return $false
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Host ("[{0}] FAILED to listen on port {1} within {2}s" -f $Name, $Port, $TimeoutSeconds) -ForegroundColor Red
    $entry = $processes | Where-Object name -EQ $Name | Select-Object -First 1
    if ($entry) {
        foreach ($logPath in @($entry.log, $entry.errlog)) {
            if ($logPath -and (Test-Path $logPath)) {
                Write-Host "--- tail: $logPath ---" -ForegroundColor Red
                Get-Content $logPath -Tail 40 | Write-Host
            }
        }
    }
    return $false
}

function Start-Tracked {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [int]$Port
    )

    if (Test-PortListening -Port $Port) {
        $owned = $processes |
            Where-Object { $_.name -eq $Name -and $_.port -eq $Port -and (Test-TrackedProcess -Entry $_) } |
            Select-Object -First 1
        if ($owned) {
            Write-Host ("[{0}] already running for this workspace on port {1}" -f $Name, $Port) -ForegroundColor Yellow
            return $owned
        }
        $message = "[$Name] cannot start: port $Port is owned by an untracked process. Reallocate this app's ports and retry."
        & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
        throw $message
    }

    $stdout = Join-Path $LogDir "$Name.out.log"
    $stderrLog = Join-Path $LogDir "$Name.err.log"

    Write-Host ("[{0}] starting in {1} -> port {2} (log: {3})" -f $Name, $WorkingDirectory, $Port, $stdout) -ForegroundColor Cyan

    $proc = Start-Process -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderrLog `
        -WindowStyle Hidden `
        -PassThru

    $processes.Add([pscustomobject]@{
        name        = $Name
        port        = $Port
        pid         = $proc.Id
        log         = $stdout
        errlog      = $stderrLog
        started     = $true
        preexisting = $false
        startedAt   = $proc.StartTime.ToUniversalTime().ToString('O')
    })
    Save-ProcessState
    return $processes[$processes.Count - 1]
}

function Add-TrackedAlias {
    param(
        [string]$Name,
        [int]$Port,
        [object]$Source
    )
    if (-not ($processes | Where-Object { $_.name -eq $Name -and $_.port -eq $Port })) {
        $processes.Add([pscustomobject]@{
            name        = $Name
            port        = $Port
            pid         = $Source.pid
            log         = $Source.log
            errlog      = $Source.errlog
            started     = $Source.started
            preexisting = $Source.preexisting
            startedAt   = $Source.startedAt
        })
        Save-ProcessState
    }
}

if (-not $SkipSkills) {
    $azuriteCommand = Get-Command azurite.cmd -ErrorAction SilentlyContinue
    if (-not $azuriteCommand) {
        throw "Azurite is required by the Hosted Skills. Install it with 'npm install -g azurite', then rerun this script."
    }
    $azuriteEntryPoint = Join-Path (Split-Path -Parent $azuriteCommand.Source) 'node_modules\azurite\dist\src\azurite.js'
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not (Test-Path $azuriteEntryPoint)) {
        throw "Azurite is installed but its Node entry point could not be resolved. Reinstall it with 'npm install -g azurite'."
    }
    foreach ($target in @(
        [pscustomobject]@{ name = 'azurite'; port = $AzuriteBlobPort },
        [pscustomobject]@{ name = 'azurite-queue'; port = $AzuriteQueuePort },
        [pscustomobject]@{ name = 'azurite-table'; port = $AzuriteTablePort }
    )) {
        if (Test-PortListening -Port $target.port) {
            $owned = $processes |
                Where-Object { $_.name -eq $target.name -and $_.port -eq $target.port -and (Test-TrackedProcess -Entry $_) } |
                Select-Object -First 1
            if (-not $owned) {
                & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
                throw "[$($target.name)] port $($target.port) is owned by an untracked process. Reallocate this app's ports and retry."
            }
        }
    }

    $azuriteProcess = Start-Tracked -Name 'azurite' -WorkingDirectory $RepoRoot `
        -FilePath $nodeCommand.Source `
        -ArgumentList @(
            $azuriteEntryPoint,
            '--silent',
            '--inMemoryPersistence',
            '--skipApiVersionCheck',
            '--disableTelemetry',
            '--blobPort', "$AzuriteBlobPort",
            '--queuePort', "$AzuriteQueuePort",
            '--tablePort', "$AzuriteTablePort"
        ) -Port $AzuriteBlobPort
    Add-TrackedAlias -Name 'azurite-queue' -Port $AzuriteQueuePort -Source $azuriteProcess
    Add-TrackedAlias -Name 'azurite-table' -Port $AzuriteTablePort -Source $azuriteProcess
    if (
        -not (Wait-PortListening -Name 'azurite' -Port $AzuriteBlobPort -TimeoutSeconds 30) -or
        -not (Wait-PortListening -Name 'azurite-queue' -Port $AzuriteQueuePort -TimeoutSeconds 30) -or
        -not (Wait-PortListening -Name 'azurite-table' -Port $AzuriteTablePort -TimeoutSeconds 30)
    ) {
        & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
        throw "Azurite failed to start. The Hosted Skills, agent, and web app were not started."
    }
}

if (-not $SkipSkills) {
    $azuriteAccountName = 'devstoreaccount1'
    $azuriteAccountKey = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='
    $storageConnectionString = "DefaultEndpointsProtocol=http;AccountName=$azuriteAccountName;AccountKey=$azuriteAccountKey;BlobEndpoint=http://127.0.0.1:$AzuriteBlobPort/$azuriteAccountName;QueueEndpoint=http://127.0.0.1:$AzuriteQueuePort/$azuriteAccountName;TableEndpoint=http://127.0.0.1:$AzuriteTablePort/$azuriteAccountName;"
    $agentEnvFile = Join-Path $RepoRoot 'src\agent\.env'
    $gatewayEndpoint = $null
    $gatewayKey = $null
    if (Test-Path $agentEnvFile) {
        foreach ($line in Get-Content $agentEnvFile) {
            if ($line -match '^\s*AZURE_AI_GATEWAY_ENDPOINT\s*=\s*"?([^"]+)"?\s*$') { $gatewayEndpoint = $Matches[1].TrimEnd('/') }
            if ($line -match '^\s*AZURE_AI_GATEWAY_API_KEY\s*=\s*"?([^"]+)"?\s*$') { $gatewayKey = $Matches[1] }
        }
    }

    foreach ($name in $Skills.Keys) {
        $port = $Skills[$name]
        $skillDir = Join-Path $RepoRoot "src\skills\$name"
        $localSettings = Join-Path $skillDir 'local.settings.json'
        $localSettingsExample = Join-Path $skillDir 'local.settings.json.example'

        if (-not (Test-Path $localSettings)) {
            if (-not $gatewayEndpoint -or -not $gatewayKey) {
                & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
                throw "[$name] missing worktree-local gateway configuration. New git worktrees do not inherit gitignored .azure, src/agent/.env, or skill local.settings.json files. Copy them from an already-provisioned sibling worktree, or run 'azd provision' in infra-ai-gateway for this worktree."
            }
            Write-Host ("[{0}] no local.settings.json yet - creating one from the .example, filled in from src/agent/.env..." -f $name) -ForegroundColor DarkCyan
            $settingsJson = Get-Content $localSettingsExample -Raw
            $settingsJson = $settingsJson.Replace('<AZURE_AI_GATEWAY_ENDPOINT>', $gatewayEndpoint).Replace('<AZURE_AI_GATEWAY_API_KEY>', $gatewayKey)
            Set-Content -Path $localSettings -Value $settingsJson
        }

        try {
            $settings = Get-Content $localSettings -Raw | ConvertFrom-Json
            if (-not $settings.Values) {
                $settings | Add-Member -NotePropertyName Values -NotePropertyValue ([pscustomobject]@{})
            }
            if ($settings.Values.PSObject.Properties.Name -contains 'AzureWebJobsStorage') {
                $settings.Values.AzureWebJobsStorage = $storageConnectionString
            } else {
                $settings.Values | Add-Member -NotePropertyName AzureWebJobsStorage -NotePropertyValue $storageConnectionString
            }
            $settings | ConvertTo-Json -Depth 20 | Set-Content -Path $localSettings -Encoding utf8
        } catch {
            & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
            throw "[$name] could not update local.settings.json for the selected Azurite ports: $($_.Exception.Message)"
        }

        # Run from the skill directory and let its pyproject.toml drive venv
        # creation and dependency sync. `func` is resolved from the inherited
        # PATH while uv exposes the skill's environment to the Functions host.
        $null = Start-Tracked -Name $name -WorkingDirectory $skillDir -FilePath 'uv' `
            -ArgumentList @('run', 'func', 'start', '--port', "$port") -Port $port
    }

    $skillsReady = $true
    foreach ($name in $Skills.Keys) {
        if (-not (Wait-PortListening -Name $name -Port $Skills[$name])) {
            $skillsReady = $false
        }
    }
    if (-not $skillsReady) {
        Save-ProcessState
        & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
        throw "One or more Hosted Skills failed to start. The agent and web app were not started; see the log tails above."
    }
}

if (-not $SkipAgent) {
    $agentDir = Join-Path $RepoRoot 'src\agent'
    if (-not (Test-Path (Join-Path $agentDir '.env'))) {
        & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
        throw "src/agent/.env is missing. New git worktrees do not inherit gitignored Azure state or environment files. Copy .azure and the .env/local.settings.json files from an already-provisioned sibling worktree, or run 'azd provision' in infra-ai-gateway for this worktree."
    } else {
        $otelVariables = @(
            'OTEL_EXPORTER_OTLP_ENDPOINT',
            'OTEL_EXPORTER_OTLP_PROTOCOL',
            'OTEL_EXPORTER_OTLP_TRACES_PROTOCOL',
            'OTEL_EXPORTER_OTLP_METRICS_PROTOCOL'
        )
        $otelValues = @{}
        foreach ($variable in $otelVariables) {
            $otelValues[$variable] = [Environment]::GetEnvironmentVariable($variable, 'Process')
            [Environment]::SetEnvironmentVariable($variable, $null, 'Process')
        }
        try {
            $null = Start-Tracked -Name 'agent' -WorkingDirectory $agentDir -FilePath 'uv' `
                -ArgumentList @('run', 'main.py') -Port $AgentPort
        } finally {
            foreach ($variable in $otelVariables) {
                [Environment]::SetEnvironmentVariable($variable, $otelValues[$variable], 'Process')
            }
        }
        if (-not (Wait-PortListening -Name 'agent' -Port $AgentPort)) {
            Save-ProcessState
            & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
            throw "The deal-finder agent failed to start. The web app was not started; see the log tails above."
        }
    }
}

if (-not $SkipWeb) {
    $webDir = Join-Path $RepoRoot 'src\web'
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
        throw "npm.cmd was not found on PATH. Install Node.js/npm, then rerun this script."
    }
    Write-Host "[web] installing/syncing npm dependencies..." -ForegroundColor DarkCyan
    Push-Location $webDir
    try {
        & $npmCommand.Source install --no-audit --no-fund
        $npmExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($npmExitCode -ne 0) {
        Save-ProcessState
        & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
        throw "The web app's npm dependencies failed to install. The local stack was stopped."
    }
    $previousAgentUrl = [Environment]::GetEnvironmentVariable('AGENT_URL', 'Process')
    [Environment]::SetEnvironmentVariable('AGENT_URL', "http://127.0.0.1:$AgentPort", 'Process')
    try {
        $null = Start-Tracked -Name 'web' -WorkingDirectory $webDir -FilePath $npmCommand.Source `
            -ArgumentList @('run', 'dev', '--', '--port', "$WebPort") -Port $WebPort
    } finally {
        [Environment]::SetEnvironmentVariable('AGENT_URL', $previousAgentUrl, 'Process')
    }
    if (-not (Wait-PortListening -Name 'web' -Port $WebPort)) {
        Save-ProcessState
        & (Join-Path $DealerScriptRoot 'dev-stop.ps1')
        throw "The web app failed to start; see the log tails above."
    }
}

Save-ProcessState

Write-Host ""
Write-Host "=== dev-start summary ===" -ForegroundColor Green
$processes | ForEach-Object {
    $status = if ($_.skipped) { "SKIPPED ($($_.skipped))" }
              elseif ($_.preexisting) { "ALREADY RUNNING (not started by this script)" }
              elseif ($_.started) { "STARTED pid=$($_.pid)" }
              else { "UNKNOWN" }
    "{0,-18} port {1,-6} {2}" -f $_.name, $_.port, $status
} | Write-Host

Write-Host ""
Write-Host "Endpoints:" -ForegroundColor Green
Write-Host ("  {0,-18} http://127.0.0.1:{1} (Blob Storage emulator)" -f 'azurite', $AzuriteBlobPort)
Write-Host ("  {0,-18} http://127.0.0.1:{1} (Queue Storage emulator)" -f 'azurite-queue', $AzuriteQueuePort)
Write-Host ("  {0,-18} http://127.0.0.1:{1} (Table Storage emulator)" -f 'azurite-table', $AzuriteTablePort)
foreach ($name in $Skills.Keys) {
    Write-Host ("  {0,-18} http://localhost:{1}/runtime/webhooks/mcp" -f $name, $Skills[$name])
}
Write-Host ("  {0,-18} http://127.0.0.1:{1}/responses" -f 'agent', $AgentPort)
Write-Host ("  {0,-18} http://localhost:{1}" -f 'web', $WebPort)

Write-Host ""
Write-Host "Logs: $LogDir  (tail with: Get-Content <file> -Wait -Tail 40)" -ForegroundColor Green
Write-Host "State: $StateFile" -ForegroundColor Green
Write-Host "Watch the agent log for 'CONNECTED, discovered N tool(s)' or 'FAILED to connect' per skill." -ForegroundColor Green
Write-Host "Stop everything this script started with: .\scripts\dev-stop.ps1" -ForegroundColor Green
