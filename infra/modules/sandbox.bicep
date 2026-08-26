targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}

// Sandbox instances and their deny-by-default egress policy are data-plane
// resources created at runtime. Keep credentials out of Bicep state.
resource sandboxGroup 'Microsoft.App/sandboxGroups@2026-02-01-preview' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
}

output id string = sandboxGroup.id
output principalId string = sandboxGroup.identity.principalId
