# Trigger starter

This saved Azure Functions starter is not running or connected to an event source.
Implement the handler before enabling it. HTTP invocation returns 501; scheduled
and event handlers fail explicitly until implemented, so they cannot acknowledge
unprocessed work as successful.

Install Python 3.11+, uv, Azure Functions Core Tools v4, and Azurite. Use the
app's documented corporate Python index. Run these commands from this block's
directory, not the app root.

Copy the development settings:

### macOS/Linux

```bash
cp local.settings.json.example local.settings.json
```

### PowerShell 7

```powershell
Copy-Item local.settings.json.example local.settings.json
```

### Terminal 1: ephemeral local storage

```shell
azurite --silent --inMemoryPersistence --skipApiVersionCheck --disableTelemetry
```

### Terminal 2: function host

Choose an unused port if 7071 is occupied.

```shell
uv run func start --port 7071
```

Local Core Tools does not enforce function keys by default. Keep the host local.
Configure production authentication, storage, event subscriptions, and retry
handling separately. The timer uses a five-minute UTC schedule with no
run-on-startup. Queue events target `work-items` in the configured Storage
account. Event Grid requires a subscription to a real event source.

Do not commit local.settings.json or connection secrets.
