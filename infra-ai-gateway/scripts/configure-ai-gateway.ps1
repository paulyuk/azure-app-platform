#!/usr/bin/env pwsh
# PowerShell equivalent of configure-ai-gateway.sh for Windows hosts where
# azd's "sh" shell resolves to WSL bash and cannot see Windows-style paths.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$AiGatewayApiVersion = '2025-09-01-preview'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SliceRoot = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $SliceRoot

function Get-AzdValue {
    param([string]$Name)
    try {
        $value = azd env get-value $Name 2>$null
        if ($LASTEXITCODE -ne 0) { return '' }
        return $value
    } catch {
        return ''
    }
}

function Assert-Value {
    param([string]$Name, [string]$Value)
    if ([string]::IsNullOrEmpty($Value)) {
        Write-Error "$Name is required after azd provision."
        exit 1
    }
    return $Value
}

$subscriptionId = Assert-Value 'AZURE_SUBSCRIPTION_ID' $(if ($env:AZURE_SUBSCRIPTION_ID) { $env:AZURE_SUBSCRIPTION_ID } else { Get-AzdValue 'AZURE_SUBSCRIPTION_ID' })
$resourceGroup = Assert-Value 'AI_GATEWAY_RESOURCE_GROUP' $(if ($env:AI_GATEWAY_RESOURCE_GROUP) { $env:AI_GATEWAY_RESOURCE_GROUP } else { Get-AzdValue 'AI_GATEWAY_RESOURCE_GROUP' })
$gatewayName = Assert-Value 'AI_GATEWAY_NAME' $(if ($env:AI_GATEWAY_NAME) { $env:AI_GATEWAY_NAME } else { Get-AzdValue 'AI_GATEWAY_NAME' })

$gatewayResourceId = "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.ApiManagement/service/$gatewayName"
$gatewayUri = "https://management.azure.com$gatewayResourceId`?api-version=$AiGatewayApiVersion"

$explicitGatewaySelection = $env:UNITY_GATEWAY_SELECTION -eq '1'
$gatewayModel = if ($env:AZURE_AI_GATEWAY_MODEL) { $env:AZURE_AI_GATEWAY_MODEL } elseif (-not $explicitGatewaySelection) { Get-AzdValue 'AZURE_AI_GATEWAY_MODEL' } else { '' }
$gatewayMiniModel = if ($env:AZURE_AI_GATEWAY_MINI_MODEL) { $env:AZURE_AI_GATEWAY_MINI_MODEL } elseif (-not $explicitGatewaySelection) { Get-AzdValue 'AZURE_AI_GATEWAY_MINI_MODEL' } else { '' }
if ([string]::IsNullOrEmpty($gatewayModel) -or [string]::IsNullOrEmpty($gatewayMiniModel)) {
    Write-Host "Discovering models on AI Gateway $gatewayName..."
    $modelInventory = az rest --method get --uri "https://management.azure.com$gatewayResourceId/workspaces/default/models?api-version=$AiGatewayApiVersion" --query 'value[].name' -o tsv
    if ($LASTEXITCODE -ne 0) { throw 'Unable to discover models on the selected gateway. Check Azure access and retry.' }
    $modelNames = @(($modelInventory -join "`n") -split '\s+' | Where-Object { $_ })
    if ($modelNames.Count -eq 0) { throw "No models are configured on $gatewayName. Add a model in AI Gateway Studio or select another gateway." }
    $miniModel = $modelNames | Where-Object { $_ -match 'mini' } | Select-Object -First 1
    $fullModel = $modelNames | Where-Object { $_ -notmatch 'mini' } | Select-Object -First 1
    if ([string]::IsNullOrEmpty($gatewayMiniModel) -and $modelNames.Count -gt 0) {
        $gatewayMiniModel = if ($miniModel) { $miniModel } else { $modelNames[0] }
    }
    if ([string]::IsNullOrEmpty($gatewayModel)) {
        $gatewayModel = if ($fullModel) { $fullModel } elseif ($modelNames.Count -gt 0) { $modelNames[0] } else { '' }
    }
}
$gatewayModel = Assert-Value 'AZURE_AI_GATEWAY_MODEL' $gatewayModel
$gatewayMiniModel = Assert-Value 'AZURE_AI_GATEWAY_MINI_MODEL' $gatewayMiniModel

$gatewayUrl = $env:AZURE_AI_GATEWAY_ENDPOINT
if ([string]::IsNullOrEmpty($gatewayUrl) -and -not $explicitGatewaySelection) { $gatewayUrl = Get-AzdValue 'AZURE_AI_GATEWAY_ENDPOINT' }
if ([string]::IsNullOrEmpty($gatewayUrl)) {
    $gatewayUrl = (az rest --method get --uri $gatewayUri --query properties.gatewayUrl -o tsv)
}
if ([string]::IsNullOrEmpty($gatewayUrl)) {
    $runtimeHostname = (az rest --method get --uri $gatewayUri --query properties.runtimeHostname -o tsv)
    if (-not [string]::IsNullOrEmpty($runtimeHostname)) {
        $gatewayUrl = "https://$runtimeHostname/"
    }
}
$gatewayUrl = Assert-Value 'AZURE_AI_GATEWAY_ENDPOINT' $gatewayUrl

$gatewayApiKey = (az rest --method post --uri "https://management.azure.com$gatewayResourceId/apiKeys/default/listSecrets?api-version=$AiGatewayApiVersion" --body '{}' --query 'primaryKey || properties.primaryKey || primaryValue || properties.primaryValue' -o tsv 2>$null)
if ($LASTEXITCODE -ne 0) { $gatewayApiKey = '' }
if ([string]::IsNullOrEmpty($gatewayApiKey)) {
    $gatewayApiKey = (az rest --method post --uri "https://management.azure.com$gatewayResourceId/apiKeys/default/listValues?api-version=$AiGatewayApiVersion" --body '{}' --query 'primaryValue || properties.primaryValue || primaryKey || properties.primaryKey' -o tsv)
}
$gatewayApiKey = Assert-Value 'AZURE_AI_GATEWAY_API_KEY' $gatewayApiKey

$gatewayUrlTrimmed = $gatewayUrl.TrimEnd('/')
$requestBody = @{
    model = $gatewayModel
    input = 'Reply with exactly one word: ok'
    max_output_tokens = 128
    stream = $false
} | ConvertTo-Json -Compress

$ready = $false
$status = 'unavailable'
Write-Host "Validating model $gatewayModel on gateway $gatewayName..."
for ($attempt = 1; $attempt -le 20; $attempt++) {
    $hasReadableMessage = $false
    try {
        $response = Invoke-WebRequest -Uri "$gatewayUrlTrimmed/default/models/openai/v1/responses" `
            -Method Post `
            -Headers @{ 'Api-Key' = $gatewayApiKey; 'Content-Type' = 'application/json' } `
            -Body $requestBody `
            -UseBasicParsing `
            -TimeoutSec 30 `
            -SkipHttpErrorCheck
        $status = $response.StatusCode
        $payload = $response.Content | ConvertFrom-Json
        $hasReadableMessage = $null -ne (
            $payload.output |
                Where-Object { $_.type -eq 'message' } |
                ForEach-Object { $_.content } |
                Where-Object { $_.type -eq 'output_text' -and -not [string]::IsNullOrWhiteSpace($_.text) } |
                Select-Object -First 1
        )
    } catch {
        $status = 'unavailable'
    }
    if ($status -match '^2\d\d$' -and $hasReadableMessage) {
        $ready = $true
        break
    }
    Write-Host "Waiting for AI Gateway model route, attempt=$attempt, status=$status"
    Start-Sleep -Seconds 6
}
if (-not $ready) {
    Write-Error "AI Gateway Responses route did not return a readable message (HTTP $status)."
    exit 1
}

$lockAcquired = $false
$stateDirectory = Join-Path $RepoRoot '.unity-studio'
$lockDirectory = Join-Path $stateDirectory 'gateway-config.lock'
$lockPidPath = Join-Path $lockDirectory 'pid'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
try {
    for ($attempt = 1; $attempt -le 600; $attempt++) {
        try {
            New-Item -ItemType Directory -Path $lockDirectory -ErrorAction Stop | Out-Null
            Set-Content -Path $lockPidPath -Value $PID -NoNewline
            $lockAcquired = $true
            break
        } catch [System.IO.IOException] {
            Start-Sleep -Milliseconds 200
        }
    }
    if (-not $lockAcquired) {
        Write-Error "Timed out waiting to apply AI Gateway settings. If no configuration is running, remove $lockDirectory and retry."
        exit 1
    }
    $activeGatewayPath = Join-Path $stateDirectory 'active-gateway.json'
    if (-not [string]::IsNullOrEmpty($env:UNITY_GATEWAY_CONFIGURATION_ID)) {
        $activeGateway = Get-Content -Raw $activeGatewayPath | ConvertFrom-Json
        $currentConfigurationId = $activeGateway.configurationId
        if ($currentConfigurationId -ne $env:UNITY_GATEWAY_CONFIGURATION_ID) {
            Write-Host 'Gateway configuration was superseded before settings were applied.'
            exit 3
        }
    } else {
        $activeGateway = [pscustomobject]@{
            name = $gatewayName
            resourceGroup = $resourceGroup
            location = ''
            subscriptionId = $subscriptionId
            endpoint = "$gatewayUrlTrimmed/"
            selectedAt = [DateTimeOffset]::UtcNow.ToString('o')
        }
    }

    if (-not [string]::IsNullOrEmpty((Get-AzdValue 'AZURE_ENV_NAME'))) {
        azd env set AZURE_AI_GATEWAY_ENDPOINT "$gatewayUrlTrimmed/"
        azd env set AZURE_AI_GATEWAY_MODEL $gatewayModel
        azd env set AZURE_AI_GATEWAY_MINI_MODEL $gatewayMiniModel
        azd env set AZURE_AI_GATEWAY_API_KEY $gatewayApiKey | Out-Null
    }

    $agentEnvPath = Join-Path $RepoRoot 'src\agent\.env'
    $agentEnvContent = @"
AI_GATEWAY_NAME="$gatewayName"
AI_GATEWAY_RESOURCE_GROUP="$resourceGroup"
AZURE_SUBSCRIPTION_ID="$subscriptionId"
AZURE_AI_GATEWAY_ENDPOINT="$gatewayUrlTrimmed/"
AZURE_AI_GATEWAY_API_KEY="$gatewayApiKey"
AZURE_AI_GATEWAY_MODEL="$gatewayModel"
AZURE_AI_GATEWAY_MINI_MODEL="$gatewayMiniModel"
MOCK="0"
"@
    [System.IO.File]::WriteAllText(
        $agentEnvPath,
        $agentEnvContent,
        [System.Text.UTF8Encoding]::new($false)
    )

    $activeGateway | Add-Member -NotePropertyName configurationStatus -NotePropertyValue 'ready' -Force
    $activeGateway | Add-Member -NotePropertyName configuredAt -NotePropertyValue ([DateTimeOffset]::UtcNow.ToString('o')) -Force
    $activeGateway | Add-Member -NotePropertyName lastExitCode -NotePropertyValue 0 -Force
    $activeGateway | Add-Member -NotePropertyName lastSignal -NotePropertyValue $null -Force
    $activeGatewayTempPath = "$activeGatewayPath.$PID.tmp"
    [System.IO.File]::WriteAllText(
        $activeGatewayTempPath,
        (($activeGateway | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
        [System.Text.UTF8Encoding]::new($false)
    )
    Move-Item -Force $activeGatewayTempPath $activeGatewayPath
} finally {
    if ($lockAcquired) {
        Remove-Item $lockPidPath -ErrorAction Stop
        Remove-Item $lockDirectory -ErrorAction Stop
    }
}

Write-Host 'AI Gateway is ready. Local agent settings were written to src/agent/.env (key not displayed).'
Write-Host 'No TOOLBOX_ENDPOINT set. Run locally to start each Hosted Skill as a separate Functions MCP service; the agent will bind to those local endpoints.'
