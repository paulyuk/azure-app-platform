import { readFile } from "node:fs/promises";

function normalizeRegistryEntry(entry) {
  const port = Number(entry?.port);
  if (!entry?.name || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return {
    name: String(entry.name),
    port,
    pid: Number.isInteger(Number(entry.pid)) && Number(entry.pid) > 0 ? Number(entry.pid) : null,
  };
}

export async function readProcessRegistry(root, read = readFile) {
  const entries = [];
  try {
    const contents = await read(`${root}/.dev-run/processes.posix.tsv`, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const [name, port, pid] = line.split("\t");
      const entry = normalizeRegistryEntry({ name, port, pid });
      if (entry) entries.push(entry);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    const contents = JSON.parse(await read(`${root}/.dev-run/processes.json`, "utf8"));
    for (const item of Array.isArray(contents) ? contents : [contents]) {
      const entry = normalizeRegistryEntry(item);
      if (entry) entries.push(entry);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return [...new Map(entries.map((entry) => [entry.port, entry])).values()];
}

export function deriveRuntimeState(recordedState, registry, entrypoints) {
  const transientStates = new Set(["starting", "stopping", "configuring"]);
  if (transientStates.has(recordedState?.state)) return recordedState;
  if (recordedState?.state === "running" && registry.length === 0) return recordedState;

  const readyPorts = new Set(entrypoints.filter((entrypoint) => entrypoint.ready).map((entrypoint) => entrypoint.port));
  const trackedPorts = [...new Set(registry.map((entry) => entry.port))];
  if (trackedPorts.length > 0 && trackedPorts.every((port) => readyPorts.has(port))) {
    return { state: "running", recovered: recordedState?.state !== "running" };
  }
  if (trackedPorts.some((port) => readyPorts.has(port))) {
    return { state: "starting", recovered: true };
  }
  if (recordedState?.state === "failed") return recordedState;
  return { state: "stopped", recovered: Boolean(recordedState) };
}
