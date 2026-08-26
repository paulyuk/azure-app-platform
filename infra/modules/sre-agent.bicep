targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}

// The preview type is not yet present in all Bicep type bundles.
#disable-next-line BCP081
resource sreAgent 'Microsoft.App/agents@2025-05-01-preview' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    actionConfiguration: {
      mode: 'review'
      accessLevel: 'Low'
    }
    mcpServers: []
  }
}

// TODO: Add App Insights, managed resources, the Reader + SRE Agent
// Administrator RBAC pair, response plans, memory, hooks, and schedules.
output id string = sreAgent.id
