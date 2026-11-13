$PortsFile = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path ".azure-app-platform/ports.json"
if (-not $env:WEB_PORT) {
  $env:WEB_PORT = "8080"
  if (Test-Path $PortsFile) {
    try {
      $ports = Get-Content $PortsFile -Raw | ConvertFrom-Json
      if ($ports.webPort) { $env:WEB_PORT = "$($ports.webPort)" }
    } catch {}
  }
}
if (-not $env:AGENT_PORT) {
  $env:AGENT_PORT = "8088"
  if (Test-Path $PortsFile) {
    try {
      $ports = Get-Content $PortsFile -Raw | ConvertFrom-Json
      if ($ports.agentPort) { $env:AGENT_PORT = "$($ports.agentPort)" }
    } catch {}
  }
}
