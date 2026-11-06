import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAgentResponsePresentation } from "./agent-response.mjs";

test("idle response gives one next action without claiming readiness", () => {
  const view = getAgentResponsePresentation();
  assert.equal(view.title, "Your result will appear here");
  assert.equal(view.illustration, "ready");
  assert.equal(view.description, "Choose an event or enter a task above, then select Invoke agent.");
  assert.deepEqual(view.steps, []);
  assert.equal(view.showLogs, false);
});

test("preparation and startup never imply the task was sent", () => {
  for (const phase of ["preparing", "starting"]) {
    const view = getAgentResponsePresentation({ state: "invoking", phase, slow: true });
    assert.match(view.description, /not been sent/);
    assert.deepEqual(view.steps.map(step => step.state), ["current", "pending", "pending"]);
    assert.doesNotMatch(view.title, /Still waiting/);
  }
  const endpoint = getAgentResponsePresentation({ state: "invoking", phase: "endpoint" });
  assert.match(endpoint.description, /not been sent/);
  assert.deepEqual(endpoint.steps.map(step => step.state), ["complete", "current", "pending"]);
});

test("in-flight and long-wait messages report only request-level evidence", () => {
  for (const slow of [false, true]) {
    const view = getAgentResponsePresentation({ state: "invoking", phase: "waiting", slow });
    assert.equal(view.illustration, "working");
    assert.deepEqual(view.steps.map(step => step.state), ["complete", "complete", "current"]);
    assert.equal(view.showLogs, true);
    assert.match(view.note, /Tool reports arrive with the result/);
    assert.equal(view.title, slow ? "Still waiting for a response" : "Waiting for the agent response");
  }
});

test("startup failures and uncertain request outcomes have different recovery", () => {
  for (const phase of ["preparing", "starting", "endpoint", "waiting"]) {
    const view = getAgentResponsePresentation({ state: "failed", phase });
    assert.equal(view.title, phase === "waiting" ? "Task request failed" : "The task was not sent");
    assert.match(view.description, phase === "waiting" ? /does not confirm.*execution stopped/ : /startup output/);
    assert.deepEqual(view.steps, []);
    assert.equal(view.illustration, null);
    assert.equal(view.showLogs, true);
  }
  assert.equal(getAgentResponsePresentation({ state: "succeeded", phase: "waiting", slow: true }), null);
});

test("approved artwork is shipped unchanged and has no active or external content", async () => {
  for (const [name, hash] of [
    ["ready", "b6f9a1ee443748d58af4011c379bbd1509b5c9db0e67865d0413516d3e3ab97a"],
    ["working", "31701112fbede6ba767b27e28c059632f64527c00029b546edff92d51e3df6da"],
  ]) {
    const bytes = await readFile(new URL(`./assets/run-${name}-spot.svg`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
    assert.doesNotMatch(bytes.toString(), /<(?:script|foreignObject|animate)\b|\bon\w+\s*=|(?:href|url)\s*[(=]\s*["']?(?!#)[^"')\s]/i);
  }
});
