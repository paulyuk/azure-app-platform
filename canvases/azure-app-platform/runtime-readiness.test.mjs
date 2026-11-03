import assert from "node:assert/strict";
import test from "node:test";
import { deriveRuntimeState } from "./runtime-state.mjs";

test("a running web process cannot mask missing expected agent and skill endpoints", () => {
  const registry = [{ name: "web", port: 3000, pid: 1 }];
  const endpoints = [
    { name: "web", port: 3000, ready: true, expected: true },
    { name: "agent", port: 8088, ready: false, expected: true },
    { name: "skill", port: 7071, ready: false, expected: true },
  ];
  assert.equal(deriveRuntimeState({ state: "running" }, registry, endpoints).state, "starting");
  endpoints[1].expected = endpoints[2].expected = false;
  assert.equal(deriveRuntimeState({ state: "running" }, registry, endpoints).state, "running");
});

test("owned listening ports with failed HTTP health are not ready", () => {
  const state = deriveRuntimeState({ state: "running" }, [{ name: "agent", port: 8088, pid: 1 }],
    [{ name: "agent", port: 8088, ready: false, expected: true }],
    { ownershipAvailable: true, ownedPorts: new Set([8088]) });
  assert.notEqual(state.state, "running");
});

test("startup failure survives partial readiness and recovers only when everything is ready", () => {
  const failure = { state: "failed", error: "Skill did not become healthy" };
  const registry = [{ name: "web", port: 3000, pid: 1 }];
  const endpoints = [{ name: "web", port: 3000, ready: true }, { name: "agent", port: 8088, ready: false }];
  assert.deepEqual(deriveRuntimeState(failure, registry, endpoints), failure);
  endpoints[1].ready = true;
  assert.equal(deriveRuntimeState(failure, registry, endpoints).state, "running");
});

test("headless apps can recover from their owned expected agent endpoint", () => {
  const endpoints = [{ name: "agent", port: 8088, ready: true, expected: true }];
  assert.equal(deriveRuntimeState(null, [], endpoints,
    { ownershipAvailable: true, ownedPorts: new Set([8088]) }).state, "running");
});
