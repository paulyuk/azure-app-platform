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
  await menu.waitFor();
}

export async function selectWorkspace(page, id) {
  await openWorkspaceNavigation(page);
  await page.locator("#" + id).click();
}
