import assert from "node:assert/strict";
import test from "node:test";
import { buildActionCenterModel, buildJourneyStages } from "./interactive-app-map.mjs";

const lifecycle = ["starting", "stopping", "configuring", "provisioning", "deploying"];
const model = buildActionCenterModel({
  nodes: [{ id: "agent", kind: "project", tierId: "agent", name: "Custom agent", projectPath: "services/agent" }],
  edges: [], unresolved: [{ from: "agent", target: "unresolved" }],
});
const progress = (state, readiness) => buildJourneyStages(model.stages, { app: state ? { state } : null, readiness }, lifecycle);
const current = (stages) => stages.filter((stage) => ["next", "ready", "runtime", "active"].includes(stage.state)).map((stage) => stage.id);

test("running apps enter Observe & manage despite uncertain source connections and absent telemetry", () => {
  const stages = progress("running", { ready: true });
  assert.deepEqual(current(stages), ["observe"]);
  assert.equal(stages.find((stage) => stage.id === "run").state, "complete");
  assert.equal(stages.find((stage) => stage.id === "connect").state, "attention");
  assert.match(stages.find((stage) => stage.id === "observe").detail, /service logs/);
  assert.equal(model.stages.find((stage) => stage.id === "connect").state, "next", "Source model remains unchanged");
  assert.ok(model.opportunities.some((item) => item.id === "resolve-connections"));
  assert.ok(model.opportunities.some((item) => item.id === "add-observability"));
  assert.deepEqual(current(progress("running", { ready: false })), ["observe"], "Running evidence is independent of static setup checks");
});

test("readiness alone does not claim the app has run or unlock Observe & manage", () => {
  const stages = progress("stopped", { ready: true });
  assert.deepEqual(current(stages), ["run"]);
  assert.equal(stages.find((stage) => stage.id === "run").state, "ready");
  assert.equal(stages.find((stage) => stage.id === "observe").state, "blocked");
});

test("start, stop, configuration, deployment and failure states return to Run without hiding source review", () => {
  for (const state of [...lifecycle, "failed"]) {
    const stages = progress(state, { ready: true });
    assert.deepEqual(current(stages), ["run"], state);
    assert.equal(stages.find((stage) => stage.id === "observe").state, "blocked", state);
    assert.equal(stages.find((stage) => stage.id === "connect").state, "attention", state);
  }
});

test("a running preview can be inspected without claiming full app readiness", () => {
  const stages = progress("running", { ready: true, mode: "preview" });
  assert.deepEqual(current(stages), ["observe"]);
  assert.match(stages.find((stage) => stage.id === "run").detail, /preview.*not the full app/);
  assert.match(stages.find((stage) => stage.id === "observe").detail, /preview.*full app setup remains/);
});

test("apps without runtime evidence still receive ordered setup guidance", () => {
  assert.deepEqual(current(progress(null, null)), ["connect"]);
  assert.deepEqual(current(progress("stopped", { ready: false })), ["connect"]);
  const empty = buildActionCenterModel({ nodes: [], edges: [], unresolved: [] });
  const stages = buildJourneyStages(empty.stages, { app: { state: "stopped" }, readiness: { ready: false } }, lifecycle);
  assert.deepEqual(current(stages), ["build"]);
  assert.equal(stages.find((stage) => stage.id === "observe").state, "blocked");
});
