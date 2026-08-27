targetScope = 'resourceGroup'

param location string = resourceGroup().location
param tags object = {}
param aiServicesName string
param modelDeployments array

resource aiServices 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: aiServicesName
  location: location
  tags: tags
  sku: {
    name: 'S0'
  }
  kind: 'AIServices'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    allowProjectManagement: false
    customSubDomainName: toLower(aiServicesName)
    disableLocalAuth: true
    networkAcls: {
      defaultAction: 'Allow'
      virtualNetworkRules: []
      ipRules: []
    }
    publicNetworkAccess: 'Enabled'
  }
}

@batchSize(1)
resource modelDeploymentResources 'Microsoft.CognitiveServices/accounts/deployments@2025-04-01-preview' = [for deployment in modelDeployments: {
  parent: aiServices
  name: deployment.deploymentName
  sku: {
    capacity: deployment.capacity
    name: deployment.skuName
  }
  properties: {
    model: {
      name: deployment.modelName
      format: deployment.modelFormat
      version: deployment.modelVersion
    }
  }
}]

output aiServicesName string = aiServices.name
output aiServicesId string = aiServices.id
output aiServicesEndpoint string = aiServices.properties.endpoint
output modelDeploymentIds array = [for (deployment, i) in modelDeployments: modelDeploymentResources[i].id]
