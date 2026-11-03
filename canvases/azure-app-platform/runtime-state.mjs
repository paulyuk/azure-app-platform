import { readFile } from "node:fs/promises";

const TRANSIENT_APP_STATES = new Set([
  "starting",
  "stopping",
  "configuring",
  "provisioning",
  "deploying",
]);

const KNOWN_PROCESS_PORTS = new Map([
  ["web", 3000],
  ["agent", 8088],
  ["skill", 7071],
  ["azurite", 10000],
]);

function isAppOperationActive(state) {
  return TRANSIENT_APP_STATES.has(state);
}

function optionalRegistryMetadata(entry) {
  const metadata = {};
  for (const field of ["log", "errlog", "projectPath", "startedAt"]) {
    if (typeof entry?.[field] === "string" && entry[field].trim()) {
      metadata[field] = entry[field].trim();
    }
  }
  return metadata;
}

function normalizeRegistryEntry(entry, includeMetadata = false) {
  const name = String(entry?.name || "");
  const port = Number(entry?.port ?? KNOWN_PROCESS_PORTS.get(name.toLowerCase()));
  if (!entry?.name || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return {
    name,
    port,
    pid: Number.isInteger(Number(entry.pid)) && Number(entry.pid) > 0 ? Number(entry.pid) : null,
    ...(includeMetadata ? optionalRegistryMetadata(entry) : {}),
  };
}

export async function readProcessRegistry(root, read = readFile, { includeMetadata = false } = {}) {
  const entries = [];
  try {
    const contents = await read(`${root}/.dev-run/processes.posix.tsv`, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const [name, port, pid, fourth, fifth, sixth] = line.split("\t");
      const extendedLogRecord = Boolean(fifth || sixth || /\.(?:log|jsonl)$/i.test(fourth || ""));
      const entry = normalizeRegistryEntry({
        name,
        port,
        pid,
        ...(extendedLogRecord
          ? { log: fourth, errlog: fifth, projectPath: sixth }
          : { startedAt: fourth }),
      }, includeMetadata);
      if (entry) entries.push(entry);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    const contents = JSON.parse(await read(`${root}/.dev-run/processes.json`, "utf8"));
    for (const item of Array.isArray(contents) ? contents : [contents]) {
      const entry = normalizeRegistryEntry(item, includeMetadata);
      if (entry) entries.push(entry);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return [...new Map(entries.map((entry) => [entry.port, entry])).values()];
}

export function deriveRuntimeState(
  recordedState,
  registry,
  entrypoints,
  { ownershipAvailable = false, ownedPorts = new Set() } = {},
) {
  if (isAppOperationActive(recordedState?.state) && recordedState.recovered !== true) return recordedState;

  const readyPorts = new Set(entrypoints.filter((entrypoint) => entrypoint.ready).map((entrypoint) => entrypoint.port));
  const trackedPorts = [...new Set(registry.map((entry) => entry.port))];
  const attributableReadyPorts = ownershipAvailable
    ? new Set([...ownedPorts].filter((port) => readyPorts.has(port))) : readyPorts;
  const expectedPorts = entrypoints.filter((entrypoint) => entrypoint.expected !== false)
    .map((entrypoint) => entrypoint.port);
  const allExpectedReady = expectedPorts.length > 0
    && expectedPorts.every((port) => attributableReadyPorts.has(port));
  const coreEntrypoints = new Map(entrypoints
    .filter((entrypoint) => ["web", "agent"].includes(String(entrypoint.name).toLowerCase()))
    .map((entrypoint) => [String(entrypoint.name).toLowerCase(), entrypoint]));
  if (
    trackedPorts.length === 0
    && ownershipAvailable
    && allExpectedReady
  ) {
    return { state: "running", recovered: recordedState?.state !== "running" };
  }
  if (trackedPorts.length > 0 && allExpectedReady
    && trackedPorts.every((port) => attributableReadyPorts.has(port))) {
    return { state: "running", recovered: recordedState?.state !== "running" };
  }
  if (recordedState?.state === "failed") return recordedState;
  if (
    trackedPorts.some((port) => attributableReadyPorts.has(port))
    || (
      trackedPorts.length === 0
      && ownershipAvailable
      && [...coreEntrypoints.values()].some((entrypoint) => ownedPorts.has(entrypoint.port))
    )
  ) {
    return { state: "starting", recovered: true };
  }
  if (recordedState?.state === "failed") return recordedState;
  return { state: "stopped", recovered: Boolean(recordedState) };
}
