targetScope = 'resourceGroup'

param location string
param gatewayName string
param tags object = {}
param publisherEmail string = 'noreply@example.com'
param publisherName string = 'Unity AI Gateway'
param foundryEndpoint string
param foundryResourceId string
param foundryModels array

var workspaceName = 'default'
var normalizedFoundryEndpoint = endsWith(foundryEndpoint, '/') ? foundryEndpoint : '${foundryEndpoint}/'

resource aiGateway 'Microsoft.ApiManagement/service@2025-09-01-preview' = {
  name: gatewayName
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
    publisherName: publisherName
  }
}

resource connectorNamespace 'Microsoft.Web/connectorGateways@2026-05-01-preview' = {
  name: gatewayName
  location: location
  properties: {}
  dependsOn: [
    aiGateway
  ]
}

resource defaultWorkspace 'Microsoft.ApiManagement/service/workspaces@2025-09-01-preview' existing = {
  parent: aiGateway
  name: workspaceName
}

module foundryUserRoleAssignment './foundry-user-role.bicep' = {
  name: 'foundry-rbac-${uniqueString(foundryResourceId, gatewayName)}'
  scope: resourceGroup(split(foundryResourceId, '/')[2], split(foundryResourceId, '/')[4])
  params: {
    foundryAccountName: last(split(foundryResourceId, '/'))
    gatewayPrincipalId: aiGateway.identity.principalId
    gatewayResourceId: aiGateway.id
  }
}

resource foundryProvider 'Microsoft.ApiManagement/service/workspaces/modelProviders@2025-09-01-preview' = {
  parent: defaultWorkspace
  name: 'foundry'
  dependsOn: [
    foundryUserRoleAssignment
  ]
  properties: {
    kind: 'Foundry'
    displayName: 'Foundry'
    description: 'Managed-identity Foundry provider for Unity local agent testing.'
    foundry: {
      endpoint: normalizedFoundryEndpoint
      resourceIds: [
        foundryResourceId
      ]
      authentication: {
        kind: 'ManagedIdentity'
        managedIdentity: {
          resource: 'https://cognitiveservices.azure.com/'
        }
      }
    }
  }
}

resource foundryCatalogModels 'Microsoft.ApiManagement/service/workspaces/modelProviders/models@2025-09-01-preview' = [for model in foundryModels: {
  parent: foundryProvider
  name: model.armName
  properties: {
    description: model.description
    displayName: model.modelName
    apiFormat: 'OpenAIChatCompletions'
    supportedEndpoints: [
      '/openai/v1/chat/completions'
      '/openai/v1/responses'
    ]
    deployment: {
      resourceId: model.resourceId
      modelName: last(split(model.resourceId, '/'))
      modelVersion: model.modelVersion
    }
    policies: [
      {
        type: 'tokenLimit'
        period: 'minute'
        count: model.tokenLimit
        counterKey: 'Identity'
      }
    ]
  }
}]

resource runtimeApiKey 'Microsoft.ApiManagement/service/apiKeys@2025-09-01-preview' = {
  parent: aiGateway
  name: 'default'
  properties: {
    displayName: 'Unity local agent key'
  }
}

output apimGatewayId string = aiGateway.id
output connectorNamespaceId string = connectorNamespace.id
output runtimeHostname string = replace(aiGateway.properties.gatewayUrl, 'https://', '')
output gatewayPrincipalId string = aiGateway.identity.principalId
output foundryUserRoleAssignmentName string = foundryUserRoleAssignment.outputs.roleAssignmentName
