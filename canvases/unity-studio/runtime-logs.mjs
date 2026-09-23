import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { readProcessRegistry } from "./runtime-state.mjs";

export const LOG_READ_BYTES = 64 * 1024;
export const LOG_MAX_LINES = 400;
export const LOG_DEFAULT_LINES = 200;
export const APP_LOG_MAX_SERVICES = 24;
export const APP_LOG_MAX_CATALOG_SERVICES = 80;
export const APP_LOG_MAX_LINES = 1200;
export const APP_LOG_MAX_BYTES = 256 * 1024;

const CLOUD_ONLY_TIERS = new Set(["gateway", "connectors", "sre"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const portable = (path) => path.split("\\").join("/");

function invalid(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function safeRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const path = portable(value.trim()).replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!path || isAbsolute(path) || /^[a-z]:\//i.test(path) || path.split("/").includes("..")) return null;
  return path;
}

export function parseLogTail(value) {
  if (value == null || value === "") return LOG_DEFAULT_LINES;
  const tail = Number(value);
  if (!Number.isSafeInteger(tail) || tail < 1 || tail > LOG_MAX_LINES) {
    throw invalid(`Log tail must be an integer from 1 to ${LOG_MAX_LINES}.`);
  }
  return tail;
}

async function safeRunDirectory(root) {
  const canonicalRoot = await realpath(root);
  const expected = join(canonicalRoot, ".dev-run");
  const info = await lstat(expected);
  if (info.isSymbolicLink() || !info.isDirectory() || await realpath(expected) !== expected) {
    throw invalid("The app's .dev-run log directory must not be redirected.", 403);
  }
  return { canonicalRoot, runDirectory: expected };
}

function registeredLogPath(root, runDirectory, value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const portablePath = portable(value.trim());
  if (!/\.(?:log|jsonl)$/i.test(portablePath)) return null;
  if (isAbsolute(portablePath)) return resolve(portablePath);
  if (/^[a-z]:\//i.test(portablePath)) return null;
  if (portablePath === ".dev-run" || portablePath.startsWith(".dev-run/")) {
    return resolve(root, portablePath);
  }
  return resolve(runDirectory, portablePath);
}

async function safeLogPath(root, candidate) {
  const { runDirectory } = await safeRunDirectory(root);
  const resolved = resolve(candidate);
  if (!inside(runDirectory, resolved)) {
    throw invalid("Registered service log path escapes the app's .dev-run directory.", 403);
  }
  const info = await lstat(resolved);
  if (info.isSymbolicLink()) throw invalid("Service log symlinks are not allowed.", 403);
  const canonical = await realpath(resolved);
  if (!inside(runDirectory, canonical) || canonical !== resolved) {
    throw invalid("Service log path must not be redirected.", 403);
  }
  if (!info.isFile()) throw invalid("Service log source is not a regular file.", 403);
  return canonical;
}

async function safeRegistryRead(root, path) {
  const { runDirectory } = await safeRunDirectory(root);
  const expected = join(runDirectory, basename(path));
  const info = await lstat(expected);
  if (info.isSymbolicLink() || !info.isFile() || await realpath(expected) !== expected) {
    throw invalid("The local process registry must not be redirected.", 403);
  }
  return readFile(expected, "utf8");
}

async function registryEntries(root) {
  try {
    return await readProcessRegistry(
      root,
      (path) => safeRegistryRead(root, path),
      { includeMetadata: true },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw invalid("Local process registry contains invalid JSON.", 409);
    }
    throw error;
  }
}

function componentNames(node, nodes, runtimeProfile, registry) {
  const names = new Set();
  const projectPath = safeRelativePath(node.projectPath);
  const leaf = projectPath ? basename(projectPath) : "";
  const sameProject = (entry) => safeRelativePath(entry?.projectPath) === projectPath;
  const singleSkill = nodes.filter((candidate) =>
    candidate.kind === "project" && candidate.tierId === "skills").length === 1;
  const directName = node.tierId === "web" ? "web"
    : node.tierId === "agent" ? "agent"
      : node.tierId === "skills" && singleSkill ? "skill"
        : "";

  if (leaf && node.tierId !== "gateway") names.add(leaf);
  if (directName) names.add(directName);
  for (const entry of registry) {
    if (sameProject(entry)) names.add(entry.name);
  }
  for (const entry of runtimeProfile?.entrypoints ?? []) {
    if (sameProject(entry)
      || entry?.name === leaf
      || entry?.name === directName
      || (node.tierId === "skills" && singleSkill && entry?.name === "skill")) {
      if (typeof entry.name === "string" && entry.name.trim()) names.add(entry.name.trim());
    }
  }
  return names;
}

function entryMatchesComponent(entry, node, names) {
  const projectPath = safeRelativePath(node.projectPath);
  const declaredPath = safeRelativePath(entry?.projectPath);
  if (entry?.projectPath != null) return Boolean(declaredPath && declaredPath === projectPath);
  return names.has(entry?.name);
}

function declaredLogEntries(runtimeProfile, node, names) {
  return (Array.isArray(runtimeProfile?.logSources) ? runtimeProfile.logSources : [])
    .filter((entry) =>
      entry?.componentId === node.id
      || safeRelativePath(entry?.projectPath) === safeRelativePath(node.projectPath)
      || (!entry?.componentId && !entry?.projectPath && names.has(entry?.name)));
}

function source(root, node, stream, path, label) {
  return {
    id: hash(`${root}\0${node.id}\0${stream}\0${path}`).slice(0, 32),
    stream,
    label,
    path,
  };
}

function addCandidate(candidates, root, node, stream, path, label) {
  if (!path) return;
  const key = `${stream}\0${path}`;
  if (!candidates.some((candidate) => candidate.key === key)) {
    candidates.push({ key, ...source(root, node, stream, path, label) });
  }
}

async function componentLogCandidates(root, node, nodes, runtimeProfile, registryOverride) {
  if (node.tierId === "sandbox" || node.source === "azure" || node.resourceId
    || CLOUD_ONLY_TIERS.has(node.tierId)) {
    return { candidates: [], registry: [], runDirectory: join(root, ".dev-run") };
  }
  let runDirectory;
  try {
    ({ runDirectory } = await safeRunDirectory(root));
  } catch (error) {
    if (error.code === "ENOENT") return { candidates: [], registry: [], runDirectory: join(root, ".dev-run") };
    throw error;
  }
  const registry = registryOverride ?? await registryEntries(root);
  const names = componentNames(node, nodes, runtimeProfile, registry);
  const candidates = [];
  const metadata = [
    ...registry.filter((entry) => entryMatchesComponent(entry, node, names)),
    ...declaredLogEntries(runtimeProfile, node, names),
  ];

  for (const entry of metadata) {
    const stdout = registeredLogPath(root, runDirectory, entry.log);
    const stderr = registeredLogPath(root, runDirectory, entry.errlog);
    addCandidate(candidates, root, node, "stdout", stdout, `${entry.name || node.name} stdout`);
    addCandidate(candidates, root, node, "stderr", stderr, `${entry.name || node.name} stderr`);
  }

  for (const name of names) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(name)) continue;
    for (const directory of [join(runDirectory, "logs"), runDirectory]) {
      addCandidate(candidates, root, node, "stdout", join(directory, `${name}.out.log`), `${name} stdout`);
      addCandidate(candidates, root, node, "stderr", join(directory, `${name}.err.log`), `${name} stderr`);
    }
    addCandidate(candidates, root, node, "stdout", join(runDirectory, `${name}.stdout.log`), `${name} stdout`);
    addCandidate(candidates, root, node, "stderr", join(runDirectory, `${name}.stderr.log`), `${name} stderr`);
    addCandidate(candidates, root, node, "combined", join(runDirectory, `${name}.log`), `${name} output`);
  }
  return { candidates, registry, runDirectory };
}

async function selectSources(root, candidates) {
  const selected = new Map();
  const blocked = new Set();
  for (const candidate of candidates) {
    if (selected.get(candidate.stream)?.available || blocked.has(candidate.stream)) continue;
    try {
      const path = await safeLogPath(root, candidate.path);
      selected.set(candidate.stream, { ...candidate, path, available: true, reason: "" });
    } catch (error) {
      if (error.code === "ENOENT") {
        if (!selected.has(candidate.stream)) {
          selected.set(candidate.stream, {
            ...candidate,
            available: false,
            reason: "Log capture has not created this stream yet.",
          });
        }
      } else {
        selected.set(candidate.stream, { ...candidate, available: false, reason: error.message });
        blocked.add(candidate.stream);
      }
    }
  }
  if (selected.get("stdout")?.available || selected.get("stderr")?.available) {
    selected.delete("combined");
  } else if (selected.get("combined")?.available) {
    selected.delete("stdout");
    selected.delete("stderr");
  }
  return [...selected.values()].map(({ key, ...item }) => item);
}

export function redactLogText(text) {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "[REDACTED]")
    .replace(/((?:["']?)[\w-]*(?:api[_-]?key|password|secret|access[_-]?token|authorization|accountkey|sharedaccesskey|connection[_-]?string|sas[_-]?token|clientsecret)(?:["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/([?&](?:sig|token|key|code|access_token|api-key)=)[^&\s"']+/gi, "$1[REDACTED]")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function parseCursor(value, id) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 1024) throw invalid("Invalid log cursor.");
  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalid("Invalid log cursor.");
  }
  if (cursor?.v !== 1 || cursor.id !== id || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0
    || typeof cursor.identity !== "string" || typeof cursor.anchor !== "string"
    || typeof cursor.discarding !== "boolean") {
    throw invalid("Invalid log cursor.");
  }
  return cursor;
}

async function cursorAnchor(handle, offset) {
  const count = Math.min(32, offset);
  const buffer = Buffer.alloc(count);
  await handle.read(buffer, 0, count, offset - count);
  return hash(buffer).slice(0, 16);
}

export async function readLogSource(root, logSource, encodedCursor, tail = LOG_DEFAULT_LINES) {
  if (!logSource.available) throw invalid(logSource.reason || "Service log capture is unavailable.", 409);
  tail = parseLogTail(tail);
  const cursor = parseCursor(encodedCursor, logSource.id);
  const canonical = await safeLogPath(root, logSource.path);
  const handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw invalid("Service log source is not a regular file.", 403);
    if (await safeLogPath(root, logSource.path) !== canonical) {
      throw invalid("Service log source changed during access.", 409);
    }
    const current = await stat(canonical);
    if (current.ino !== info.ino || current.dev !== info.dev) {
      throw invalid("Service log source rotated during access. Retry the read.", 409);
    }
    const identity = `${info.dev}:${info.ino}`;
    let reset = Boolean(cursor && (cursor.identity !== identity || cursor.offset > info.size));
    if (cursor && !reset && cursor.anchor !== await cursorAnchor(handle, cursor.offset)) reset = true;
    const initial = !cursor || reset;
    let offset = initial ? Math.max(0, info.size - LOG_READ_BYTES) : cursor.offset;
    let discarding = initial ? offset > 0 : cursor.discarding;
    if (initial && offset > 0) {
      const previous = Buffer.alloc(1);
      await handle.read(previous, 0, 1, offset - 1);
      discarding = previous[0] !== 10;
    }
    const startOffset = offset;
    const count = Math.min(LOG_READ_BYTES, Math.max(0, info.size - offset));
    const buffer = Buffer.alloc(count);
    const { bytesRead } = await handle.read(buffer, 0, count, offset);
    const data = buffer.subarray(0, bytesRead);
    let start = 0;
    const notices = [];
    if (reset) notices.push("Log rotated or truncated; displaying its current tail.");
    if (initial && info.size > LOG_READ_BYTES) notices.push("Showing the recent 64 KiB tail.");
    if (discarding) {
      const newline = data.indexOf(10);
      if (newline === -1) {
        offset += bytesRead;
        start = bytesRead;
      } else {
        start = newline + 1;
        discarding = false;
      }
    }
    let complete = Buffer.alloc(0);
    if (!discarding) {
      const lastNewline = data.lastIndexOf(10);
      if (lastNewline >= start) {
        complete = data.subarray(start, lastNewline + 1);
        offset = startOffset + lastNewline + 1;
      } else if (bytesRead === LOG_READ_BYTES) {
        offset = startOffset + bytesRead;
        discarding = true;
        notices.push("An oversized log line was omitted.");
      } else {
        offset = startOffset + start;
      }
    }
    let lines = complete.toString("utf8").split(/\r?\n/).filter(Boolean);
    if (lines.length > tail) {
      lines = lines.slice(-tail);
      notices.push(`Showing the latest ${tail} lines.`);
    }
    return {
      stream: logSource.stream,
      label: logSource.label,
      available: true,
      reason: "",
      lines: lines.map(redactLogText),
      cursor: Buffer.from(JSON.stringify({
        v: 1,
        id: logSource.id,
        identity,
        offset,
        discarding,
        anchor: await cursorAnchor(handle, offset),
      })).toString("base64url"),
      reset,
      notice: notices.join(" "),
    };
  } finally {
    await handle.close();
  }
}

function unavailableReason(node) {
  if (node.source === "azure" || node.resourceId || CLOUD_ONLY_TIERS.has(node.tierId)) {
    return "Cloud service logs are unavailable in Unity Studio. No Azure log query was made.";
  }
  if (node.tierId === "sandbox") {
    return "This sandbox component has no separately captured local service log.";
  }
  return "No local service log capture is available for this component. Start the app with its lifecycle script to create component logs.";
}

export async function readComponentLogs(root, node, {
  nodes = [node],
  runtimeProfile = null,
  tail = LOG_DEFAULT_LINES,
  cursors = {},
  registry,
} = {}) {
  tail = parseLogTail(tail);
  const { candidates } = await componentLogCandidates(root, node, nodes, runtimeProfile, registry);
  const sources = await selectSources(root, candidates);
  const streams = await Promise.all(sources.map(async (logSource) => {
    if (!logSource.available) {
      return {
        stream: logSource.stream,
        label: logSource.label,
        available: false,
        reason: logSource.reason,
        lines: [],
        cursor: null,
        reset: false,
        notice: "",
      };
    }
    return readLogSource(root, logSource, cursors[logSource.stream], tail);
  }));
  const available = streams.some((stream) => stream.available);
  const reason = available ? "" : streams.find((stream) => stream.reason)?.reason || unavailableReason(node);
  return {
    root,
    node: {
      id: node.id,
      name: node.name,
      tierId: node.tierId,
      projectPath: node.projectPath ?? null,
    },
    availability: available ? "available" : "unavailable",
    reason,
    streams,
  };
}

async function appRegistryEntries(root) {
  try {
    await safeRunDirectory(root);
    return await registryEntries(root);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function matchesProject(entry, nodes, runtimeProfile, registry) {
  return nodes.some((node) =>
    node.kind === "project"
    && entryMatchesComponent(entry, node, componentNames(node, nodes, runtimeProfile, registry)));
}

function supportingGroupKey(entry) {
  if (Number.isInteger(entry?.pid) && entry.pid > 0) return `pid:${entry.pid}`;
  const log = typeof entry?.log === "string" ? portable(entry.log) : "";
  const errlog = typeof entry?.errlog === "string" ? portable(entry.errlog) : "";
  if (log || errlog) return `logs:${log}\0${errlog}`;
  return `endpoint:${String(entry?.name || "").toLowerCase()}\0${Number(entry?.port) || 0}`;
}

function addSupportingEntry(groups, entry, sourceKind) {
  if (typeof entry?.name !== "string" || !entry.name.trim()) return;
  const normalized = { ...entry, name: entry.name.trim(), sourceKind };
  const key = supportingGroupKey(normalized);
  const existing = groups.get(key);
  if (existing) {
    if (!existing.entries.some((candidate) =>
      candidate.name === normalized.name
      && candidate.port === normalized.port
      && candidate.log === normalized.log
      && candidate.errlog === normalized.errlog)) {
      existing.entries.push(normalized);
    }
    return;
  }
  groups.set(key, { key, entries: [normalized] });
}

function componentService(node) {
  return {
    id: node.id,
    label: node.name,
    kind: "component",
    componentId: node.id,
    tierId: node.tierId,
    projectPath: node.projectPath ?? null,
    aliases: [],
    node,
    entries: [],
  };
}

function supportingService(root, group) {
  const [primary, ...aliases] = group.entries;
  return {
    id: `runtime:${hash(`${root}\0${group.key}`).slice(0, 24)}`,
    label: primary.name,
    kind: "supporting",
    componentId: null,
    tierId: "runtime",
    projectPath: safeRelativePath(primary.projectPath),
    aliases: [...new Set(aliases.map((entry) => entry.name).filter((name) => name !== primary.name))],
    node: null,
    entries: group.entries,
  };
}

function publicService(service) {
  return {
    id: service.id,
    label: service.label,
    kind: service.kind,
    componentId: service.componentId,
    tierId: service.tierId,
    projectPath: service.projectPath,
    aliases: service.aliases,
  };
}

async function discoverAppLogServices(root, nodes, runtimeProfile) {
  const registry = await appRegistryEntries(root);
  const projects = nodes.filter((node) => node.kind === "project").map(componentService);
  const supporting = new Map();
  for (const entry of registry) {
    if (!matchesProject(entry, nodes, runtimeProfile, registry)) {
      addSupportingEntry(supporting, entry, "registry");
    }
  }
  for (const entry of runtimeProfile?.entrypoints ?? []) {
    if (!matchesProject(entry, nodes, runtimeProfile, registry)
      && !registry.some((candidate) => candidate.name === entry?.name && candidate.port === Number(entry?.port))) {
      addSupportingEntry(supporting, entry, "entrypoint");
    }
  }
  for (const entry of runtimeProfile?.logSources ?? []) {
    if (!matchesProject(entry, nodes, runtimeProfile, registry)
      && !entry?.componentId
      && !entry?.projectPath) {
      addSupportingEntry(supporting, entry, "logSource");
    }
  }
  return {
    registry,
    services: [
      ...projects,
      ...[...supporting.values()]
        .map((group) => supportingService(root, group))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
  };
}

async function supportingLogCandidates(root, service) {
  let runDirectory;
  try {
    ({ runDirectory } = await safeRunDirectory(root));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const candidates = [];
  const pseudoNode = { id: service.id };
  for (const entry of service.entries) {
    addCandidate(
      candidates, root, pseudoNode, "stdout",
      registeredLogPath(root, runDirectory, entry.log),
      `${entry.name} stdout`,
    );
    addCandidate(
      candidates, root, pseudoNode, "stderr",
      registeredLogPath(root, runDirectory, entry.errlog),
      `${entry.name} stderr`,
    );
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(entry.name)) continue;
    for (const directory of [join(runDirectory, "logs"), runDirectory]) {
      addCandidate(candidates, root, pseudoNode, "stdout", join(directory, `${entry.name}.out.log`), `${entry.name} stdout`);
      addCandidate(candidates, root, pseudoNode, "stderr", join(directory, `${entry.name}.err.log`), `${entry.name} stderr`);
    }
    addCandidate(candidates, root, pseudoNode, "stdout", join(runDirectory, `${entry.name}.stdout.log`), `${entry.name} stdout`);
    addCandidate(candidates, root, pseudoNode, "stderr", join(runDirectory, `${entry.name}.stderr.log`), `${entry.name} stderr`);
    addCandidate(candidates, root, pseudoNode, "combined", join(runDirectory, `${entry.name}.log`), `${entry.name} output`);
  }
  return candidates;
}

async function readSupportingService(root, service, tail) {
  const sources = await selectSources(root, await supportingLogCandidates(root, service));
  const streams = await Promise.all(sources.map(async (logSource) => {
    if (!logSource.available) {
      return {
        stream: logSource.stream,
        label: logSource.label,
        available: false,
        reason: logSource.reason,
        lines: [],
        cursor: null,
        reset: false,
        notice: "",
      };
    }
    return readLogSource(root, logSource, null, tail);
  }));
  const available = streams.some((stream) => stream.available);
  return {
    ...publicService(service),
    availability: available ? "available" : "unavailable",
    reason: available
      ? ""
      : streams.find((stream) => stream.reason)?.reason
        || "No local log capture is available for this registered supporting service.",
    streams,
  };
}

async function readAppLogService(root, service, nodes, runtimeProfile, registry, tail) {
  if (service.kind === "supporting") return readSupportingService(root, service, tail);
  const result = await readComponentLogs(root, service.node, {
    nodes,
    runtimeProfile,
    registry,
    tail,
  });
  return {
    ...publicService(service),
    availability: result.availability,
    reason: result.reason,
    streams: result.streams,
  };
}

function clipLineToBytes(line, limit) {
  if (Buffer.byteLength(line) <= limit) return line;
  let low = 0;
  let high = line.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(line.slice(0, middle)) <= limit) low = middle;
    else high = middle - 1;
  }
  return line.slice(0, low);
}

function clipServiceOutput(service, budget) {
  let clipped = false;
  const streams = service.streams.map((stream) => {
    const lines = [];
    for (const line of stream.lines) {
      if (budget.lines >= APP_LOG_MAX_LINES || budget.bytes >= APP_LOG_MAX_BYTES) {
        clipped = true;
        break;
      }
      const remaining = APP_LOG_MAX_BYTES - budget.bytes;
      const bytes = Buffer.byteLength(line) + 1;
      if (bytes > remaining) {
        const prefix = clipLineToBytes(line, Math.max(0, remaining - 1));
        if (prefix) {
          lines.push(prefix);
          budget.lines += 1;
          budget.bytes += Buffer.byteLength(prefix) + 1;
        }
        clipped = true;
        break;
      }
      lines.push(line);
      budget.lines += 1;
      budget.bytes += bytes;
    }
    const notice = [
      stream.notice,
      clipped && lines.length < stream.lines.length
        ? "Some output was omitted by the application log response bounds."
        : "",
    ].filter(Boolean).join(" ");
    return { ...stream, lines, notice };
  });
  return { service: { ...service, streams }, clipped };
}

export async function readAppLogs(root, {
  nodes = [],
  runtimeProfile = null,
  serviceId = null,
  serviceIds = null,
} = {}) {
  if (serviceIds != null && (!Array.isArray(serviceIds) || serviceId != null)) {
    throw invalid("Choose serviceId or a list of serviceIds for application logs.");
  }
  const requestedIds = serviceIds ?? (serviceId == null ? [] : [serviceId]);
  if (requestedIds.length > APP_LOG_MAX_SERVICES) {
    throw invalid(`Choose at most ${APP_LOG_MAX_SERVICES} application log services.`);
  }
  if (new Set(requestedIds).size !== requestedIds.length
    || requestedIds.some((id) => typeof id !== "string" || !id || id.length > 512)) {
    throw invalid("Invalid application log service identifier.");
  }
  const { registry, services } = await discoverAppLogServices(root, nodes, runtimeProfile);
  const selected = requestedIds.map((id) => services.find((service) => service.id === id));
  if (selected.some((service) => !service)) {
    throw invalid("The selected application log service is unknown.", 404);
  }

  let catalogServices = services.slice(0, APP_LOG_MAX_CATALOG_SERVICES);
  const missingSelected = selected.filter((service) => !catalogServices.includes(service));
  if (missingSelected.length) {
    catalogServices = [...catalogServices.filter((service) => !selected.includes(service))
      .slice(0, APP_LOG_MAX_CATALOG_SERVICES - selected.length), ...selected];
  }
  const candidates = selected.length ? selected : catalogServices.slice(0, APP_LOG_MAX_SERVICES);
  const budget = { lines: 0, bytes: 0 };
  const results = [];
  let outputClipped = false;
  for (const service of candidates) {
    if (budget.lines >= APP_LOG_MAX_LINES || budget.bytes >= APP_LOG_MAX_BYTES) {
      outputClipped = true;
      break;
    }
    try {
      const read = await readAppLogService(
        root,
        service,
        nodes,
        runtimeProfile,
        registry,
        Math.min(LOG_MAX_LINES, APP_LOG_MAX_LINES - budget.lines),
      );
      const clipped = clipServiceOutput(read, budget);
      outputClipped ||= clipped.clipped;
      results.push(clipped.service);
    } catch (error) {
      if (selected.length === 1) throw error;
      results.push({
        ...publicService(service),
        availability: "error",
        reason: error instanceof Error ? error.message : String(error),
        streams: [],
      });
    }
  }

  const scopedCount = selected.length || services.length;
  const serviceClipped = scopedCount > results.length;
  const catalogClipped = services.length > catalogServices.length;
  const notices = [
    serviceClipped
      ? `Showing ${results.length} of ${scopedCount} ${selected.length ? "selected" : "discovered"} services.`
      : "",
    catalogClipped
      ? `The service filter lists ${catalogServices.length} of ${services.length} discovered services.`
      : "",
    outputClipped
      ? `Log output was limited to ${APP_LOG_MAX_LINES} lines and ${APP_LOG_MAX_BYTES} bytes.`
      : "",
  ].filter(Boolean);
  return {
    root,
    scope: {
      serviceId: selected.length === 1 ? selected[0].id : null,
      serviceIds: requestedIds,
      label: selected.length === 1 ? selected[0].label : selected.length ? `${selected.length} services` : "All services",
      groupedByService: true,
      description: "Logs are grouped by service and retain source order within each stream. No cross-service chronology is inferred.",
    },
    catalog: catalogServices.map(publicService),
    services: results,
    clipping: {
      clipped: serviceClipped || catalogClipped || outputClipped,
      services: { included: results.length, total: scopedCount, limit: APP_LOG_MAX_SERVICES },
      catalog: { included: catalogServices.length, total: services.length, limit: APP_LOG_MAX_CATALOG_SERVICES },
      lines: { included: budget.lines, limit: APP_LOG_MAX_LINES },
      bytes: { included: budget.bytes, limit: APP_LOG_MAX_BYTES },
      notices,
    },
  };
}
