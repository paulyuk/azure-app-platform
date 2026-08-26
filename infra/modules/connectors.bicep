targetScope = 'resourceGroup'

param name string

@description('Connector Namespace preview is pinned to West Central US.')
@allowed([
  'westcentralus'
])
param location string = 'westcentralus'

param tags object = {}

// Do not inherit the primary East US 2 location: this preview is region-pinned.
resource connectorNamespace 'Microsoft.Web/connectorGateways@2026-05-01-preview' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
}

// TODO: Add Teams and Microsoft 365 Outlook connections after delegated
// connector privacy and authorization boundaries are finalized.
output id string = connectorNamespace.id
output location string = connectorNamespace.location
