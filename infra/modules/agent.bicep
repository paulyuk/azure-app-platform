targetScope = 'resourceGroup'

@minLength(3)
param name string
param location string = resourceGroup().location
param tags object = {}

var accountName = take('ai${replace(toLower(name), '-', '')}', 64)
var projectName = 'unity'

// TODO: Copy the complete Foundry account/project, ACR, monitoring, connections,
// and RBAC shape from Azure-Samples/simple-foundry-hosted-agent-python-aigateway.
// The hosted workload is deployed by the azure.ai.agent service in azure.yaml.
resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: accountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-04-01-preview' = {
  parent: foundryAccount
  name: projectName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    description: 'Unity POC hosted-agent project'
    displayName: 'Unity POC'
  }
}

output accountId string = foundryAccount.id
output projectId string = foundryProject.id
output projectEndpoint string = 'https://${foundryAccount.name}.services.ai.azure.com/api/projects/${foundryProject.name}'
