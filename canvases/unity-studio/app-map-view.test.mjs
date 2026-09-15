import assert from "node:assert/strict";
import test from "node:test";
import { buildRequestFlowModel } from "./interactive-app-map.mjs";

const node = (id, tierId, kind = "project") => ({ id, tierId, kind });
const edge = (from, to, path = "src/agent/main.py") => ({
  id: `${from}:${to}`, from, to, kind: "tool-call", confidence: "high", evidence: [{ path }],
});

test("the request flow and other resources partition the complete inventory without using runtime state", () => {
  const nodes = [
    node("web", "web"), node("agent", "agent"), node("skill", "skills"),
    node("spare", "sandbox"), node("spare-data", "data"),
    node("activity", "workflows", "operation"), node("sre", "sre"),
  ];
  const edges = [
    edge("web", "agent"), edge("agent", "skill"), edge("skill", "agent"),
    edge("spare", "spare-data"), edge("agent", "activity"),
  ];
  for (const state of ["stopped", "running", "failed"]) {
    const flow = buildRequestFlowModel({ nodes, edges, state });
    assert.deepEqual(flow.nodeIds, ["web", "agent", "skill", "sre"]);
    assert.deepEqual(flow.otherNodeIds, ["spare", "spare-data", "activity"]);
    assert.deepEqual(flow.unconnectedNodeIds, ["spare", "spare-data"]);
    assert.equal(new Set([...flow.nodeIds, ...flow.otherNodeIds]).size, nodes.length);
    assert.deepEqual(flow.otherEdges.map((item) => item.id), ["spare:spare-data", "agent:activity"]);
  }
});

test("other resources retain documented edge uncertainty", () => {
  const flow = buildRequestFlowModel({
    nodes: [node("agent", "agent"), node("spare", "skills"), node("data", "data")],
    edges: [edge("spare", "data", "docs/architecture.md")],
  });
  assert.deepEqual(flow.otherNodeIds, ["spare", "data"]);
  assert.equal(flow.otherEdges[0].evidenceKind, "documentation");
  assert.equal(flow.otherEdges[0].confidence, "low");
  assert.equal(flow.otherEdges[0].label, "Documented data access");
});

test("headless, disconnected-only, and empty inventories remain inspectable", () => {
  assert.deepEqual(buildRequestFlowModel({
    nodes: [node("agent", "agent"), node("sandbox", "sandbox")],
    edges: [edge("agent", "sandbox")],
  }).nodeIds, ["agent", "sandbox"]);
  const disconnected = buildRequestFlowModel({ nodes: [node("skill", "skills")], edges: [] });
  assert.deepEqual(disconnected.nodeIds, []);
  assert.deepEqual(disconnected.otherNodeIds, ["skill"]);
  const empty = buildRequestFlowModel({ nodes: [], edges: [] });
  assert.deepEqual(empty.nodeIds, []);
  assert.deepEqual(empty.otherNodeIds, []);
});
