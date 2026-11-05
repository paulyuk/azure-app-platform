# Durable workflow starter

The HTTP start route validates bounded JSON and returns 501 until you implement
the activity and enable scheduling. It does not silently start unfinished work.
Keep orchestration deterministic and external I/O inside idempotent activities.

Install Python 3.11+, uv, Azure Functions Core Tools v4, and Azurite. Follow the
app README's corporate package-index policy. From this block directory, set
local development storage.

### macOS/Linux

```bash
export FUNCTIONS_WORKER_RUNTIME=python
export AzureWebJobsStorage=UseDevelopmentStorage=true
```

### PowerShell 7

```powershell
$env:FUNCTIONS_WORKER_RUNTIME = "python"
$env:AzureWebJobsStorage = "UseDevelopmentStorage=true"
```

### Terminal 1: ephemeral local storage

```shell
azurite --silent --inMemoryPersistence --skipApiVersionCheck --disableTelemetry
```

### Terminal 2: function host

In the terminal with those environment variables, choose an unused port.

```shell
uv run func start --port 7071
```

When the operation is implemented, use
`await client.start_new("workflow", client_input=payload)` and return
`client.create_check_status_response(request, instance_id)` from the start route.
Use bounded retries and protect status/history endpoints. Configure production
storage and authentication separately; local Core Tools does not enforce keys
by default. No workflow or Azure resource is created by saving this starter.
