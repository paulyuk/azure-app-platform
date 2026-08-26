targetScope = 'subscription'

@description('Short azd environment name used to name and tag resources.')
@minLength(1)
@maxLength(24)
param environmentName string

@description('Primary region. Unity POC resources are pinned to East US 2.')
@allowed([
  'eastus2'
])
param location string = 'eastus2'

var normalizedEnvironmentName = replace(replace(toLower(environmentName), '_', '-'), ' ', '-')
var resourceToken = '${take(normalizedEnvironmentName, 16)}-${take(uniqueString(subscription().id, environmentName), 6)}'
var tags = {
  'azd-env-name': environmentName
  'unity-scope': 'poc'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-unity-${resourceToken}'
  location: location
  tags: tags
}

module gateway './modules/gateway.bicep' = {
  name: 'gateway'
  scope: resourceGroup
  params: {
    name: 'aigw-${resourceToken}'
    location: location
    tags: tags
  }
}

module agent './modules/agent.bicep' = {
  name: 'agent'
  scope: resourceGroup
  params: {
    name: 'aif-${resourceToken}'
    location: location
    tags: union(tags, {
      'azd-service-name': 'agent'
    })
  }
}

module skills './modules/skills.bicep' = {
  name: 'skills'
  scope: resourceGroup
  params: {
    name: 'func-skills-${resourceToken}'
    location: location
    tags: union(tags, {
      'azd-service-name': 'skills'
    })
  }
}

module sandbox './modules/sandbox.bicep' = {
  name: 'sandbox'
  scope: resourceGroup
  params: {
    name: 'sbg-${resourceToken}'
    location: location
    tags: union(tags, {
      'azd-service-name': 'sandbox'
    })
  }
}

module workflows './modules/workflows.bicep' = {
  name: 'workflows'
  scope: resourceGroup
  params: {
    name: 'func-workflows-${resourceToken}'
    location: location
    tags: union(tags, {
      'azd-service-name': 'workflows'
    })
  }
}

module web './modules/web.bicep' = {
  name: 'web'
  scope: resourceGroup
  params: {
    name: 'ca-web-${resourceToken}'
    location: location
    tags: union(tags, {
      'azd-service-name': 'web'
    })
  }
}

module connectors './modules/connectors.bicep' = {
  name: 'connectors'
  scope: resourceGroup
  params: {
    name: 'conn-${resourceToken}'
    tags: tags
  }
}

module sreAgent './modules/sre-agent.bicep' = {
  name: 'sre-agent'
  scope: resourceGroup
  params: {
    name: 'sre-${resourceToken}'
    location: location
    tags: tags
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_LOCATION string = location
output AZURE_AI_GATEWAY_ENDPOINT string = gateway.outputs.endpoint
output AZURE_AI_PROJECT_ENDPOINT string = agent.outputs.projectEndpoint
output WEB_URL string = web.outputs.url
output CONNECTOR_NAMESPACE_ID string = connectors.outputs.id
output SRE_AGENT_ID string = sreAgent.outputs.id
