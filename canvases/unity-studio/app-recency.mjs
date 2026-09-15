import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const writes = new Map();

export async function readAppLastOpened(root) {
  try {
    const { lastOpenedAt } = JSON.parse(await readFile(`${root}/.unity-studio/last-opened.json`, "utf8"));
    if (typeof lastOpenedAt !== "string" || !Number.isFinite(Date.parse(lastOpenedAt))) {
      throw new Error("Invalid app last-opened timestamp.");
    }
    return new Date(lastOpenedAt).toISOString();
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function recordAppOpened(root, now = new Date()) {
  const timestamp = now.toISOString();
  const persist = async () => {
    const previous = await readAppLastOpened(root);
    const lastOpenedAt = previous && previous > timestamp ? previous : timestamp;
    const directory = `${root}/.unity-studio`;
    await mkdir(directory, { recursive: true });
    const temporary = `${directory}/last-opened.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ lastOpenedAt }) + "\n", { mode: 0o600 });
    await rename(temporary, `${directory}/last-opened.json`);
    return lastOpenedAt;
  };
  const pending = (writes.get(root) || Promise.resolve()).then(persist, persist);
  writes.set(root, pending);
  try { return await pending; }
  finally { if (writes.get(root) === pending) writes.delete(root); }
}

export function sortAppsByLastOpened(apps) {
  return [...apps].sort((a, b) => {
    const left = Number.isFinite(Date.parse(a.lastOpenedAt)) ? Date.parse(a.lastOpenedAt) : -Infinity;
    const right = Number.isFinite(Date.parse(b.lastOpenedAt)) ? Date.parse(b.lastOpenedAt) : -Infinity;
    return right - left || a.name.localeCompare(b.name) || a.path.localeCompare(b.path);
  });
}
