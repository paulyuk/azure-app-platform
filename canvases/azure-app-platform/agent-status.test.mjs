import assert from "node:assert/strict";
import test from "node:test";
import { createAgentStatusComponent, getAgentStatus } from "./agent-status.mjs";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";

const ready = { ready: true, gatewayConfigured: true, model: "model", activeGateway: { name: "gateway" } };
test("Status Brief classifies runtime, agent availability and connection evidence independently", () => {
  for (const [app, readiness, agentReady, expected, runtime, agent] of [
    [undefined, undefined, false, "checking", "Checking", "Unknown"],
    [{ state: "stopped" }, ready, false, "stopped", "Not running", "Not ready"],
    [{ state: "stopped", foreignEntrypoints: [{ port: 8088 }] }, ready, false, "ports", "Not running", "Not ready"],
    [{ state: "starting" }, ready, false, "starting", "Starting locally", "Not ready"],
    [{ state: "starting", recovered: true }, ready, false, "runtime-failed", "Partial startup", "Not ready"],
    [{ state: "starting" }, ready, true, "ready", "Starting locally", "Endpoint available"],
    [{ state: "running" }, ready, true, "ready", "Running locally", "Endpoint available"],
    [{ state: "running" }, ready, false, "agent-unavailable", "Running locally", "Not ready"],
    [{ state: "running" }, { ready: true, gatewayConfigured: false, mode: "preview" }, false, "preview", "Local preview", "Not ready"],
    [{ state: "stopped" }, { ready: false, gatewayConfigured: false }, false, "connection", "Not running", "Not ready"],
    [{ state: "stopped" }, { ...ready, prerequisites: { ready: false } }, false, "prerequisites", "Not running", "Not ready"],
    [{ state: "stopping" }, ready, true, "stopping", "Stopping", "Endpoint available"],
    [{ state: "configuring" }, ready, false, "configuring", "Configuring", "Not ready"],
    [{ state: "running" }, { ...ready, activeGateway: { configurationStatus: "configuring" } }, true, "configuring", "Running locally", "Endpoint available"],
    [{ state: "failed" }, ready, false, "runtime-failed", "Operation failed", "Not ready"],
    [{ state: "failed" }, ready, true, "ready", "Operation failed", "Endpoint available"],
    [{ state: "provisioning" }, ready, false, "provisioning", "Provisioning Azure", "Not ready"],
    [{ state: "deploying" }, ready, false, "deploying", "Deploying to Azure", "Not ready"],
  ]) {
    const status = getAgentStatus({ app, readiness, agentReady });
    assert.equal(status.state, expected, JSON.stringify({ app, readiness, agentReady }));
    assert.equal(status.runtime, runtime);
    assert.equal(status.agent, agent);
    assert.ok(status.description);
    assert.doesNotMatch(status.title, /chat|conversation/i);
  }
  assert.equal(getAgentStatus({ app: { state: "running" }, readiness: ready }).connection, "model · gateway");
  assert.match(getAgentStatus({ app: { state: "failed", error: "Installer failed" }, readiness: ready }).runtimeError, /Installer failed/);
});

test("invocation failures and policy blocks do not override independent availability and runtime health", () => {
  for (const appState of ["stopped", "starting", "stopping", "configuring", "running", "failed", "provisioning", "deploying"]) {
    for (const agentReady of [false, true]) {
      const input = { app: { state: appState }, readiness: ready, agentReady };
      for (const requestState of ["failed", "blocked"]) {
        assert.deepEqual(getAgentStatus({ ...input, requestState }), getAgentStatus(input));
      }
    }
  }
});

test("invocation progress and results retain separate availability facts", () => {
  for (const appState of ["stopped", "starting", "stopping", "configuring", "running", "failed", "provisioning", "deploying"]) {
    for (const [requestState, title] of [
      ["invoking", "Task in progress"], ["succeeded", "Task result received"],
    ]) {
      const status = getAgentStatus({ app: { state: appState }, readiness: ready, requestState });
      assert.equal(status.state, requestState);
      assert.equal(status.title, title);
      assert.equal(status.agent, "Not ready");
      if (requestState === "succeeded") {
        assert.match(status.description, /not proof of safety or tool success/);
        assert.match(status.description, /Select View execution/);
      }
    }
  }
});

test("readiness fetch errors are explicit, not stopped or success-shaped defaults", () => {
  const status = getAgentStatus({ readinessError: "Status endpoint unavailable" });
  assert.equal(status.state, "unavailable");
  assert.equal(status.runtime, "Unavailable");
  assert.equal(status.agent, "Unknown");
  assert.equal(status.connection, "Unknown");
  assert.equal(status.description, "Status endpoint unavailable");
  const failure = getAgentStatus({ readinessError: "Status unavailable", requestState: "failed" });
  assert.equal(failure.state, "unavailable");
  assert.match(failure.description, /Status unavailable/);
});

test("Status Brief classifies App Service Builder web-only and multi-entrypoint states", () => {
  const webOnlyStopped = getAgentStatus({
    app: { state: "stopped" },
    readiness: { ready: true, requiresGateway: false },
    hasWeb: true,
    webReady: false,
    hasAgent: false,
  });
  assert.equal(webOnlyStopped.state, "stopped");
  assert.equal(webOnlyStopped.title, "Ready to build & run web app");
  assert.equal(webOnlyStopped.agent, "Not running");
  assert.equal(webOnlyStopped.connection, "Not required");

  const webOnlyRunning = getAgentStatus({
    app: { state: "running" },
    readiness: { ready: true, requiresGateway: false },
    hasWeb: true,
    webReady: true,
    hasAgent: false,
  });
  assert.equal(webOnlyRunning.state, "ready");
  assert.equal(webOnlyRunning.title, "Web app ready");
  assert.equal(webOnlyRunning.agentLabel, "Local URL");
  assert.equal(webOnlyRunning.agent, "Web app available");

  const webOnlyWithUrl = getAgentStatus({
    app: { state: "running" },
    readiness: { ready: true, requiresGateway: false },
    hasWeb: true,
    webReady: true,
    webUrl: "http://localhost:8086",
    hasAgent: false,
  });
  assert.equal(webOnlyWithUrl.agentLabel, "Local URL");
  assert.equal(webOnlyWithUrl.agent, "http://localhost:8086");

  const nodes = [];
  const AgentStatus = createAgentStatusComponent({
    createElement(tag, props, ...children) {
      const node = { tag, props: props || {}, children: children.flat().filter(Boolean) };
      nodes.push(node);
      return node;
    },
    Button: "button",
    InlineNotice: "div",
  });
  AgentStatus(webOnlyWithUrl);
  const dtLabels = nodes.filter((node) => node.tag === "dt").map((node) => node.children.join(""));
  const ddValues = nodes
    .filter((node) => node.tag === "dd")
    .map((node) => node.children.map((child) => (typeof child === "object" ? child.children.join("") : String(child))).join(""));
  assert.deepEqual(dtLabels, ["Runtime", "Local URL", "Connection"]);
  assert.deepEqual(ddValues, ["Running locally", "http://localhost:8086", "Not required"]);

  const html = renderInteractiveAppMapHtml({
    root: "/fixture/web-only",
    generatedAt: "2026-04-20T00:00:00.000Z",
    nodes: [{ id: "site", tierId: "web", name: "site", projectPath: ".", kind: "project", badges: [], evidence: [] }],
    edges: [],
    summary: { projectNodes: 1, operationNodes: 0, edges: 0 },
  }, { apiToken: "fixture", appName: "Vite App Service Frontend" });
  assert.doesNotMatch(html, /web-app-runner|renderWebAppRunner/);
  assert.match(html, /webUrl:\s*webEntry\?\.url\s*\|\|\s*""/);

  const webOnlyNeedsGateway = getAgentStatus({
    app: { state: "stopped" },
    readiness: { ready: false, requiresGateway: true, gatewayConfigured: false, guidance: "Connect an AI Gateway and model." },
    hasWeb: true,
    webReady: false,
    hasAgent: false,
  });
  assert.equal(webOnlyNeedsGateway.state, "connection");
  assert.equal(webOnlyNeedsGateway.title, "Model connection required");
});

