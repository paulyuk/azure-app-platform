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

test("sandbox stage labels and probe metadata distinguish prompt-only and document runs", () => {
  const blockedResponse = {
    testKind: "sandbox-boundary", mode: "local-simulation",
    stages: [{ id: "sandbox-tool", state: "rejected", detail: "Rejected", reasonCode: "unauthorized-egress" }],
    evidence: { sandboxProbe: {
      credentialLikeVariableCount: 3, outboundAttempted: true,
      outboundOutcome: "denied", enforcement: "python-audit-hook",
    } },
  };
  const options = { state: "blocked", phase: "waiting", blockedResponse };
  const layer = getRunExecutionLayers(options)[1];
  assert.equal(layer.label, "Sandbox tool");
  assert.equal(layer.metadata.find(entry => entry.label === "Outbound probe").value, "Denial observed · python-audit-hook");
  assert.match(layer.metadata.find(entry => entry.label === "Cloud isolation").value, /Not verified/);
  assert.equal(getRunExecutionLayers({ ...options, submission: { documents: [{ name: "research.md" }] } })[1].label, "Sandbox tool / document");
  blockedResponse.stages[0].id = "document-tool";
  assert.equal(getRunExecutionLayers(options)[1].label, "Sandbox tool");
  blockedResponse.evidence.sandboxProbe.outboundOutcome = "http-response";
  blockedResponse.evidence.sandboxProbe.enforcement = "unverified";
  assert.match(getRunExecutionLayers(options)[1].metadata.find(entry => entry.label === "Outbound probe").value, /denial unverified/);
});

test("execution evidence shows exact observed names, checked locations, ACA decision, and code pointers", () => {
  for (const stageId of ["document-tool", "sandbox-tool"]) {
    const probe = {
      credentialLikeVariableCount: 0, envKeys: ["HOME", "LANG", "PATH"], envKeyCount: 3,
      secretFilesPresent: false, secretFileCount: 0,
      outboundOutcome: "denied", enforcement: "aca-egress-proxy",
      acaDeniedDecision: {
        action: "Denied", method: "HEAD", scheme: "https", host: "collector.example",
        path: "/", matchedRule: "deny-external",
      },
    };
    const blockedResponse = {
      stages: [{ id: stageId, state: "rejected", detail: "Rejected" }],
      evidence: { sandboxProbe: probe },
    };
    const metadata = () => Object.fromEntries(getRunExecutionLayers({
      state: "blocked", phase: "waiting", blockedResponse,
    })[1].metadata.map(({ label, value }) => [label, value]));
    assert.equal(metadata()["Outbound probe"], "Denial observed · aca-egress-proxy (HEAD https://collector.example/ -> Denied)");
    assert.equal(metadata()["ACA matched rule"], "deny-external");
    assert.equal(metadata()["Sandbox env keys"], "0 credential-like vars · keys: HOME, LANG, PATH · 0 credential locations present (of 5 checked)");
    assert.equal(metadata()["Verify in code"], "config/egress-policy.yaml · src/tools/document-validation/main.py · src/agent/main.py");
    probe.envKeys = [];
    probe.envKeyCount = 0;
    assert.match(metadata()["Sandbox env keys"], /keys: \(none\)/);
    probe.envKeys = Array.from({ length: 32 }, (_, index) => "KEY_" + index);
    probe.envKeyCount = 45;
    probe.secretFileCount = 2;
    probe.secretFilesPresent = true;
    assert.match(metadata()["Sandbox env keys"], /first 32 of 45/);
    assert.match(metadata()["Sandbox env keys"], /2 credential locations present/);
    delete probe.envKeys;
    delete probe.envKeyCount;
    delete probe.secretFilesPresent;
    delete probe.secretFileCount;
    assert.match(metadata()["Sandbox env keys"], /keys: not reported/);
    assert.match(metadata()["Sandbox env keys"], /Credential locations not checked/);
  }
});
