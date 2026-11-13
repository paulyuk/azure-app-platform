#!/usr/bin/env pwsh
# PowerShell equivalent of configure-ai-gateway.sh for Windows hosts where
# azd's "sh" shell resolves to WSL bash and cannot see Windows-style paths.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Remove-Item Env:UV_FROZEN, Env:UV_LOCKED, Env:UV_OFFLINE, Env:UV_NO_SYNC, Env:UV_EXTRA_INDEX_URL -ErrorAction SilentlyContinue
$env:UV_INDEX_URL = if ($env:UV_INDEX_URL) { $env:UV_INDEX_URL } else { 'https://packagefeedproxy.microsoft.io/pypi/simple/' }
$env:UV_DEFAULT_INDEX = $env:UV_INDEX_URL
$env:PIP_INDEX_URL = if ($env:PIP_INDEX_URL) { $env:PIP_INDEX_URL } else { $env:UV_INDEX_URL }

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

$explicitGatewaySelection = $env:APP_PLATFORM_GATEWAY_SELECTION -eq '1'
$gatewayModel = if ($env:AZURE_AI_GATEWAY_MODEL) { $env:AZURE_AI_GATEWAY_MODEL } elseif (-not $explicitGatewaySelection) { Get-AzdValue 'AZURE_AI_GATEWAY_MODEL' } else { '' }
$gatewayMiniModel = if ($env:AZURE_AI_GATEWAY_MINI_MODEL) { $env:AZURE_AI_GATEWAY_MINI_MODEL } elseif (-not $explicitGatewaySelection) { Get-AzdValue 'AZURE_AI_GATEWAY_MINI_MODEL' } else { '' }
if ([string]::IsNullOrEmpty($gatewayModel) -or [string]::IsNullOrEmpty($gatewayMiniModel)) {
    Write-Host "Discovering models on AI Gateway $gatewayName..."
    $aliasInventory = az aigateway model-alias list --subscription $subscriptionId -g $resourceGroup --gateway-name $gatewayName --query '[].properties.aliasName' -o tsv 2>$null
    $modelInventory = az aigateway model list --subscription $subscriptionId -g $resourceGroup --gateway-name $gatewayName --query '[].name' -o tsv 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrEmpty(($aliasInventory -join ''))) {
        $modelInventory = @($aliasInventory; $modelInventory)
    }
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty(($modelInventory -join ''))) {
        $modelInventory = az rest --method get --uri "https://management.azure.com/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.ApiManagement/aigateways/$gatewayName/workspaces/default/models?api-version=$AiGatewayApiVersion" --query 'value[].name' -o tsv 2>$null
    }
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty(($modelInventory -join ''))) {
        $modelInventory = az rest --method get --uri "https://management.azure.com$gatewayResourceId/workspaces/default/models?api-version=$AiGatewayApiVersion" --query 'value[].name' -o tsv
        if ($LASTEXITCODE -ne 0) { throw 'Unable to discover models on the selected gateway. Check Azure access and retry.' }
    }
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
    $cliHostname = (az aigateway show --subscription $subscriptionId -g $resourceGroup -n $gatewayName --query 'properties.gatewayUrl || properties.frontend.defaultHostname || properties.runtimeHostname' -o tsv 2>$null)
    if (-not [string]::IsNullOrEmpty($cliHostname)) {
        $gatewayUrl = if ($cliHostname -match '^https?://') { $cliHostname } else { "https://$cliHostname/" }
    }
}
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

$gatewayApiKey = (az aigateway api-key list-secrets --subscription $subscriptionId -g $resourceGroup --gateway-name $gatewayName -n master --query 'primaryKey || properties.primaryKey || primaryValue || properties.primaryValue' -o tsv 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($gatewayApiKey)) {
    $firstKeyName = (az aigateway api-key list --subscription $subscriptionId -g $resourceGroup --gateway-name $gatewayName --query '[0].name' -o tsv 2>$null)
    if (-not [string]::IsNullOrEmpty($firstKeyName)) {
        $gatewayApiKey = (az aigateway api-key list-secrets --subscription $subscriptionId -g $resourceGroup --gateway-name $gatewayName -n $firstKeyName --query 'primaryKey || properties.primaryKey || primaryValue || properties.primaryValue' -o tsv 2>$null)
    }
}
if ([string]::IsNullOrEmpty($gatewayApiKey)) {
    $gatewayApiKey = (az rest --method post --uri "https://management.azure.com$gatewayResourceId/apiKeys/default/listSecrets?api-version=$AiGatewayApiVersion" --body '{}' --query 'primaryKey || properties.primaryKey || primaryValue || properties.primaryValue' -o tsv 2>$null)
    if ($LASTEXITCODE -ne 0) { $gatewayApiKey = '' }
}
if ([string]::IsNullOrEmpty($gatewayApiKey)) {
    $gatewayApiKey = (az rest --method post --uri "https://management.azure.com$gatewayResourceId/apiKeys/default/listValues?api-version=$AiGatewayApiVersion" --body '{}' --query 'primaryValue || properties.primaryValue || primaryKey || properties.primaryKey' -o tsv)
}
$gatewayApiKey = Assert-Value 'AZURE_AI_GATEWAY_API_KEY' $gatewayApiKey

$gatewayUrlTrimmed = $gatewayUrl.TrimEnd('/')
$requestBody = @{
    model = $gatewayModel
    input = 'Reply with exactly one word: ok'
    max_output_tokens = 512
    stream = $false
} | ConvertTo-Json -Compress

$ready = $false
$status = 'unavailable'
$lastErrorDetail = ''
$maxAttempts = if ($env:APP_PLATFORM_GATEWAY_SELECTION -eq '1') { 2 } else { 20 }
$timeoutSec = if ($env:APP_PLATFORM_GATEWAY_SELECTION -eq '1') { 15 } else { 30 }
Write-Host "Validating model $gatewayModel on gateway $gatewayName..."
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $hasReadableMessage = $false
    $content = ''
    try {
        $response = Invoke-WebRequest -Uri "$gatewayUrlTrimmed/default/models/openai/v1/responses" `
            -Method Post `
            -Headers @{ 'Api-Key' = $gatewayApiKey; 'Content-Type' = 'application/json' } `
            -Body $requestBody `
            -UseBasicParsing `
            -TimeoutSec $timeoutSec
        $status = [string][int]$response.StatusCode
        $content = [string]$response.Content
    } catch {
        if ($_.Exception.Response -and $null -ne $_.Exception.Response.StatusCode) {
            $status = [string][int]$_.Exception.Response.StatusCode
            try {
                if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                    $content = [string]$_.ErrorDetails.Message
                } else {
                    $respStream = $_.Exception.Response.GetResponseStream()
                    if ($respStream) {
                        $reader = [System.IO.StreamReader]::new($respStream)
                        $content = $reader.ReadToEnd()
                        $reader.Close()
                    }
                }
            } catch { }
        } else {
            $status = 'unavailable'
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($content)) {
        try {
            $payload = $content | ConvertFrom-Json
            $hasReadableMessage = (-not [string]::IsNullOrWhiteSpace([string]$payload.output_text)) -or ($null -ne (
                $payload.output |
                    Where-Object { $_.type -eq 'message' } |
                    ForEach-Object { $_.content } |
                    Where-Object { ($_.type -eq 'output_text' -or $_.type -eq 'text') -and -not [string]::IsNullOrWhiteSpace($_.text) } |
                    Select-Object -First 1
            )) -or ($null -ne (
                $payload.output |
                    Where-Object { $_.type -eq 'reasoning' } |
                    Select-Object -First 1
            ))
            if (-not $hasReadableMessage -and $payload.error) {
                $errMsg = if ($payload.error.message) { [string]$payload.error.message } elseif ($payload.error.details) { [string]$payload.error.details } elseif ($payload.error.code) { [string]$payload.error.code } else { '' }
                if (-not [string]::IsNullOrWhiteSpace($errMsg)) {
                    $lastErrorDetail = $errMsg.Trim()
                }
            }
        } catch { }
    }
    if ($status -match '^2\d\d$' -and $hasReadableMessage) {
        $ready = $true
        break
    }
    $detailSuffix = if ($lastErrorDetail) { " ($lastErrorDetail)" } else { '' }
    Write-Host "Waiting for AI Gateway model route, attempt=$attempt, status=$status$detailSuffix"
    if ($attempt -lt $maxAttempts) { Start-Sleep -Seconds 3 }
}
if (-not $ready) {
    $detailColon = if ($lastErrorDetail) { ": $lastErrorDetail" } else { '' }
    if ($status -eq 502 -or $status -eq 503 -or $status -eq '502' -or $status -eq '503') {
        Write-Error "AI Gateway '$gatewayName' returned HTTP $status for model '$gatewayModel'$detailColon. The backend model deployment or provider is unreachable or misconfigured; choose another gateway/model or repair the model provider."
    } else {
        Write-Error "AI Gateway Responses route did not return a readable message for model '$gatewayModel' (HTTP $status)$detailColon."
    }
    exit 1
}

$lockAcquired = $false
$stateDirectory = Join-Path $RepoRoot '.azure-app-platform'
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
    if (-not [string]::IsNullOrEmpty($env:APP_PLATFORM_GATEWAY_CONFIGURATION_ID)) {
        $activeGateway = Get-Content -Raw $activeGatewayPath | ConvertFrom-Json
        $currentConfigurationId = $activeGateway.configurationId
        if ($currentConfigurationId -ne $env:APP_PLATFORM_GATEWAY_CONFIGURATION_ID) {
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

    $acaSandboxGroup = $env:ACA_SANDBOX_GROUP
    $acaResourceGroup = $env:ACA_RESOURCE_GROUP
    $acaRegion = $env:ACA_REGION
    $acaSubscription = $env:ACA_SUBSCRIPTION
    $acaConfigPath = Join-Path $HOME '.config\aca\config.json'
    if ($env:ACA_SANDBOX_DISABLE -ne '1' -and [string]::IsNullOrWhiteSpace($acaSandboxGroup) -and (Test-Path $acaConfigPath)) {
        try {
            $acaConfig = Get-Content -Raw $acaConfigPath | ConvertFrom-Json
            if ($acaConfig.sandbox_group) { $acaSandboxGroup = [string]$acaConfig.sandbox_group }
            elseif ($acaConfig.sandbox -and $acaConfig.sandbox.group) { $acaSandboxGroup = [string]$acaConfig.sandbox.group }
            if ($acaConfig.resource_group) { $acaResourceGroup = [string]$acaConfig.resource_group }
            elseif ($acaConfig.sandbox -and $acaConfig.sandbox.resource_group) { $acaResourceGroup = [string]$acaConfig.sandbox.resource_group }
            if ($acaConfig.region) { $acaRegion = [string]$acaConfig.region }
            elseif ($acaConfig.sandbox -and $acaConfig.sandbox.region) { $acaRegion = [string]$acaConfig.sandbox.region }
            if ($acaConfig.subscription) { $acaSubscription = [string]$acaConfig.subscription }
            elseif ($acaConfig.sandbox -and $acaConfig.sandbox.subscription) { $acaSubscription = [string]$acaConfig.sandbox.subscription }
        } catch { }
    }

    if (-not [string]::IsNullOrWhiteSpace($acaSandboxGroup)) {
        $resolvedAcaRg = if (-not [string]::IsNullOrWhiteSpace($acaResourceGroup)) { $acaResourceGroup } else { $resourceGroup }
        $resolvedAcaRegion = if (-not [string]::IsNullOrWhiteSpace($acaRegion)) { $acaRegion } else { 'eastus2' }
        $resolvedAcaSub = if (-not [string]::IsNullOrWhiteSpace($acaSubscription)) { $acaSubscription } else { $subscriptionId }
        $extraAcaPaths = @(
            (Join-Path $HOME '.local\bin'),
            (Join-Path $HOME '.aca\bin')
        ) | Where-Object { Test-Path $_ }
        if ($extraAcaPaths.Count -gt 0) {
            $env:PATH = ($extraAcaPaths -join [System.IO.Path]::PathSeparator) + [System.IO.Path]::PathSeparator + $env:PATH
        }
        if (-not (Get-Command aca -ErrorAction SilentlyContinue)) {
            Write-Error "ACA CLI ('aca') is not installed. Install ACA CLI in Prerequisites or choose Local simulation mode."
            exit 1
        }
        Write-Host "Validating ACA Sandbox Group '$acaSandboxGroup' (create and delete permissions)..."
        $createOut = (& aca -s $resolvedAcaSub -g $resolvedAcaRg --region $resolvedAcaRegion sandbox create --group $acaSandboxGroup --egress-default Deny --label purpose=canvas-validation 2>&1 | Out-String)
        if ($LASTEXITCODE -ne 0) {
            if ($createOut -match '403|Forbidden|Access denied') {
                Write-Error "Access denied (HTTP 403) creating a sandbox in '$acaSandboxGroup' (resource group '$resolvedAcaRg', subscription '$resolvedAcaSub'). Assign 'Container Apps SandboxGroup Data Owner' on this sandbox group: aca -s $resolvedAcaSub -g $resolvedAcaRg sandboxgroup role create --group $acaSandboxGroup --role `"Container Apps SandboxGroup Data Owner`" --principal-id <your-entra-object-id>"
            } else {
                Write-Error "Failed to create a validation sandbox in '$acaSandboxGroup': $createOut"
            }
            exit 1
        }
        $uuidMatch = [regex]::Match($createOut, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
        if (-not $uuidMatch.Success) {
            Write-Error "ACA Sandbox Group '$acaSandboxGroup' did not return a valid sandbox ID during validation: $createOut"
            exit 1
        }
        $validationSbId = $uuidMatch.Value
        $deleteOut = (& aca -s $resolvedAcaSub -g $resolvedAcaRg --region $resolvedAcaRegion sandbox delete --group $acaSandboxGroup --id $validationSbId --yes 2>&1 | Out-String)
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Created validation sandbox '$validationSbId' in '$acaSandboxGroup', but deleting it failed: $deleteOut"
            exit 1
        }
        Write-Host "ACA Sandbox Group '$acaSandboxGroup' verified (create and delete succeeded)."
    }

    $gatewayHost = ([Uri]$gatewayUrlTrimmed).Host
    $agentEnvPath = Join-Path $RepoRoot 'src\agent\.env'
    $rootEnvPath = Join-Path $RepoRoot '.env'
    $agentEnvContent = @"
AI_GATEWAY_NAME="$gatewayName"
AI_GATEWAY_RESOURCE_GROUP="$resourceGroup"
AZURE_SUBSCRIPTION_ID="$subscriptionId"
AZURE_AI_GATEWAY_ENDPOINT="$gatewayUrlTrimmed/"
AZURE_AI_GATEWAY_HOST="$gatewayHost"
AZURE_AI_GATEWAY_API_KEY="$gatewayApiKey"
AZURE_AI_GATEWAY_MODEL="$gatewayModel"
AZURE_AI_GATEWAY_MINI_MODEL="$gatewayMiniModel"
AI_GATEWAY_BASE_URL="$gatewayUrlTrimmed/default/models/openai/v1"
AI_GATEWAY_API_KEY="$gatewayApiKey"
AI_GATEWAY_MODEL="$gatewayModel"
OPENAI_MODEL="$gatewayModel"
MOCK="0"
"@
    if (-not [string]::IsNullOrWhiteSpace($acaSandboxGroup)) {
        $resolvedAcaRg = if (-not [string]::IsNullOrWhiteSpace($acaResourceGroup)) { $acaResourceGroup } else { $resourceGroup }
        $resolvedAcaRegion = if (-not [string]::IsNullOrWhiteSpace($acaRegion)) { $acaRegion } else { 'eastus2' }
        $resolvedAcaSub = if (-not [string]::IsNullOrWhiteSpace($acaSubscription)) { $acaSubscription } else { $subscriptionId }
        $agentEnvContent += @"

ACA_SANDBOX_GROUP="$acaSandboxGroup"
ACA_RESOURCE_GROUP="$resolvedAcaRg"
ACA_REGION="$resolvedAcaRegion"
ACA_SUBSCRIPTION="$resolvedAcaSub"
"@
    }
    if (Test-Path (Join-Path $RepoRoot 'src\agent')) {
        [System.IO.File]::WriteAllText(
            $agentEnvPath,
            $agentEnvContent,
            [System.Text.UTF8Encoding]::new($false)
        )
    }
    if ((Test-Path (Join-Path $RepoRoot 'builder.yaml')) -or (Test-Path (Join-Path $RepoRoot 'embr.yaml')) -or -not (Test-Path (Join-Path $RepoRoot 'src\agent'))) {
        [System.IO.File]::WriteAllText(
            $rootEnvPath,
            $agentEnvContent,
            [System.Text.UTF8Encoding]::new($false)
        )
    }

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
