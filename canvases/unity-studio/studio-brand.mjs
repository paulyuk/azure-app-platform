import { readFile } from "node:fs/promises";

const logo = await readFile(new URL("./assets/unity-studio-placeholder.svg", import.meta.url), "utf8");

export function renderStudioBrand() {
  return `<a class="studio-brand" href="/" aria-label="Unity Studio home">${logo}<span>Unity Studio</span></a>`;
}
