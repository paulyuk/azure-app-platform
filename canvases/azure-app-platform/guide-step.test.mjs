import assert from "node:assert/strict";
import test from "node:test";
import { getAgentStatus } from "./agent-status.mjs";
import { getGuideStep } from "./guide-step.mjs";

test("Guide recommendations prioritize evidence, not a running web app or prior success", () => {
  const input = {
    app: { state: "running" }, readiness: { ready: true, gatewayConfigured: true }, agentReady: false,
  };
  assert.equal(getGuideStep(getAgentStatus(input), "deploy").action, "services");
  assert.equal(getGuideStep(getAgentStatus({ ...input, requestState: "succeeded" }), "map").action, "services");
  assert.equal(getGuideStep(getAgentStatus({ ...input, requestState: "failed" }), "build").action, "result");
  assert.equal(getGuideStep(getAgentStatus({ ...input, readinessError: "Readiness offline" }), "build").action, "run");
  assert.equal(getGuideStep(getAgentStatus({ ...input, app: { state: "failed", error: "Startup failed" } }), "map").action, "output");
  assert.equal(getGuideStep(getAgentStatus({ ...input, app: { state: "stopped" }, readiness: { prerequisites: { ready: false } } }), "manage").action, "prereqs");
  assert.equal(getGuideStep(getAgentStatus({ ...input, readiness: { ready: false, mode: "preview" } }), "manage").action, "connection");
  assert.equal(getGuideStep(getAgentStatus({ ...input, app: { state: "stopped", foreignEntrypoints: [{}] } }), "manage").action, "ports");
});

test("Guide follows the five workflow destinations while keeping task outcomes independent", () => {
  const input = { app: { state: "running" }, readiness: { ready: true, gatewayConfigured: true }, agentReady: true };
  for (const [destination, action] of [["build", "build"], ["connections", "connect"], ["manage", "run"], ["map", "observe"], ["logs", "observe"], ["deploy", "deploy"]]) {
    assert.equal(getGuideStep(getAgentStatus(input), destination).action, action);
  }
  assert.equal(getGuideStep(getAgentStatus({ ...input, requestState: "invoking" }), "deploy").title, "Wait for task execution");
  assert.equal(getGuideStep(getAgentStatus({ ...input, requestState: "succeeded" }), "deploy").action, "result");
  assert.match(getGuideStep(getAgentStatus({ ...input, requestState: "succeeded" }), "manage").detail, /not proof of safety/);
});
