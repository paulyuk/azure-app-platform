import assert from "node:assert/strict";
import test from "node:test";
import { APP_NAMING_AGENT, suggestAppName } from "./app-naming.mjs";

function fixture(task = { status: "idle", latestResponse: '{"name":"Document Review"}' }) {
  const calls = [];
  const session = { rpc: { tasks: {
    startAgent: async input => { calls.push(["start", input]); return { agentId: "naming-task" }; },
    list: async () => ({ tasks: [{ type: "agent", id: "naming-task", ...task }] }),
    cancel: async input => { calls.push(["cancel", input]); return { cancelled: true }; },
    remove: async input => { calls.push(["remove", input]); return { removed: true }; },
  } } };
  return { session, calls };
}

test("AI naming uses the host task API, required GPT and no tools", async () => {
  const { session, calls } = fixture();
  assert.deepEqual(APP_NAMING_AGENT.tools, []);
  assert.equal(APP_NAMING_AGENT.modelPolicy, "required");
  assert.deepEqual(await suggestAppName(session, { instructions: "  Review loan documents  " }), { name: "Document Review" });
  assert.equal(calls[0][1].agentType, APP_NAMING_AGENT.name);
  assert.equal(calls[0][1].model, "gpt-5.6-sol");
  assert.deepEqual(JSON.parse(calls[0][1].prompt), { instructions: "Review loan documents" });
  assert.deepEqual(calls.slice(1), [["cancel", { id: "naming-task" }], ["remove", { id: "naming-task" }]]);
});

test("AI naming validates instructions before admitting a task and fails explicitly on old hosts", async () => {
  const { session, calls } = fixture();
  for (const instructions of ["", " ", "a".repeat(2001), "\u0000", null]) {
    await assert.rejects(suggestAppName(session, { instructions }), /Provide app instructions/);
  }
  assert.deepEqual(calls, []);
  await assert.rejects(suggestAppName({}, { instructions: "Review documents" }), /does not support AI app naming/);
});

test("AI naming rejects malformed, unsafe and unexpected-model output without inventing a fallback", async () => {
  for (const latestResponse of ['Not JSON', '{}', '{"name":"../escape"}', '{"name":"名前"}',
    '{"name":""}', JSON.stringify({ name: "a".repeat(81) }), '{"name":"App","other":true}']) {
    const { session, calls } = fixture({ status: "completed", latestResponse });
    await assert.rejects(suggestAppName(session, { instructions: "Review documents" }));
    assert.equal(calls.at(-1)[0], "remove");
  }
  const { session } = fixture({ status: "completed", result: '{"name":"App"}', resolvedModel: "unexpected-model" });
  await assert.rejects(suggestAppName(session, { instructions: "Review documents" }), /required GPT/);
});

test("AI naming preserves provider failures and cleans only its own task", async () => {
  const { session, calls } = fixture({ status: "failed", error: "Naming provider unavailable" });
  await assert.rejects(suggestAppName(session, { instructions: "Review documents" }), /Naming provider unavailable/);
  assert.deepEqual(calls.at(-1), ["remove", { id: "naming-task" }]);
});

test("AI naming times out running tasks and stalled reads with confirmed task cleanup", async () => {
  for (const stalled of [false, true]) {
    const { session, calls } = fixture({ status: "running" });
    if (stalled) session.rpc.tasks.list = async () => new Promise(() => {});
    await assert.rejects(suggestAppName(session, { instructions: "Review documents" }, { timeoutMs: 15, pollMs: 2 }), /timed out/);
    assert.equal(calls.at(-1)[0], "remove");
  }
});

test("AI naming reports cleanup failure rather than a success-shaped suggestion", async () => {
  const { session } = fixture();
  session.rpc.tasks.remove = async () => ({ removed: false });
  await assert.rejects(suggestAppName(session, { instructions: "Review documents" }), /could not be cleaned up/);
});
