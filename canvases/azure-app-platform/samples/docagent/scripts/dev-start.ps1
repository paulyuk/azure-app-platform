param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $RuntimeArguments
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $Root ".dev-run"
. (Join-Path $PSScriptRoot "load-ports.ps1")
Import-AppPorts $Root
$AgentPort = if ($env:AGENT_PORT) { [int]$env:AGENT_PORT } else { 8088 }
$AgentRuntime = $null

foreach ($Argument in @($RuntimeArguments)) {
  if (-not $Argument) { continue }
  switch ($Argument) {
    "--agent-runtime=local" { $AgentRuntime = "local" }
    "--agent-runtime=copilot-sdk-sandbox" { $AgentRuntime = "copilot-sdk-sandbox" }
    "--help" {
      Write-Host "Usage: .\scripts\dev-start.ps1 [--agent-runtime=local|copilot-sdk-sandbox]"
      exit 0
    }
    "-h" {
      Write-Host "Usage: .\scripts\dev-start.ps1 [--agent-runtime=local|copilot-sdk-sandbox]"
      exit 0
    }
    default { throw "Unknown option: $Argument" }
  }
}

Remove-Item Env:UV_FROZEN, Env:UV_LOCKED, Env:UV_OFFLINE, Env:UV_NO_SYNC, Env:UV_EXTRA_INDEX_URL -ErrorAction SilentlyContinue
$env:UV_INDEX_URL = if ($env:UV_INDEX_URL) { $env:UV_INDEX_URL } else { "https://packagefeedproxy.microsoft.io/pypi/simple/" }
$env:UV_DEFAULT_INDEX = $env:UV_INDEX_URL
$env:PIP_INDEX_URL = if ($env:PIP_INDEX_URL) { $env:PIP_INDEX_URL } else { $env:UV_INDEX_URL }
$SelectedRuntimeArguments = if ($AgentRuntime) { @("--agent-runtime=$AgentRuntime") } else { @() }
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw "uv is required." }
Push-Location (Join-Path $Root "src/agent")
try {
  & uv sync
  if ($LASTEXITCODE -ne 0) { throw "Dependency sync failed; see the error above." }
  & uv run main.py @SelectedRuntimeArguments --check-runtime
  if ($LASTEXITCODE -ne 0) { throw "Runtime configuration failed; see the error above." }
} finally { Pop-Location }
& (Join-Path $PSScriptRoot "dev-stop.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Startup aborted because the previous tracked process could not be stopped. Resolve the reported process and rerun dev-stop.ps1; the existing registry was preserved."
}
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
if (Get-NetTCPConnection -LocalPort $AgentPort -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $AgentPort is in use by another process. Stop that app first."
}
$env:AGENT_PORT = "$AgentPort"

function Show-AgentLogs {
  foreach ($Path in @((Join-Path $RunDir "agent.stdout.log"), (Join-Path $RunDir "agent.stderr.log"))) {
    if (Test-Path $Path) {
      Get-Content $Path -Tail 120 | Write-Host
    }
  }
}

function Wait-Port($Name, $Port, $Process) {
  $Deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ([DateTime]::UtcNow -lt $Deadline) {
    $Process.Refresh()
    if ($Process.HasExited) {
      Show-AgentLogs
      throw "$Name exited before opening port $Port"
    }
    try {
      $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
      if ($Health.status -eq "ok") {
        Write-Host "[$Name] HEALTHY on port $Port"
        return
      }
    } catch [System.Net.Http.HttpRequestException] { }
      catch [System.Threading.Tasks.TaskCanceledException] { }
    Start-Sleep -Milliseconds 250
  }
  Show-AgentLogs
  throw "$Name timed out opening port $Port"
}

$processes = @()
try {
  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw "uv is required." }
  $agent = Start-Process uv `
    -ArgumentList (@("run", "main.py") + $SelectedRuntimeArguments) `
    -WorkingDirectory (Join-Path $Root "src/agent") `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $RunDir "agent.stdout.log") `
    -RedirectStandardError (Join-Path $RunDir "agent.stderr.log") `
    -PassThru
  try {
    $StartedAt = $agent.StartTime.ToUniversalTime().ToString("O")
  } catch {
    $StartedAt = $null
  }
  $processes += @{ name = "agent"; port = $AgentPort; pid = $agent.Id; startedAt = $StartedAt }
  $processes | ConvertTo-Json | Set-Content (Join-Path $RunDir "processes.json")
  if (-not $StartedAt) {
    throw "Could not record process start identity for PID $($agent.Id). Automatic cleanup is unsafe; verify and stop that process manually, then remove $RunDir."
  }
  Wait-Port "agent" $AgentPort $agent
  Write-Host "Inspect /health for the selected runtime. Local execution is not ACA isolation."
  Write-Host "docs-agent5 started: agent http://localhost:$AgentPort"
} catch {
  & (Join-Path $PSScriptRoot "dev-stop.ps1")
  throw
}
