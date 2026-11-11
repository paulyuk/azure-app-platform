import assert from "node:assert/strict";
import test from "node:test";
import { getRunExecutionLayers } from "./run-execution.mjs";

test("execution follows real readiness and request boundaries", () => {
  const states = (state, phase) => getRunExecutionLayers({ state, phase }).map(layer => layer.state);
  assert.deepEqual(states("invoking", "preparing"), ["active", "pending"]);
  assert.deepEqual(states("invoking", "starting"), ["active", "pending"]);
  assert.deepEqual(states("invoking", "endpoint"), ["succeeded", "pending"]);
  assert.deepEqual(states("invoking", "waiting"), ["succeeded", "active"]);
  assert.deepEqual(states("failed", "starting"), ["failed", "not-run"]);
  assert.deepEqual(states("failed", "waiting"), ["succeeded", "failed"]);
  assert.deepEqual(states("succeeded", "waiting"), ["succeeded", "succeeded"]);
  assert.equal(getRunExecutionLayers({ state: "succeeded", phase: "waiting" })
    .some(layer => layer.id === "result"), false);
});

test("tool reports never imply success without a completed call or result", () => {
  const layers = getRunExecutionLayers({
    state: "succeeded", phase: "waiting",
    tools: [
      { name: "Reported", status: "Call reported" }, { name: "Completed", status: "Completed" },
      { name: "Result", status: "Result returned" }, { name: "Failure", status: "Failed" },
    ],
  });
  assert.deepEqual(layers.slice(2).map(layer => layer.state), ["unverified", "succeeded", "succeeded", "failed"]);
});

test("policy evidence preserves succeeded, blocked and unattempted layers", () => {
  const layers = getRunExecutionLayers({
    state: "blocked", phase: "waiting",
    blockedResponse: {
      operatorMessage: "Unsafe input rejected.",
      stages: [
        { id: "agent-harness", state: "succeeded", detail: "Request received" },
        { id: "document-tool", state: "rejected", detail: "Document rejected", reasonCode: "unsafe-input" },
        { id: "model", state: "not-attempted", detail: "No model call" },
        { id: "approval-disclosure", state: "not-applicable", detail: "No disclosure" },
      ],
    },
  });
  assert.deepEqual(layers.map(layer => layer.state),
    ["succeeded", "succeeded", "blocked", "not-run", "not-applicable"]);
  assert.match(layers[2].detail, /unsafe-input/);
  assert.equal(layers.some(layer => "flyout" in layer), false,
    "Execution layers do not carry hover-card metadata.");
  assert.deepEqual(layers[2].metadata.map(entry => entry.label),
    ["Layer", "Stage", "Result", "Reason code", "Enforcement", "HTTP status", "Trace"]);
  assert.match(layers[2].metadata.find(entry => entry.label === "Layer").value, /3 of 5 · Policy gate/);
  assert.equal(layers.filter(layer => ["blocked", "failed"].includes(layer.state)).length, 1);
});
