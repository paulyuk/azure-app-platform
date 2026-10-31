import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function installStudioAssetRoutes(page) {
  const provenance = JSON.parse(await readFile(new URL("./vendor/toolkit/provenance.json", import.meta.url)));
  const files = new Map(provenance.files.map(file => [file.route, {
    url: new URL("./vendor/toolkit/" + file.file, import.meta.url), type: file.contentType,
  }]));
  await page.route("**/canvas-ui/**", async route => {
    const asset = files.get(new URL(route.request().url()).pathname);
    assert.ok(asset, "Only the shipped toolkit allowlist may be loaded by the fixture.");
    await route.fulfill({ contentType: asset.type, body: await readFile(asset.url) });
  });
}

export async function openWorkspaceNavigation(page) {
  const menu = page.locator("#app-workspace-navigation");
  await menu.waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const shell = document.querySelector("#studio-workspace-navigation");
    return shell.getBoundingClientRect().width >= 1180 || shell.dataset.navigationExpanded === "false";
  });
  const narrow = await page.locator("#studio-workspace-navigation").evaluate(node => node.getBoundingClientRect().width < 1180);
  if (!await menu.isVisible() || narrow && await menu.getAttribute("data-mode") !== "held") {
    await page.locator("#browse-workspaces").click();
  }
  await menu.waitFor();
}

export async function selectWorkspace(page, id) {
  await openWorkspaceNavigation(page);
  await page.locator("#" + id).click();
}
