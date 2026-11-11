import assert from "node:assert/strict";
import test from "node:test";
import { buildActionCenterModel, buildJourneyStages } from "./interactive-app-map.mjs";

const lifecycle = ["starting", "stopping", "configuring", "provisioning", "deploying"];

test("buildActionCenterModel marks App Service Builder web-only apps ready to run when no gateway is required", () => {
  const webApp = buildActionCenterModel({
    nodes: [{ id: "web:root", kind: "project", tierId: "web", name: "App Service Builder app", projectPath: "." }],
    edges: [],
    unresolved: [],
  });
  assert.equal(webApp.stages.find((stage) => stage.id === "build").state, "complete");
  assert.equal(webApp.stages.find((stage) => stage.id === "connect").state, "complete");
  const stages = buildJourneyStages(webApp.stages, { app: { state: "stopped" }, readiness: { ready: true } }, lifecycle);
  assert.equal(stages.find((stage) => stage.id === "run").state, "ready");
});

test("buildActionCenterModel requires Connect when an App Service Builder app has an unresolved AI Gateway reference", () => {
  const webWithGatewayRef = buildActionCenterModel({
    nodes: [{ id: "web:root", kind: "project", tierId: "web", name: "App Service Builder app", projectPath: "." }],
    edges: [],
    unresolved: [{ from: "web:root", target: "AZURE_AI_GATEWAY_HOST" }],
  });
  assert.equal(webWithGatewayRef.stages.find((stage) => stage.id === "build").state, "complete");
  assert.equal(webWithGatewayRef.stages.find((stage) => stage.id === "connect").state, "next");
  const stages = buildJourneyStages(webWithGatewayRef.stages, { app: { state: "stopped" }, readiness: { ready: false } }, lifecycle);
  assert.equal(stages.find((stage) => stage.id === "run").state, "blocked");
});


