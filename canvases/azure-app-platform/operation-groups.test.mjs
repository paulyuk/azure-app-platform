import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationGroups } from "./operation-groups.mjs";
import { buildRequestFlowModel } from "./interactive-app-map.mjs";

const project = (id, projectPath, tierId = "workflows") => ({ id, projectPath, tierId, kind: "project" });
const item = (id, projectPath, kind = "operation") => ({ id, projectPath, kind, tierId: kind === "event" ? "connectors" : "workflows" });
const edge = (from, to, kind = "contains") => ({ id: from + ":" + to, from, to, kind, evidence: [] });

test("workflow containment and shared source roots group operations and events, without borrowing other projects", () => {
  const nodes = [
    project("workflow", "custom/approvals"), project("skill", "tools/search", "skills"),
    item("activity", "custom/approvals"), item("event", "custom/approvals", "event"),
    item("orphan", "unknown"), item("skill-tool", "tools/search"),
  ];
  assert.deepEqual(buildOperationGroups(nodes, [edge("workflow", "activity")]), [
    { parentId: "workflow", nodeIds: ["activity", "event"] },
  ]);
  assert.deepEqual(buildOperationGroups([
    project("root", "."), item("entry", "."), item("unknown"),
  ], []), [{ parentId: "root", nodeIds: ["entry"] }]);
});

test("ambiguous ownership stays ungrouped, while explicit containment resolves shared project roots", () => {
  const nodes = [project("one", "shared"), project("two", "shared"), item("activity", "shared")];
  assert.deepEqual(buildOperationGroups(nodes, []), []);
  assert.deepEqual(buildOperationGroups(nodes, [edge("one", "activity")]), [
    { parentId: "one", nodeIds: ["activity"] },
  ]);
  assert.deepEqual(buildOperationGroups(nodes, [edge("one", "activity"), edge("two", "activity")]), []);
});

test("calls into internal operations keep the owning workflow and downstream systems on the request path", () => {
  const nodes = [
    project("agent", "agent", "agent"), project("workflow", "workflows/approval"),
    item("entry", "workflows/approval"), item("wait", "workflows/approval", "event"),
    project("system", "systems/orders", "connectors"), project("unused", "sandbox", "sandbox"),
  ];
  const edges = [
    edge("agent", "entry", "tool-call"), edge("workflow", "entry"),
    edge("entry", "wait", "wait-for-event"), edge("entry", "system", "connector-call"),
  ];
  const flow = buildRequestFlowModel({ nodes, edges });
  assert.deepEqual(flow.nodeIds, ["agent", "workflow", "system"]);
  assert.deepEqual(flow.otherNodeIds, ["entry", "wait", "unused"]);
  assert.equal(flow.otherResourceCount, 1);
  assert.deepEqual(flow.edges.map((item) => item.id), ["agent:entry", "entry:system"]);
  assert.deepEqual(flow.otherEdges.map((item) => item.id), ["workflow:entry", "entry:wait"]);
  assert.equal(nodes.length, new Set([...flow.nodeIds, ...flow.otherNodeIds]).size);
});
