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
    Don't clean up processes already listening on the stack's known ports.
    By default the script starts fresh so the required order is guaranteed:
    skills ready first, then agent, then web.

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

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $RepoRoot '.dev-run'
$LogDir = Join-Path $RunDir 'logs'
$StateFile = Join-Path $RunDir 'processes.json'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not $KeepExisting) {
    Write-Host "[setup] stopping leftovers so startup order is deterministic..." -ForegroundColor DarkCyan
    & (Join-Path $PSScriptRoot 'dev-stop.ps1')
    # taskkill is asynchronous with respect to child handle cleanup. Give
    # Node/Functions workers a moment to release ports and log handles before
    # recreating the stack.
    Start-Sleep -Seconds 2
}

# Skills to start, in the order they're listed. Ports match
# LOCAL_SKILL_PORTS in src/agent/main.py.
$Skills = [ordered]@{
    'inventory-search' = 7071
    'trade-in-value'   = 7072
    'rate-sheet'       = 7073
    'deal-doc'         = 7074
}

$AzuritePort = 10000
$AgentPort = 8088
$WebPort = 3000

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
    Write-Host "[setup] uv index not set; using README-resolved package index: $indexUrl" -ForegroundColor DarkCyan
} else {
    $indexUrl = if ($env:UV_DEFAULT_INDEX) { $env:UV_DEFAULT_INDEX } else { $env:UV_INDEX_URL }
    Write-Host "[setup] using caller-configured uv package index: $indexUrl" -ForegroundColor DarkCyan
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
        Write-Host ("[{0}] already something listening on port {1} - skipping start, will still be reported below" -f $Name, $Port) -ForegroundColor Yellow
        $processes.Add([pscustomobject]@{
            name        = $Name
            port        = $Port
            pid         = $null
            log         = $null
            started     = $false
            preexisting = $true
        })
        return
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
    })
    $processes | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile
}

if (-not $SkipSkills) {
    $azuriteCommand = Get-Command azurite.cmd -ErrorAction SilentlyContinue
    if (-not $azuriteCommand) {
        throw "Azurite is required because the skills use AzureWebJobsStorage=UseDevelopmentStorage=true. Install it with 'npm install -g azurite', then rerun this script."
    }
    $azuriteEntryPoint = Join-Path (Split-Path -Parent $azuriteCommand.Source) 'node_modules\azurite\dist\src\azurite.js'
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not (Test-Path $azuriteEntryPoint)) {
        throw "Azurite is installed but its Node entry point could not be resolved. Reinstall it with 'npm install -g azurite'."
    }
    Start-Tracked -Name 'azurite' -WorkingDirectory $RepoRoot `
        -FilePath $nodeCommand.Source `
        -ArgumentList @(
            $azuriteEntryPoint,
            '--silent',
            '--inMemoryPersistence',
            '--skipApiVersionCheck',
            '--disableTelemetry'
        ) -Port $AzuritePort
    if (-not (Wait-PortListening -Name 'azurite' -Port $AzuritePort -TimeoutSeconds 30)) {
        & (Join-Path $PSScriptRoot 'dev-stop.ps1')
        throw "Azurite failed to start. The Hosted Skills, agent, and web app were not started."
    }
}

if (-not $SkipSkills) {
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
                Write-Host ("[{0}] SKIPPED - no local.settings.json and can't auto-create one: src/agent/.env is missing or doesn't have AZURE_AI_GATEWAY_ENDPOINT/AZURE_AI_GATEWAY_API_KEY yet. Run 'azd provision' in infra-ai-gateway first (see TESTING.md)." -f $name) -ForegroundColor Red
                $processes.Add([pscustomobject]@{ name = $name; port = $port; pid = $null; log = $null; started = $false; preexisting = $false; skipped = 'no src/agent/.env' })
                continue
            }
            Write-Host ("[{0}] no local.settings.json yet - creating one from the .example, filled in from src/agent/.env..." -f $name) -ForegroundColor DarkCyan
            $settingsJson = Get-Content $localSettingsExample -Raw
            $settingsJson = $settingsJson.Replace('<AZURE_AI_GATEWAY_ENDPOINT>', $gatewayEndpoint).Replace('<AZURE_AI_GATEWAY_API_KEY>', $gatewayKey)
            Set-Content -Path $localSettings -Value $settingsJson
        }

        # Run from the skill directory and let its pyproject.toml drive venv
        # creation and dependency sync. `func` is resolved from the inherited
        # PATH while uv exposes the skill's environment to the Functions host.
        Start-Tracked -Name $name -WorkingDirectory $skillDir -FilePath 'uv' `
            -ArgumentList @('run', 'func', 'start', '--port', "$port") -Port $port
    }

    $skillsReady = $true
    foreach ($name in $Skills.Keys) {
        if (-not (Wait-PortListening -Name $name -Port $Skills[$name])) {
            $skillsReady = $false
        }
    }
    if (-not $skillsReady) {
        $processes | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile
        & (Join-Path $PSScriptRoot 'dev-stop.ps1')
        throw "One or more Hosted Skills failed to start. The agent and web app were not started; see the log tails above."
    }
}

if (-not $SkipAgent) {
    $agentDir = Join-Path $RepoRoot 'src\agent'
    if (-not (Test-Path (Join-Path $agentDir '.env'))) {
        Write-Host "[agent] SKIPPED - no src/agent/.env found. Run 'azd provision' in infra-ai-gateway first (see TESTING.md)." -ForegroundColor Red
        $processes.Add([pscustomobject]@{ name = 'agent'; port = $AgentPort; pid = $null; log = $null; started = $false; preexisting = $false; skipped = 'no .env' })
    } else {
        Start-Tracked -Name 'agent' -WorkingDirectory $agentDir -FilePath 'uv' `
            -ArgumentList @('run', 'main.py') -Port $AgentPort
        if (-not (Wait-PortListening -Name 'agent' -Port $AgentPort)) {
            $processes | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile
            & (Join-Path $PSScriptRoot 'dev-stop.ps1')
            throw "The deal-finder agent failed to start. The web app was not started; see the log tails above."
        }
    }
}

if (-not $SkipWeb) {
    $webDir = Join-Path $RepoRoot 'src\web'
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        throw "npm.cmd was not found on PATH. Install Node.js/npm, then rerun this script."
    }
    Start-Tracked -Name 'web' -WorkingDirectory $webDir -FilePath $npmCommand.Source `
        -ArgumentList @('run', 'dev') -Port $WebPort
    if (-not (Wait-PortListening -Name 'web' -Port $WebPort)) {
        $processes | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile
        & (Join-Path $PSScriptRoot 'dev-stop.ps1')
        throw "The web app failed to start; see the log tails above."
    }
}

# Merge with any still-alive processes from a previous run we didn't stop.
foreach ($old in $existing) {
    if ($processes.name -notcontains $old.name) {
        $stillAlive = $false
        if ($old.pid) {
            $stillAlive = [bool](Get-Process -Id $old.pid -ErrorAction SilentlyContinue)
        }
        if ($stillAlive) {
            $processes.Add($old)
        }
    }
}

$processes | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile

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
Write-Host ("  {0,-18} http://127.0.0.1:{1} (Blob Storage emulator)" -f 'azurite', $AzuritePort)
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
