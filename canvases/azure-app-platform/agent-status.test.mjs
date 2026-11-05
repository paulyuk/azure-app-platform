import assert from "node:assert/strict";
import test from "node:test";
import { getAgentStatus } from "./agent-status.mjs";

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

test("invocation failure and results survive readiness transitions without claiming current readiness", () => {
  for (const appState of ["stopped", "starting", "stopping", "configuring", "running", "failed", "provisioning", "deploying"]) {
    for (const [requestState, title] of [
      ["invoking", "Task in progress"], ["failed", "Task execution failed"], ["succeeded", "Task result received"],
    ]) {
      const status = getAgentStatus({ app: { state: appState }, readiness: ready, requestState });
      assert.equal(status.state, requestState);
      assert.equal(status.title, title);
      assert.equal(status.agent, "Not ready");
      if (requestState === "failed") assert.match(status.description, /last invocation failed; its error is retained/);
      if (requestState === "succeeded") assert.match(status.description, /not proof of safety or tool success/);
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
  assert.equal(failure.state, "failed");
  assert.match(failure.description, /Status unavailable/);
});
