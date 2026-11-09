import assert from "node:assert/strict";
import test from "node:test";
import { CREATE_GUIDANCE, createTemplateKind, renderCreateProgress } from "./create-flow.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";
import { EMPTY_TEMPLATE, APP_SERVICE_BUILDER_TEMPLATE, SANDBOX_GATEWAY_TEMPLATE } from "./source-catalog.mjs";

test("Create guidance follows real catalog identities and rejects unsupported starters", () => {
  for (const [template, kind] of [
    [SANDBOX_GATEWAY_TEMPLATE, "sandbox"], [APP_SERVICE_BUILDER_TEMPLATE, "web"],
    [EMPTY_TEMPLATE, "basic"], [{ id: "eligible-reference", kind: "sample" }, "sample"],
  ]) {
    assert.equal(createTemplateKind(template), kind);
    assert.ok(CREATE_GUIDANCE[kind].introduction.length <= 160);
    assert.equal(CREATE_GUIDANCE[kind].benefits, undefined);
    assert.ok(CREATE_GUIDANCE[kind].caution && CREATE_GUIDANCE[kind].flow.length && CREATE_GUIDANCE[kind].editing);
    assert.equal(CREATE_GUIDANCE[kind].included.length, { sandbox: 3, web: 1, basic: 4, sample: 6 }[kind]);
    assert.ok(CREATE_GUIDANCE[kind].included.every(([name, description]) => name && description));
  }
  assert.throws(() => createTemplateKind({ id: "unregistered-template" }), /No Create guidance is registered/);
});

test("Create progress identifies exactly the current product step", () => {
  for (const step of [1, 2, 3]) {
    const progress = renderCreateProgress(step);
    assert.equal([...progress.matchAll(/aria-current="step"/g)].length, 1);
    assert.ok(progress.includes('aria-current="step"><span class="create-step-number">' + step));
    assert.match(progress, /Choose a template/);
    assert.match(progress, /Describe app/);
    assert.match(progress, /Review app/);
  }
});

test("Create integration emits valid scripts in delivered standalone and host themes", () => {
  for (const theme of ["light", "dark"]) for (const presentationProfile of [undefined, "github-app"]) {
    const html = renderStudioHtml("create-test", "synthetic-token", { theme, presentationProfile });
    for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => new Function(script[1]));
    }
    assert.match(html, /mountCreateFlow/);
    assert.match(html, /\/api\/workspace-request/);
    assert.match(html, /\/api\/app-name/);
    assert.match(html, /X-App-Platform-Token/);
  }
});
