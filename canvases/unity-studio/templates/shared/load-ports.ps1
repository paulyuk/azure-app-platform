function Import-UnityPorts([string] $AppRoot) {
  $Path = Join-Path $AppRoot ".unity-studio/ports.env"
  if (-not (Test-Path $Path)) { return }
  $Seen = @{}
  $Used = @{}
  foreach ($Line in Get-Content $Path) {
    if ([string]::IsNullOrWhiteSpace($Line)) { continue }
    if ($Line -cnotmatch '^(AGENT_PORT|WEB_PORT|SKILL_PORT|INVENTORY_SEARCH_PORT|TRADE_IN_VALUE_PORT|RATE_SHEET_PORT|DEAL_DOC_PORT|AZURITE_BLOB_PORT|AZURITE_QUEUE_PORT|AZURITE_TABLE_PORT)=([0-9]{4,5})$') {
      throw "Invalid port settings in .unity-studio/ports.env"
    }
    $Name = $Matches[1]
    $Port = [int]$Matches[2]
    if ($Port -lt 1024 -or $Port -gt 65535 -or $Seen.ContainsKey($Name) -or $Used.ContainsKey($Port)) {
      throw "Port settings must be unique integers from 1024 to 65535."
    }
    $Seen[$Name] = $true
    $Used[$Port] = $true
    Set-Item -Path "Env:$Name" -Value "$Port"
  }
}
