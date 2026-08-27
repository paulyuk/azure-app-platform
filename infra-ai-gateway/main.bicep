targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('azd environment name used for deterministic names and ownership tags.')
param environmentName string = 'unity-poc-aigateway'

@metadata({
  azd: {
    type: 'location'
    default: 'eastus2'
  }
})
@allowed([
  'eastus2'
])
@description('AI Gateway preview and Foundry model region.')
param location string

@description('Resource group containing this standalone local-agent gateway slice.')
param resourceGroupName string = 'rg-unity-poc-aigateway'

@description('Full model deployment name exposed by AI Gateway.')
param modelDeploymentName string = 'gpt-latest'

@description('Mini model deployment name exposed by AI Gateway.')
param miniModelDeploymentName string = 'gpt-mini-latest'

@description('Backing Foundry full model.')
param modelName string = 'gpt-5.6-sol'

@description('Backing Foundry full model version.')
param modelVersion string = '2026-07-09'

@description('Backing Foundry mini model.')
param miniModelName string = 'gpt-5.4-mini'

@description('Backing Foundry mini model version.')
param miniModelVersion string = '2026-03-17'

@description('Global Standard capacity for the full deployment.')
param modelCapacity int = 20

@description('Global Standard capacity for the mini deployment.')
param miniModelCapacity int = 200

var resourceToken = take(toLower(uniqueString(subscription().id, environmentName, location)), 8)
var gatewayName = 'aigw-unity-${resourceToken}'
var modelServicesName = 'aimodels${resourceToken}'
var tags = {
  'azd-env-name': environmentName
  'unity-scope': 'local-agent-ai-gateway'
}
var modelDeployments = [
  {
    deploymentName: miniModelDeploymentName
    modelName: miniModelName
    modelFormat: 'OpenAI'
    modelVersion: miniModelVersion
    skuName: 'GlobalStandard'
    capacity: miniModelCapacity
  }
  {
    deploymentName: modelDeploymentName
    modelName: modelName
    modelFormat: 'OpenAI'
    modelVersion: modelVersion
    skuName: 'GlobalStandard'
    capacity: modelCapacity
  }
]

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module foundryModels './foundry-models/main.bicep' = {
  name: 'foundry-models-${resourceToken}'
  scope: resourceGroup
  params: {
    location: location
    tags: tags
    aiServicesName: modelServicesName
    modelDeployments: modelDeployments
  }
}

module aiGateway './ai-gateway/main.bicep' = {
  name: 'ai-gateway-${resourceToken}'
  scope: resourceGroup
  params: {
    location: location
    gatewayName: gatewayName
    tags: tags
    foundryEndpoint: foundryModels.outputs.aiServicesEndpoint
    foundryResourceId: foundryModels.outputs.aiServicesId
    foundryModels: [for (deployment, i) in modelDeployments: {
      armName: deployment.deploymentName
      description: 'Unity local-agent deployment backed by ${deployment.modelName}.'
      resourceId: foundryModels.outputs.modelDeploymentIds[i]
      modelName: deployment.modelName
      modelVersion: deployment.modelVersion
      tokenLimit: deployment.capacity * 1000
    }]
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AI_GATEWAY_RESOURCE_GROUP string = resourceGroup.name
output FOUNDRY_MODELS_RESOURCE_ID string = foundryModels.outputs.aiServicesId
output FOUNDRY_MODELS_NAME string = foundryModels.outputs.aiServicesName
output AI_GATEWAY_NAME string = gatewayName
output AI_GATEWAY_LOCATION string = location
output AI_GATEWAY_RESOURCE_ID string = aiGateway.outputs.apimGatewayId
output AI_GATEWAY_FOUNDRY_ROLE_ASSIGNMENT_NAME string = aiGateway.outputs.foundryUserRoleAssignmentName
output AI_GATEWAY_FOUNDRY_ROLE_ASSIGNMENT_PRINCIPAL_ID string = aiGateway.outputs.gatewayPrincipalId
output AZURE_AI_GATEWAY_ENDPOINT string = 'https://${aiGateway.outputs.runtimeHostname}/'
output AZURE_AI_GATEWAY_MODEL string = modelDeploymentName
output AZURE_AI_GATEWAY_MINI_MODEL string = miniModelDeploymentName
