targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: take(replace(name, 'ca-', 'cae-'), 60)
  location: location
  tags: tags
  properties: {}
}

// TODO: Replace this ACA-compatible placeholder with the Embr/ACA Express
// contract once that pre-public-preview hosting contract stabilizes.
resource web 'Microsoft.App/containerApps@2025-01-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

output name string = web.name
output url string = 'https://${web.properties.configuration.ingress.fqdn}'
