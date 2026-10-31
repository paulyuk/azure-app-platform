import { readFile } from "node:fs/promises";
import { createStudioButtons, STUDIO_BUTTON_MOUNT_CSS } from "./studio-buttons.mjs";

const provenance = JSON.parse(await readFile(new URL("./vendor/toolkit/provenance.json", import.meta.url)));

export async function installToolkitRoutes(page) {
  await page.route("**/canvas-ui/**", async route => {
    const file = provenance.files.find(file => file.route === new URL(route.request().url()).pathname);
    if (!file) throw new Error("Unshipped toolkit asset: " + route.request().url());
    await route.fulfill({
      contentType: file.contentType,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: await readFile(new URL("./vendor/toolkit/" + file.file, import.meta.url)),
    });
  });
}

export function withToolkitButtons(html) {
  const start = html.indexOf("<script>");
  const end = html.lastIndexOf("</script>");
  if (start < 0 || end < start) throw new Error("A browser fixture script is required.");
  const script = html.slice(start + "<script>".length, end);
  const styles = `<link rel="stylesheet" href="http://toolkit-fixture.test/canvas-ui/styles.css">
    <link rel="stylesheet" href="http://toolkit-fixture.test/canvas-ui/base.css">
    <style>${STUDIO_BUTTON_MOUNT_CSS}</style>`;
  const before = html.slice(0, start).replace(/<style>([\s\S]*?)<\/style>/g,
    "<style>@layer studio-legacy { $1 }</style>");
  return before + styles + `<script>
    import(location.protocol === "about:" ? "http://toolkit-fixture.test/canvas-ui/base.mjs" : "/canvas-ui/base.mjs").then(toolkit => {
      window.unityStudioButtons = (${createStudioButtons.toString()})(toolkit);
      (0, eval)(${JSON.stringify(script + "\nif (typeof buildSyntax !== 'undefined') window.buildSyntax = buildSyntax;").replaceAll("<", "\\u003c")});
      window.unityToolkitFixtureReady = true;
    });
  </script>` + html.slice(end + "</script>".length);
}
