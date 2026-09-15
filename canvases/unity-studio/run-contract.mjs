import { readFile } from "node:fs/promises";

const HEALTH_TIMEOUT_MS = 2_000;
const SUPPORTED_ROUTES = new Set(["/invoke", "/responses"]);
const SUPPORTED_INPUT_FIELDS = new Set(["message", "input"]);

function validatePort(port) {
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
    throw new Error("Choose a valid local endpoint port.");
  }
  return numericPort;
}

function invocationContract(port, route, inputField, streaming) {
  const contract = {
    url: `http://127.0.0.1:${validatePort(port)}${route}`,
    route,
    inputField,
  };
  if (streaming !== undefined) contract.streaming = streaming;
  return contract;
}

async function readAgentSources(root, read) {
  if (typeof root !== "string" || !root.trim()) {
    throw new Error("Choose a valid app root.");
  }

  const sources = [];
  for (const path of [
    `${root}/src/agent/main.py`,
    `${root}/src/agent/main.py.template`,
  ]) {
    try {
      sources.push({ path, source: await read(path, "utf8") });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return sources;
}

function detectsRoute(source, route) {
  const quotedRoute = route.replace("/", "\\/");
  return new RegExp(`self\\.path\\s*!=\\s*["']${quotedRoute}["']`).test(source)
    || (/route\s*=\s*self\.path\.split\(/.test(source)
      && new RegExp(`if route\\s*==\\s*["']${quotedRoute}["']`).test(source)
      && /self\.service\.invoke\(payload\)/.test(source));
}

function readsMessageField(source) {
  return /(?:request|payload)\.get\(\s*["']message["']/.test(source);
}

export async function resolveAgentInvocation(root, port, read = readFile) {
  const numericPort = validatePort(port);
  const sources = await readAgentSources(root, read);

  for (const { source } of sources) {
    if (detectsRoute(source, "/invoke") && readsMessageField(source)) {
      return invocationContract(numericPort, "/invoke", "message");
    }
  }
  for (const { source } of sources) {
    if (detectsRoute(source, "/responses") && readsMessageField(source)) {
      return invocationContract(numericPort, "/responses", "message");
    }
  }
  for (const { source } of sources) {
    if (
      /\bResponsesHostServer\s*\(/.test(source)
      && /agent_framework_foundry_hosting/.test(source)
    ) {
      return invocationContract(numericPort, "/responses", "input", false);
    }
  }

  const inspected = sources.map(({ path }) => path).join(", ");
  throw new Error(
    "This app's local agent HTTP contract is not supported. "
    + "Unity Studio only invokes checked-in /invoke {message}, /responses {message}, "
    + "or Foundry ResponsesHostServer /responses {input, stream:false} contracts"
    + (inspected ? `; inspected ${inspected}.` : "; no src/agent/main.py was found."),
  );
}

function validateInvocation(contract) {
  if (!contract || !SUPPORTED_ROUTES.has(contract.route)) {
    throw new Error("Choose a supported local agent invocation contract.");
  }
  if (!SUPPORTED_INPUT_FIELDS.has(contract.inputField)) {
    throw new Error("Choose a supported local agent input field.");
  }
  if (contract.streaming !== undefined && contract.streaming !== false) {
    throw new Error("Unity Studio only supports buffered local agent invocations.");
  }

  let url;
  try {
    url = new URL(contract.url);
  } catch {
    throw new Error("Choose a valid local agent invocation URL.");
  }
  const port = Number(url.port || (url.protocol === "http:" ? 80 : 0));
  if (
    url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== contract.route
  ) {
    throw new Error("Agent invocation URLs must use a fixed loopback HTTP endpoint.");
  }
  validatePort(port);
  return contract;
}

export function invocationBody(contract, message, document) {
  validateInvocation(contract);
  if (typeof message !== "string") {
    throw new Error("Agent invocation messages must be strings.");
  }
  const body = { [contract.inputField]: message };
  if (document !== undefined) {
    if (contract.route !== "/invoke" || !document || typeof document !== "object"
      || Object.keys(document).some((key) => !["name", "content"].includes(key))
      || typeof document.name !== "string" || document.name.length > 255
      || typeof document.content !== "string" || Buffer.byteLength(document.content) > 65536) {
      throw new Error("Document invocation requires /invoke and a name/content text document up to 64 KiB.");
    }
    body.document = { name: document.name, content: document.content };
  }
  if (contract.streaming === false) body.stream = false;
  return body;
}

function endpointKind(candidate, port) {
  const name = String(candidate?.name || "").trim().toLowerCase();
  const declaredKind = String(candidate?.kind || candidate?.type || "").trim().toLowerCase();
  if (name === "web" || declaredKind === "web") return "web";
  if (name === "agent" || declaredKind === "agent") return "agent";
  if (
    declaredKind === "skill"
    || declaredKind === "function"
    || name === "skill"
    || (port >= 7071 && port <= 7079)
  ) {
    return "function";
  }
  return "other";
}

function statusResult(healthy, healthStatus, healthDetail) {
  return {
    healthy,
    healthStatus,
    ...(healthDetail ? { healthDetail } : {}),
  };
}

function responseOk(response) {
  return response?.ok === true
    || (Number(response?.status) >= 200 && Number(response?.status) < 300);
}

async function functionHealth(response) {
  if (responseOk(response)) {
    let state = "";
    try {
      const body = await response.json();
      state = typeof body?.state === "string" ? body.state.trim() : "";
    } catch {
      // A successful Functions host response is sufficient when it has no JSON state.
    }
    if (!state || /^running$/i.test(state)) {
      return statusResult(true, "Healthy", state ? `Functions host state: ${state}.` : undefined);
    }
    if (/^(error|failed|offline|stopped)$/i.test(state)) {
      return statusResult(false, "Unhealthy", `Functions host state: ${state}.`);
    }
    return statusResult(null, "Listening (health unknown)", `Functions host state: ${state}.`);
  }
  if ([401, 403].includes(Number(response?.status))) {
    return statusResult(
      null,
      "Listening (health authorization required)",
      "The Functions host health endpoint requires an admin key; TCP listening alone is not reported as healthy.",
    );
  }
  if (Number(response?.status) >= 500) {
    return statusResult(false, "Unhealthy", `Functions health probe returned HTTP ${response.status}.`);
  }
  return statusResult(
    null,
    "Listening (health unknown)",
    `Functions health probe returned HTTP ${response?.status ?? "unknown"}.`,
  );
}

export async function probeHttpHealth(candidate, fetchImpl = fetch) {
  const port = validatePort(candidate?.port);
  if (candidate?.ready === false || candidate?.listening === false) {
    return statusResult(false, "Offline");
  }

  const kind = endpointKind(candidate, port);
  if (kind === "other") {
    return statusResult(
      null,
      "Listening (health unknown)",
      "No HTTP health contract is defined for this endpoint.",
    );
  }

  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("Health probe timed out."));
    }, HEALTH_TIMEOUT_MS);
  });
  const request = async (path) => fetchImpl(`http://127.0.0.1:${port}${path}`, {
    method: "GET",
    redirect: "manual",
    signal: controller.signal,
  });

  try {
    return await Promise.race([
      (async () => {
        if (kind === "web") {
          const response = await request("/");
          return responseOk(response)
            ? statusResult(true, "Healthy")
            : statusResult(
              false,
              "Unhealthy",
              `Web health probe returned HTTP ${response?.status ?? "unknown"}.`,
            );
        }

        if (kind === "function") {
          return functionHealth(await request("/admin/host/status"));
        }

        const health = await request("/health");
        if (responseOk(health)) return statusResult(true, "Healthy", "Agent GET /health succeeded.");
        if (Number(health?.status) >= 500) {
          return statusResult(false, "Unhealthy", `Agent health probe returned HTTP ${health.status}.`);
        }
        if (![401, 403, 404].includes(Number(health?.status))) {
          return statusResult(
            null,
            "Listening (health unknown)",
            `Agent GET /health returned HTTP ${health?.status ?? "unknown"}.`,
          );
        }
        if ([401, 403].includes(Number(health?.status))) {
          return statusResult(
            null,
            "Listening (health authorization required)",
            "Agent GET /health requires authorization.",
          );
        }

        // ResponsesHostServer exposes GET /readiness rather than GET /health.
        const readiness = await request("/readiness");
        if (responseOk(readiness)) {
          return statusResult(true, "Healthy", "Agent GET /readiness succeeded.");
        }
        if ([401, 403].includes(Number(readiness?.status))) {
          return statusResult(
            null,
            "Listening (health authorization required)",
            "Agent GET /readiness requires authorization.",
          );
        }
        if (Number(readiness?.status) >= 500) {
          return statusResult(false, "Unhealthy", `Agent readiness probe returned HTTP ${readiness.status}.`);
        }
        return statusResult(
          null,
          "Listening (health unknown)",
          `Agent health endpoints returned HTTP ${health?.status ?? "unknown"} and ${readiness?.status ?? "unknown"}.`,
        );
      })(),
      timeout,
    ]);
  } catch (error) {
    return statusResult(
      null,
      "Listening (health unavailable)",
      error?.name === "AbortError" ? "HTTP health probe timed out." : String(error?.message || error),
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function posixQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function powerShellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function commandText(command) {
  if (typeof command === "string") return command.trim();
  if (!command || typeof command.command !== "string" || !command.command.trim()) return "";
  const shell = command.shell === "powershell"
    || /(?:^|[\\/])(pwsh|powershell)(?:\.exe)?$/i.test(command.command)
    ? "powershell"
    : "posix";
  const quote = shell === "powershell" ? powerShellQuote : posixQuote;
  return [quote(command.command), ...(command.args ?? []).map(quote)].join(" ");
}

function commandWithRoot(root, command) {
  const text = commandText(command);
  if (!text) return "";
  const cwd = typeof command === "object" && command?.cwd ? command.cwd : root;
  const powershell = typeof command === "object" && (
    command?.shell === "powershell"
    || /(?:^|[\\/])(pwsh|powershell)(?:\.exe)?$/i.test(command?.command)
  );
  return powershell
    ? `Set-Location ${powerShellQuote(cwd)}; & ${text}`
    : `cd ${posixQuote(cwd)} && ${text}`;
}

export function buildRunCommandReference({ root, start, stop, invocation } = {}) {
  if (typeof root !== "string" || !root.trim()) {
    throw new Error("Choose a valid app root.");
  }

  const commands = [];
  const startCommand = commandWithRoot(root, start);
  const stopCommand = commandWithRoot(root, stop);
  if (startCommand) commands.push({ id: "start", label: "Start app", command: startCommand });
  if (stopCommand) commands.push({ id: "stop", label: "Stop app", command: stopCommand });

  let request = null;
  if (invocation) {
    validateInvocation(invocation);
    const body = invocationBody(invocation, "Hello from Unity Studio");
    const json = JSON.stringify(body);
    commands.push({
      id: "invoke-posix",
      label: "Invoke agent (macOS/Linux)",
      command: [
        `curl --fail-with-body --silent --show-error -X POST ${posixQuote(invocation.url)}`,
        `  -H ${posixQuote("Content-Type: application/json")}`,
        `  --data ${posixQuote(json)}`,
      ].join(" \\\n"),
    });
    commands.push({
      id: "invoke-powershell",
      label: "Invoke agent (PowerShell)",
      command: [
        `$body = ${powerShellQuote(json)}`,
        `Invoke-RestMethod -Method Post -Uri ${powerShellQuote(invocation.url)} `
          + `-ContentType ${powerShellQuote("application/json")} -Body $body`,
      ].join("\n"),
    });
    request = {
      method: "POST",
      url: invocation.url,
      headers: { "Content-Type": "application/json" },
      body,
      json,
    };
  }

  return {
    commands,
    request,
    guidance: invocation
      ? "These commands use the app's checked-in runtime and agent HTTP contracts. Replace the example message as needed."
      : "Start and stop commands come from the app's checked-in runtime profile. No supported agent HTTP contract was found.",
  };
}
