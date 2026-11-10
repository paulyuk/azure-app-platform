import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAgentResponsePresentation, RUN_ILLUSTRATION_MARKUP } from "./agent-response.mjs";

test("idle response gives one next action without claiming readiness", () => {
  const view = getAgentResponsePresentation();
  assert.equal(view.title, "Your result will appear here");
  assert.equal(view.illustration, "ready");
  assert.deepEqual(Object.keys(RUN_ILLUSTRATION_MARKUP), ["ready"], "Only idle artwork is embedded in the response renderer");
  assert.equal(view.description, "Choose an event or enter a task above, then select Invoke agent.");
  assert.equal(view.steps, undefined);
  assert.equal(view.showLogs, false);
});

test("preparation and startup never imply the task was sent", () => {
  for (const phase of ["preparing", "starting"]) {
    const view = getAgentResponsePresentation({ state: "invoking", phase, slow: true });
    assert.equal(view.illustration, null);
    assert.match(view.description, /not been sent/);
    assert.equal(view.steps, undefined);
    assert.doesNotMatch(view.title, /Still waiting/);
  }
  const endpoint = getAgentResponsePresentation({ state: "invoking", phase: "endpoint" });
  assert.equal(endpoint.illustration, null);
  assert.match(endpoint.description, /not been sent/);
  assert.equal(endpoint.steps, undefined);
});

test("in-flight and long-wait messages report only request-level evidence", () => {
  for (const slow of [false, true]) {
    const view = getAgentResponsePresentation({ state: "invoking", phase: "waiting", slow });
    assert.equal(view.illustration, null);
    assert.equal(view.steps, undefined);
    assert.equal(view.showLogs, true);
    assert.match(view.description, slow ? /request continues/ : /Tool reports.*with the result/);
    assert.equal(view.title, slow ? "Still waiting for a response" : "Waiting for the agent response");
  }
});

test("startup failures and uncertain request outcomes have different recovery", () => {
  for (const phase of ["preparing", "starting", "endpoint", "waiting"]) {
    const view = getAgentResponsePresentation({ state: "failed", phase });
    assert.equal(view.title, phase === "waiting" ? "This invocation had a problem" : "The task was not sent");
    assert.match(view.description, phase === "waiting" ? /does not confirm.*execution stopped/ : /startup output/);
    assert.equal(view.steps, undefined);
    assert.equal(view.illustration, null);
    assert.equal(view.showLogs, true);
  }
  assert.equal(getAgentResponsePresentation({ state: "succeeded", phase: "waiting", slow: true }), null);
});

test("custom task artwork has distinct semantic roles and no active or external content", async () => {
  for (const name of ["ready", "working"]) {
    const bytes = await readFile(new URL(`./assets/run-${name}-spot.svg`, import.meta.url));
    for (const role of ["outline", "supporting-detail", "accent"]) {
      assert.match(bytes.toString(), new RegExp(`data-spot-role="${role}"`));
    }
    assert.doesNotMatch(bytes.toString(), /<(?:script|foreignObject|animate)\b|\bon\w+\s*=|(?:href|url)\s*[(=]\s*["']?(?!#)[^"')\s]/i);
    assert.doesNotMatch(bytes.toString(), /<(?:filter|linearGradient|radialGradient|image|text)\b|<!DOCTYPE|<!ENTITY/i);
  }
});
