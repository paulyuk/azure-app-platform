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

$subscriptionId = Assert-Value 'AZURE_SUBSCRIPTION_ID' (Get-AzdValue 'AZURE_SUBSCRIPTION_ID')
$resourceGroup = Assert-Value 'AI_GATEWAY_RESOURCE_GROUP' (Get-AzdValue 'AI_GATEWAY_RESOURCE_GROUP')
$gatewayName = Assert-Value 'AI_GATEWAY_NAME' (Get-AzdValue 'AI_GATEWAY_NAME')
$gatewayModel = Assert-Value 'AZURE_AI_GATEWAY_MODEL' (Get-AzdValue 'AZURE_AI_GATEWAY_MODEL')
$gatewayMiniModel = Assert-Value 'AZURE_AI_GATEWAY_MINI_MODEL' (Get-AzdValue 'AZURE_AI_GATEWAY_MINI_MODEL')

$gatewayResourceId = "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.ApiManagement/service/$gatewayName"
$gatewayUri = "https://management.azure.com$gatewayResourceId`?api-version=$AiGatewayApiVersion"

$gatewayUrl = Get-AzdValue 'AZURE_AI_GATEWAY_ENDPOINT'
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
    messages = @(@{ role = 'user'; content = 'Reply with exactly one word: ok' })
    max_completion_tokens = 128
} | ConvertTo-Json -Compress

$ready = $false
$status = 'unavailable'
for ($attempt = 1; $attempt -le 20; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri "$gatewayUrlTrimmed/default/models/openai/v1/chat/completions" `
            -Method Post `
            -Headers @{ 'Api-Key' = $gatewayApiKey; 'Content-Type' = 'application/json' } `
            -Body $requestBody `
            -UseBasicParsing `
            -SkipHttpErrorCheck
        $status = $response.StatusCode
    } catch {
        $status = 'unavailable'
    }
    if ($status -match '^2\d\d$') {
        $ready = $true
        break
    }
    Write-Host "Waiting for AI Gateway model route, attempt=$attempt, status=$status"
    Start-Sleep -Seconds 6
}
if (-not $ready) {
    Write-Error "AI Gateway model route did not become ready (HTTP $status)."
    exit 1
}

azd env set AZURE_AI_GATEWAY_ENDPOINT "$gatewayUrlTrimmed/"
azd env set AZURE_AI_GATEWAY_MODEL $gatewayModel
azd env set AZURE_AI_GATEWAY_MINI_MODEL $gatewayMiniModel
azd env set AZURE_AI_GATEWAY_API_KEY $gatewayApiKey | Out-Null

$agentEnvPath = Join-Path $RepoRoot 'src\agent\.env'
$agentEnvContent = @"
AZURE_AI_GATEWAY_ENDPOINT="$gatewayUrlTrimmed/"
AZURE_AI_GATEWAY_API_KEY="$gatewayApiKey"
AZURE_AI_GATEWAY_MODEL="$gatewayModel"
AZURE_AI_GATEWAY_MINI_MODEL="$gatewayMiniModel"
MOCK="0"
"@
Set-Content -Path $agentEnvPath -Value $agentEnvContent -NoNewline

Write-Host 'AI Gateway is ready. Local agent settings were written to src/agent/.env (key not displayed).'
Write-Host 'No TOOLBOX_ENDPOINT set, so the agent will run the Hosted Skills in-process from src/skills/.'
