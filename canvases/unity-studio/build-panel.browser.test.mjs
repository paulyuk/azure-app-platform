import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Build exposes compact editors, Code actions, reviewed policy edits and external-edit conflicts", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    { id: "instructions", title: "Agent instructions", path: "src/agent/prompts/system.md", editable: true, content: "Use the document tool." },
    { id: "tool", title: "Document validation tool", path: "src/tools/document-validation/main.py", editable: true, content: "def main(): pass" },
    { id: "contract", title: "Tool contract", path: "src/tools/document-validation/contract.json", editable: true, content: '{"additionalProperties":false}' },
    { id: "policy", title: "Enforcement policy", path: "config/document-policy.json", editable: true, content: '{"maxBytes":4096}' },
    { id: "runtime", title: "Runtime & access", path: "config/runtime.json", editable: true, content: '{"agentRuntime":"local","other":"preserve"}' },
  ].map((item) => ({ ...item, description: item.title, available: true, sha: "base" }));
  const saved = [];
  const opened = [];
  let codeFails = false;
  const html = `<!doctype html><style>${BUILD_PANEL_CSS}</style><aside id="details" data-mode="build"></aside><script>
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/app", isActive: () => true,
      onRun: () => { document.body.dataset.runRequested = "true"; }, onModel: () => {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    panel.show();
    </script>`;
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(html); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === "/api/build-workspace") body = { artifacts };
      else if (path === "/api/build-file") {
        const input = route.request().postDataJSON();
        saved.push(input);
        body = Object.assign(artifacts.find((item) => item.id === input.id), { content: input.content, sha: "saved" });
      } else if (path === "/api/open-build-file") {
        opened.push(route.request().postDataJSON());
        if (codeFails) {
          await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "VS Code is unavailable." }) });
          return;
        }
        body = { outcome: "opened-in-vscode" };
      } else throw new Error(`Unexpected route ${path}`);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const instructions = page.locator('[data-artifact="instructions"]');
    await instructions.getByRole("textbox").waitFor();
    assert.equal(await page.getByRole("textbox").count(), 5);
    for (const editor of await page.getByRole("textbox").all()) {
      assert.equal(await editor.getAttribute("readonly"), null);
      assert.ok((await editor.boundingBox()).height <= 120);
    }
    await instructions.getByRole("button", { name: "Edit in Code", exact: true }).click();
    await instructions.getByText(/Opened the worktree and file/).waitFor();
    assert.deepEqual(opened[0], { root: "/app", id: "instructions" });
    assert.equal(await instructions.locator(".code-edit svg").count(), 1);
    await instructions.getByRole("textbox").fill("Summarize only approved results.");
    assert.equal(saved.length, 0);
    await instructions.getByRole("button", { name: "Review changes" }).click();
    assert.equal(saved.length, 0);
    await instructions.getByRole("button", { name: "Save reviewed changes" }).click();
    await instructions.getByText(/Saved\. Restart/).waitFor();
    assert.equal(saved[0].baseSha, "base");
    assert.equal(saved[0].content, "Summarize only approved results.");
    const policy = page.locator('[data-artifact="policy"]');
    await policy.getByRole("textbox").fill('{"maxBytes":2048}');
    await policy.getByRole("button", { name: "Review changes" }).click();
    assert.equal(saved.length, 1);
    await policy.getByRole("button", { name: "Save reviewed changes" }).click();
    await policy.getByText(/Saved\. Restart/).waitFor();
    assert.equal(saved[1].id, "policy");
    codeFails = true;
    await policy.getByRole("button", { name: "Edit in Code", exact: true }).click();
    await policy.getByText("VS Code is unavailable.", { exact: true }).waitFor();
    assert.equal(await policy.getByRole("button", { name: "Edit in Code", exact: true }).isEnabled(), true);
    await page.getByRole("combobox", { name: "Agent runtime" }).selectOption("copilot-sdk-sandbox");
    const runtime = page.locator('[data-artifact="runtime"]');
    const config = JSON.parse(await runtime.getByRole("textbox").inputValue());
    assert.equal(config.agentRuntime, "copilot-sdk-sandbox");
    assert.equal(config.other, "preserve");
    await instructions.getByRole("textbox").fill("Unsaved inline draft.");
    codeFails = false;
    await instructions.getByRole("button", { name: "Edit in Code", exact: true }).click();
    await instructions.getByText(/inline draft has not been saved/).waitFor();
    assert.equal(saved.length, 2);
    Object.assign(artifacts[0], { content: "Changed in VS Code.", sha: "external-change" });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await instructions.getByText(/saved file changed in Code/).waitFor();
    assert.equal(await instructions.getByRole("textbox").inputValue(), "Unsaved inline draft.");
    await instructions.getByRole("button", { name: "Review changes" }).click();
    assert.equal(await instructions.getByRole("button", { name: "Save reviewed changes" }).count(), 0);
    await instructions.getByRole("button", { name: "Discard draft & reload" }).click();
    await page.waitForFunction(() => document.querySelector('[data-artifact="instructions"] textarea')?.value === "Changed in VS Code.");
    assert.equal(await page.getByRole("button", { name: "Invoke agent", exact: true }).count(), 0);
    await instructions.getByRole("button", { name: "Test with a document" }).click();
    assert.equal(await page.locator("body").getAttribute("data-run-requested"), "true");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
