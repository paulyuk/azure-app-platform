#!/usr/bin/env pwsh
# PowerShell equivalent of manage-ai-gateway-lifecycle.sh for Windows hosts where
# azd's "sh" shell resolves to WSL bash and cannot see Windows-style paths.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('prepare', 'cleanup')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'

$AiGatewayApiVersion = '2025-09-01-preview'
$DeletedServiceApiVersion = '2024-05-01'

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

function Invoke-AzRest {
    param([string[]]$Arguments)
    $output = & az rest @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return '' }
    return $output
}

$environmentName = $env:AZURE_ENV_NAME
if ([string]::IsNullOrEmpty($environmentName)) { $environmentName = Get-AzdValue 'AZURE_ENV_NAME' }

$subscriptionId = $env:AZURE_SUBSCRIPTION_ID
if ([string]::IsNullOrEmpty($subscriptionId)) { $subscriptionId = Get-AzdValue 'AZURE_SUBSCRIPTION_ID' }
if ([string]::IsNullOrEmpty($subscriptionId)) { $subscriptionId = (az account show --query id -o tsv) }

$resourceGroup = $env:AI_GATEWAY_RESOURCE_GROUP
if ([string]::IsNullOrEmpty($resourceGroup)) { $resourceGroup = Get-AzdValue 'AI_GATEWAY_RESOURCE_GROUP' }
if ([string]::IsNullOrEmpty($resourceGroup)) { $resourceGroup = 'rg-app-platform-aigateway' }

$gatewayName = $env:AI_GATEWAY_NAME
if ([string]::IsNullOrEmpty($gatewayName)) { $gatewayName = Get-AzdValue 'AI_GATEWAY_NAME' }

$location = $env:AI_GATEWAY_LOCATION
if ([string]::IsNullOrEmpty($location)) { $location = Get-AzdValue 'AI_GATEWAY_LOCATION' }
if ([string]::IsNullOrEmpty($location)) { $location = 'eastus2' }

$stateDir = Join-Path '.azure' $environmentName
$stateFile = Join-Path $stateDir 'apim-lifecycle.state'

if ([string]::IsNullOrEmpty($gatewayName)) {
    $query = "[?tags.`"azd-env-name`"=='$environmentName' && sku.name=='AIGateway'].name | [0]"
    $gatewayName = (az resource list --subscription $subscriptionId --resource-group $resourceGroup --resource-type Microsoft.ApiManagement/service --query $query -o tsv 2>$null)
    if ($LASTEXITCODE -ne 0) { $gatewayName = '' }
}
if ([string]::IsNullOrEmpty($gatewayName) -and (Test-Path $stateFile)) {
    $line = Select-String -Path $stateFile -Pattern '^gateway_name=' | Select-Object -Last 1
    if ($line) { $gatewayName = $line.Line -replace '^gateway_name=', '' }
}
if ([string]::IsNullOrEmpty($gatewayName)) {
    Write-Host 'No environment-owned AI Gateway needs lifecycle cleanup.'
    exit 0
}

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
"gateway_name=$gatewayName`nresource_group=$resourceGroup`nlocation=$location" | Set-Content -Path $stateFile -NoNewline:$false

$resourceId = "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.ApiManagement/service/$gatewayName"
$resourceUri = "https://management.azure.com$resourceId`?api-version=$AiGatewayApiVersion"
$deletedUri = "https://management.azure.com/subscriptions/$subscriptionId/providers/Microsoft.ApiManagement/locations/$location/deletedservices/$gatewayName`?api-version=$DeletedServiceApiVersion"

$state = Invoke-AzRest @('--method', 'get', '--uri', $resourceUri, '--query', 'properties.provisioningState', '-o', 'tsv')
$owner = Invoke-AzRest @('--method', 'get', '--uri', $resourceUri, '--query', 'tags."azd-env-name"', '-o', 'tsv')

if (-not [string]::IsNullOrEmpty($state) -and $owner -ne $environmentName) {
    Write-Error "Refusing to manage $resourceGroup/$gatewayName; ownership tag mismatch."
    exit 1
}

if ($Mode -eq 'prepare' -and $state -eq 'Succeeded') {
    Write-Host "Preserving healthy environment-owned AI Gateway $resourceGroup/$gatewayName."
    exit 0
}
if ($Mode -eq 'prepare' -and -not [string]::IsNullOrEmpty($state) -and $state -ne 'Failed' -and $state -ne 'Deleting') {
    Write-Error "AI Gateway is in nonterminal state $state; wait for Azure before retrying."
    exit 1
}
if (-not [string]::IsNullOrEmpty($state) -and $state -ne 'Deleting') {
    Write-Host "Deleting environment-owned AI Gateway $resourceGroup/$gatewayName."
    az rest --method delete --uri $resourceUri --headers 'If-Match=*' -o none
}

$startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$delay = 5
$quietStarted = $null

while ($true) {
    az rest --method get --uri $resourceUri -o none 2>$null
    if ($LASTEXITCODE -eq 0) {
        $quietStarted = $null
        Write-Host 'Waiting for AI Gateway deletion.'
    } else {
        $deletedServiceId = Invoke-AzRest @('--method', 'get', '--uri', $deletedUri, '--query', 'properties.serviceId', '-o', 'tsv')
        if (-not [string]::IsNullOrEmpty($deletedServiceId)) {
            if ($deletedServiceId.ToLowerInvariant() -ne $resourceId.ToLowerInvariant()) {
                Write-Error "Refusing to purge mismatched soft-deleted service $deletedServiceId."
                exit 1
            }
            Write-Host "Purging soft-deleted AI Gateway $gatewayName."
            az rest --method delete --uri $deletedUri -o none
            $quietStarted = $null
        } elseif ($null -eq $quietStarted) {
            $quietStarted = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        }
    }

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    if ($null -ne $quietStarted -and ($now - $quietStarted) -ge 180) {
        Write-Host 'AI Gateway deletion, purge, and managed-identity settle window completed.'
        exit 0
    }
    if (($now - $startedAt) -ge 900) {
        Write-Error 'AI Gateway cleanup did not settle within 900 seconds; rerun provisioning.'
        exit 1
    }
    Start-Sleep -Seconds $delay
    if ($delay -lt 30) {
        $delay = $delay * 2
        if ($delay -gt 30) { $delay = 30 }
    }
}
