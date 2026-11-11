import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunCommandReference,
  invocationBody,
  probeHttpHealth,
  endpointKind,
  normalizeRuntimeEntrypoint,
  resolveAgentInvocation,
} from "./run-contract.mjs";
import { applyPortSettings } from "./local-ports.mjs";

function sourceReader(source, suffix = "/src/agent/main.py") {
  return async (path) => {
    if (path.endsWith(suffix)) return source;
    const error = new Error("not found");
    error.code = "ENOENT";
    throw error;
  };
}

test("resolves the sandbox template's explicit /invoke contract", async () => {
  const contract = await resolveAgentInvocation("/app", 8088, sourceReader(`
class Handler:
    def do_POST(self):
        if self.path != "/invoke":
            self.send_error(404)
        request = json.loads(body)
        message = request.get("message", "")
`));
  assert.deepEqual(contract, {
    url: "http://127.0.0.1:8088/invoke",
    route: "/invoke",
    inputField: "message",
  });
  assert.deepEqual(invocationBody(contract, "inspect this"), { message: "inspect this" });
});

test("resolves the empty template's explicit /responses message contract", async () => {
  const contract = await resolveAgentInvocation("/app", 8088, sourceReader(`
class Handler:
    def do_POST(self):
        if self.path != '/responses':
            self.send_error(404)
        request = json.loads(body)
        value = request.get('message', '')
`));
  assert.deepEqual(contract, {
    url: "http://127.0.0.1:8088/responses",
    route: "/responses",
    inputField: "message",
  });
});

test("resolves the Dealer ResponsesHostServer contract without a speculative request", async () => {
  const contract = await resolveAgentInvocation("/dealer", 8088, sourceReader(`
from agent_framework_foundry_hosting import ResponsesHostServer
ResponsesHostServer(build_agent()).run()
`));
  assert.deepEqual(contract, {
    url: "http://127.0.0.1:8088/responses",
    route: "/responses",
    inputField: "input",
    streaming: false,
  });
  assert.deepEqual(invocationBody(contract, "find an EV"), {
    input: "find an EV",
    stream: false,
  });
});

test("reads checked-in template source and rejects unsupported agent contracts helpfully", async () => {
  const templateContract = await resolveAgentInvocation(
    "/template",
    8088,
    sourceReader(`
if self.path != "/invoke": pass
message = request.get("message", "")
`, "/src/agent/main.py.template"),
  );
  assert.equal(templateContract.route, "/invoke");

  await assert.rejects(
    resolveAgentInvocation("/unknown", 8088, sourceReader("app.run()")),
    /local agent HTTP contract is not supported.*only invokes checked-in/s,
  );
  await assert.rejects(
    resolveAgentInvocation("/missing", 8088, async () => {
      const error = new Error("not found");
      error.code = "ENOENT";
      throw error;
    }),
    /no src\/agent\/main\.py was found/,
  );
});

test("invocation contracts reject unsafe URLs, ports, and unsupported streaming", async () => {
  await assert.rejects(
    resolveAgentInvocation("/app", 0, sourceReader("")),
    /valid local endpoint port/,
  );
  assert.throws(
    () => invocationBody({
      url: "https://example.com/responses",
      route: "/responses",
      inputField: "input",
      streaming: false,
    }, "hello"),
    /fixed loopback/,
  );
  assert.throws(
    () => invocationBody({
      url: "http://127.0.0.1:8088/responses",
      route: "/responses",
      inputField: "input",
      streaming: true,
    }, "hello"),
    /buffered/,
  );
});

test("web health probes only the fixed loopback root", async () => {
  const calls = [];
  const result = await probeHttpHealth({ name: "web", port: 3000, ready: true }, async (...args) => {
    calls.push(args);
    return { ok: true, status: 200 };
  });
  assert.deepEqual(result, { healthy: true, healthStatus: "Healthy" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "http://127.0.0.1:3000/");
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls[0][1].redirect, "manual");
  assert.ok(calls[0][1].signal instanceof AbortSignal);

  const fallbackCalls = [];
  const fallbackResult = await probeHttpHealth({ name: "web", port: 8080, ready: true }, async (url) => {
    fallbackCalls.push(url);
    return url.endsWith("/health") ? { ok: true, status: 200 } : { ok: false, status: 404 };
  });
  assert.deepEqual(fallbackCalls, [
    "http://127.0.0.1:8080/",
    "http://127.0.0.1:8080/health",
  ]);
  assert.deepEqual(fallbackResult, {
    healthy: true,
    healthStatus: "Healthy",
    healthDetail: "Web GET /health succeeded.",
  });
});

test("agent health falls back to the real ResponsesHostServer readiness route", async () => {
  const urls = [];
  const result = await probeHttpHealth({ name: "agent", port: 8088, ready: true }, async (url) => {
    urls.push(url);
    return url.endsWith("/health")
      ? { ok: false, status: 404 }
      : { ok: true, status: 200 };
  });
  assert.deepEqual(urls, [
    "http://127.0.0.1:8088/health",
    "http://127.0.0.1:8088/readiness",
  ]);
  assert.deepEqual(result, {
    healthy: true,
    healthStatus: "Healthy",
    healthDetail: "Agent GET /readiness succeeded.",
  });
});

test("Functions health authorization is listening but not healthy", async () => {
  const result = await probeHttpHealth(
    { name: "inventory-search", port: 7071, ready: true },
    async (url) => {
      assert.equal(url, "http://127.0.0.1:7071/admin/host/status");
      return { ok: false, status: 401 };
    },
  );
  assert.equal(result.healthy, null);
  assert.equal(result.healthStatus, "Listening (health authorization required)");
  assert.match(result.healthDetail, /not reported as healthy/);
});

test("Functions Running status is healthy and unknown endpoints remain listening-only", async () => {
  const functionResult = await probeHttpHealth(
    { name: "skill", port: 7071, ready: true },
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ state: "Running" }),
    }),
  );
  assert.deepEqual(functionResult, {
    healthy: true,
    healthStatus: "Healthy",
    healthDetail: "Functions host state: Running.",
  });

  let fetched = false;
  const unknown = await probeHttpHealth(
    { name: "azurite", port: 10000, ready: true },
    async () => {
      fetched = true;
      throw new Error("should not fetch");
    },
  );
  assert.equal(fetched, false);
  assert.deepEqual(unknown, {
    healthy: null,
    healthStatus: "Listening (health unknown)",
    healthDetail: "No HTTP health contract is defined for this endpoint.",
  });
});

test("reassigned and legacy Hosted Skills retain Functions health and endpoint routing", async () => {
  const profile = applyPortSettings({
    entrypoints: [{ name: "inventory-search", port: 7071, kind: "function" }],
  }, { INVENTORY_SEARCH_PORT: 17080 });
  const candidates = [
    ...profile.entrypoints,
    ...["inventory-search", "trade-in-value", "rate-sheet", "deal-doc"]
      .map((name) => ({ name, port: 7080 })),
    { name: "custom-hosted-tool", port: 24000, type: "function" },
    { name: "custom-skill", port: 24001, kind: "skill" },
  ].map(normalizeRuntimeEntrypoint);
  assert.equal(candidates[0].port, 17080);
  for (const candidate of candidates) {
    assert.equal(endpointKind(candidate), "function");
    const result = await probeHttpHealth(candidate, async (url) => {
      assert.equal(url, `http://127.0.0.1:${candidate.port}/admin/host/status`);
      return { ok: true, status: 200, json: async () => ({ state: "Error" }) };
    });
    assert.equal(result.healthy, false);
    assert.equal(result.healthStatus, "Unhealthy");
  }
  assert.equal(endpointKind(normalizeRuntimeEntrypoint({ name: "web", port: 7080 })), "web");
  assert.equal(endpointKind(normalizeRuntimeEntrypoint({ name: "custom-storage", port: 18000 })), "other");
});

test("builds exact lifecycle commands, shell POST examples, and JSON request data", () => {
  const invocation = {
    url: "http://127.0.0.1:8088/responses",
    route: "/responses",
    inputField: "input",
    streaming: false,
  };
  const reference = buildRunCommandReference({
    root: "/work/Dealer's app",
    start: "./scripts/dev-start.sh --skip-skill",
    stop: "./scripts/dev-stop.sh",
    invocation,
  });

  assert.deepEqual(reference.commands.slice(0, 2), [
    {
      id: "start",
      label: "Start app",
      command: "cd '/work/Dealer'\"'\"'s app' && ./scripts/dev-start.sh --skip-skill",
    },
    {
      id: "stop",
      label: "Stop app",
      command: "cd '/work/Dealer'\"'\"'s app' && ./scripts/dev-stop.sh",
    },
  ]);
  assert.match(reference.commands[2].command, /^curl --fail-with-body/);
  assert.match(reference.commands[2].command, /"stream":false/);
  assert.match(reference.commands[3].command, /^\$body = /);
  assert.match(reference.commands[3].command, /Invoke-RestMethod -Method Post/);
  assert.deepEqual(reference.request, {
    method: "POST",
    url: "http://127.0.0.1:8088/responses",
    headers: { "Content-Type": "application/json" },
    body: { input: "Hello from Azure App Platform", stream: false },
    json: '{"input":"Hello from Azure App Platform","stream":false}',
  });
  assert.doesNotMatch(JSON.stringify(reference), /api[-_ ]?key|authorization|credential/i);
});

test("formats structured PowerShell lifecycle commands and allows no invocation", () => {
  const reference = buildRunCommandReference({
    root: "C:\\apps\\unity",
    start: {
      command: "powershell",
      args: ["-NoProfile", "-File", "C:\\apps\\unity\\scripts\\dev-start.ps1"],
      shell: "powershell",
    },
    stop: null,
    invocation: null,
  });
  assert.deepEqual(reference.commands, [{
    id: "start",
    label: "Start app",
    command: "Set-Location 'C:\\apps\\unity'; & 'powershell' '-NoProfile' '-File' 'C:\\apps\\unity\\scripts\\dev-start.ps1'",
  }]);
  assert.equal(reference.request, null);
  assert.match(reference.guidance, /No supported agent HTTP contract/);
});
