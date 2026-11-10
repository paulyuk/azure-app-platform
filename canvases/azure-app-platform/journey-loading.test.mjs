import assert from "node:assert/strict";
import test from "node:test";
import { readWorkspaceCreation, renderWorkspaceLoadingHtml } from "./journey-loading.mjs";

const stream = chunks => new Response(new ReadableStream({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  },
}), { headers: { "Content-Type": "application/x-ndjson" } });

test("creation progress parses split chunks and finishes only on a real result", async () => {
  const stages = [];
  const result = await readWorkspaceCreation(stream([
    '{"type":"progress","message":"Preparing ',
    'files..."}\n{"type":"progress","message":"Opening session..."}\n',
    '{"type":"result","result":{"worktreePath":"fixture"}}\n',
  ]), message => stages.push(message));
  assert.deepEqual(stages, ["Preparing files...", "Opening session..."]);
  assert.deepEqual(result, { worktreePath: "fixture" });
});

test("creation keeps known failures distinct from lost or malformed responses", async () => {
  await assert.rejects(readWorkspaceCreation(stream([
    '{"type":"error","error":"Could not create the worktree."}\n',
  ]), () => {}), error => error.creationFailed && !error.creationOutcomeUnknown);
  for (const chunks of [[], ['{"type":"progress","message":"Creating..."}\n'], ["invalid\n"]]) {
    await assert.rejects(readWorkspaceCreation(stream(chunks), () => {}), error => error.creationOutcomeUnknown);
  }
  await assert.rejects(readWorkspaceCreation(new Response("invalid"), () => {}), error => error.creationOutcomeUnknown);
  await assert.rejects(readWorkspaceCreation(Response.json({}), () => {}), error => error.creationOutcomeUnknown);
  await assert.rejects(readWorkspaceCreation(Response.json({ worktreePath: " " }), () => {}), error => error.creationOutcomeUnknown);
  await assert.rejects(readWorkspaceCreation(new Response(null, {
    headers: { "Content-Type": "application/x-ndjson" },
  }), () => {}), error => error.creationOutcomeUnknown);
});

test("creation preserves existing JSON API responses", async () => {
  assert.deepEqual(await readWorkspaceCreation(Response.json({ worktreePath: "fixture" }), () => {}), { worktreePath: "fixture" });
  await assert.rejects(readWorkspaceCreation(Response.json({ error: "Invalid source" }, { status: 400 }), () => {}),
    error => error.creationFailed && error.message === "Invalid source");
});

test("destination shell has truthful loading, bounded read-only retry and escaped identity", () => {
  const html = renderWorkspaceLoadingHtml('C:\\apps\\</script><script>alert(1)</script>', 'token"</script>', { presentationProfile: "github-app" });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading app components and workspace/);
  assert.match(html, /Retry opening workspace/);
  assert.match(html, /controller.abort\(\), 30000/);
  assert.match(html, /data-studio-presentation="github-app"/);
  assert.doesNotMatch(html, /<script>alert\(1\)/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
});
