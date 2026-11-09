import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const engine of ["chromium", "webkit"]) {
  test(`Settings deletion uses the common accessible confirmation and preserves outcomes on Home in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.", timeout: 90000,
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.app = "stopped";
    fixture.state.appName = "Document helper <draft>";
    const browser = await playwright[engine].launch({ headless: true });
    let release;
    try {
      const page = await browser.newPage({ viewport: { width: 380, height: 640 } });
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      let failSources = false;
      await page.route(url => url.origin === fixture.origin && url.pathname === "/", route =>
        route.fulfill({ contentType: "text/html", body: renderStudioHtml("delete-settings", "fixture") }));
      await page.route("**/api/sources", route => route.fulfill(failSources
        ? { status: 503, json: { error: "Source catalog unavailable." } }
        : { json: { roots: [], apps: [], templates: [] } }));
      const openReview = async () => {
        await page.goto(fixture.origin + "/app-map");
        await page.waitForFunction(() => window.appPlatformReady
          && document.querySelector("#header-runtime-action").textContent === "Run app");
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        await page.getByRole("combobox", { name: "Settings section", exact: true }).selectOption("danger");
        await page.getByRole("button", { name: "Delete local app...", exact: true }).click();
        const dialog = page.getByRole("alertdialog", { name: "Delete Document helper <draft>?", exact: true });
        await dialog.waitFor();
        return dialog;
      };
      let confirmation = await openReview();
      assert.equal(await confirmation.locator("#app-delete-path").innerText(), "/fixture/dealer");
      assert.match(await confirmation.innerText(), /Uncommitted changes and untracked files will be permanently lost/);
      const cancel = confirmation.getByRole("button", { name: "No, keep app", exact: true });
      assert.equal(await cancel.evaluate(node => node === document.activeElement), true);
      for (const key of ["Shift+Tab", "Tab", "Tab", "Tab"]) {
        await page.keyboard.press(key);
        assert.equal(await confirmation.evaluate(node => node.contains(document.activeElement)), true);
      }
      await page.keyboard.press("Escape");
      await confirmation.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.hasAttribute("data-delete-app"));
      assert.equal(await page.getByRole("dialog", { name: "Settings", exact: true }).isVisible(), true);
      assert.equal(fixture.mutations.some(item => item.path === "/api/delete-app"), false);
      for (const outcome of ["complete", "partial"]) for (const refreshFailure of [false, true]) {
        failSources = refreshFailure;
        fixture.state.deleteOutcome = outcome;
        fixture.state.deleteDelay = new Promise(resolve => { release = resolve; });
        confirmation = await openReview();
        const before = fixture.mutations.filter(item => item.path === "/api/delete-app").length;
        await confirmation.getByRole("button", { name: "Yes, delete worktree", exact: true }).click();
        await page.waitForFunction(() => document.querySelector(".app-delete-dialog")?.getAttribute("aria-busy") === "true");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await confirmation.locator("form").evaluate(form =>
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        assert.equal(await confirmation.isVisible(), true);
        assert.equal(await confirmation.getByRole("button", { name: "No, keep app", exact: true }).isDisabled(), true);
        assert.match(await confirmation.getByRole("status").innerText(), /cannot be cancelled/);
        const bounds = await confirmation.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 380 && bounds.y + bounds.height <= 640);
        release();
        fixture.state.deleteDelay = null;
        await page.waitForURL(url => url.pathname === "/" && url.searchParams.has("notice"));
        await page.waitForFunction(({ outcome, refreshFailure }) => {
          const text = document.querySelector("#status")?.textContent || "";
          return text.includes("App worktree deleted.") === (outcome === "complete")
            && text.includes("Azure resources were not changed.")
            && (outcome !== "partial" || text.includes("git branch -D 'managed-app'"))
            && (!refreshFailure || text.includes("Apps could not be refreshed: Source catalog unavailable."));
        }, { outcome, refreshFailure });
        assert.equal(await page.locator("#status").getAttribute("class"), outcome === "partial" || refreshFailure ? "error" : "");
        assert.equal(await page.locator(".app-list-row").count(), 0);
        const mutations = fixture.mutations.filter(item => item.path === "/api/delete-app").slice(before);
        assert.deepEqual(mutations.map(item => item.body), [{ root: "/fixture/dealer", confirmed: true }]);
      }
      assert.deepEqual(errors, []);
    } finally {
      release?.();
      await browser.close();
      await fixture.close();
    }
  });
}
