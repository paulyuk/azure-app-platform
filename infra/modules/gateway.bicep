targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}

@description('Publisher contact required by API Management.')
param publisherEmail string = 'noreply@example.com'

// TODO: Replace this placeholder with the proven Bicep from
// Azure-Samples/simple-foundry-hosted-agent-python-aigateway.
// APIM deletion is soft-delete + purge + identity cleanup. A name becoming
// available does not mean cleanup has completed; copy the sample lifecycle
// scripts/hooks before this module is used for repeated create/delete cycles.
resource aiGateway 'Microsoft.ApiManagement/service@2025-09-01-preview' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'AIGateway'
    capacity: 1
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: 'Unity AI Gateway'
  }
}

output id string = aiGateway.id
output endpoint string = aiGateway.properties.gatewayUrl
