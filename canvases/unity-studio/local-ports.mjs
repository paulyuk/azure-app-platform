import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "./discovery.mjs";
import { readProcessRegistry } from "./runtime-state.mjs";

const VARIABLES = { agent: "AGENT_PORT", web: "WEB_PORT", skill: "SKILL_PORT" };
let allocationQueue = Promise.resolve();

export function parsePortSettings(text) {
  if (Buffer.byteLength(text) > 4096) throw new Error("Port settings exceed 4 KiB.");
  const settings = {};
  const ports = new Set();
  for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
    const match = /^(AGENT_PORT|WEB_PORT|SKILL_PORT)=([0-9]{4,5})$/.exec(line);
    const port = Number(match?.[2]);
    if (!match || port < 1024 || port > 65535 || settings[match[1]] || ports.has(port)) {
      throw new Error("Port settings must contain unique AGENT_PORT, WEB_PORT, or SKILL_PORT values from 1024 to 65535.");
    }
    settings[match[1]] = port;
    ports.add(port);
  }
  return settings;
}

export async function readPortSettings(root) {
  try { return parsePortSettings(await readFile(join(root, ".unity-studio/ports.env"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

export function applyPortSettings(profile, settings) {
  if (!profile) return profile;
  const replacements = new Map((profile.entrypoints ?? []).map((entry) =>
    [Number(entry.port), settings[VARIABLES[entry.name]] ?? Number(entry.port)]));
  const remap = (entries) => entries?.map((entry) => ({ ...entry, port: replacements.get(Number(entry.port)) ?? entry.port }));
  return {
    ...profile,
    entrypoints: remap(profile.entrypoints),
    startEntrypoints: remap(profile.startEntrypoints),
    reservedPorts: profile.reservedPorts?.map((port) => replacements.get(Number(port)) ?? port),
  };
}

export async function portOverrideSupport(root, entries) {
  if (!entries.length || new Set(entries.map((entry) => entry.name)).size !== entries.length
    || entries.some((entry) => !VARIABLES[entry.name])) return false;
  try {
    const [sh, ps] = await Promise.all(["dev-start.sh", "dev-start.ps1"].map((file) =>
      readFile(join(root, "scripts", file), "utf8")));
    return sh.includes("load-ports.sh") && ps.includes("load-ports.ps1")
      && entries.every((entry) => sh.includes(VARIABLES[entry.name]) && ps.includes(VARIABLES[entry.name]));
  } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function holdPort(port) {
  const servers = [];
  try {
    for (const host of ["127.0.0.1", "::1"]) {
      const server = createServer();
      try {
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen({ port, host, exclusive: true, ipv6Only: true }, resolve);
        });
        servers.push(server);
      } catch (error) {
        if (host === "::1" && ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) continue;
        throw error;
      }
    }
    return async () => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  } catch (error) {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    if (["EADDRINUSE", "EACCES"].includes(error.code)) return null;
    throw error;
  }
}

export function pickAvailablePorts(root, entries, reserved = new Set()) {
  const operation = allocationQueue.then(async () => {
    if (!await portOverrideSupport(root, entries)) {
      throw new Error("This app's start scripts do not support configurable ports for every component. Update its startup scripts before assigning ports.");
    }
    const settings = {};
    const held = [];
    const used = new Set(typeof reserved === "function" ? await reserved() : reserved);
    try {
      for (const entry of entries) {
        const start = Math.max(1024, Number(entry.port));
        if (!Number.isInteger(start) || start > 65535) throw new Error("Invalid app port.");
        let selected = false;
        for (let port = start; port <= 65535 && port < start + 1000; port += 1) {
          if (used.has(port)) continue;
          const release = await holdPort(port);
          if (!release) continue;
          held.push(release);
          used.add(port);
          settings[VARIABLES[entry.name]] = port;
          selected = true;
          break;
        }
        if (!selected) throw new Error(`No available port found for ${entry.name}; no assignments were saved.`);
      }
      const directory = join(root, ".unity-studio");
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, `ports-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, Object.entries(settings).map(([name, port]) => `${name}=${port}\n`).join(""), { mode: 0o600, flag: "wx" });
        await rename(temporary, join(directory, "ports.env"));
      } finally {
        await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
      }
      return settings;
    } finally { await Promise.all(held.map((release) => release())); }
  });
  allocationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function inspectPortProcesses(ports, { run = runCommand, platform = process.platform } = {}) {
  if (!ports.length || ports.length > 32 || ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("Choose valid app ports to inspect.");
  }
  if (platform === "win32") {
    const script = [
      "$ErrorActionPreference='Stop'",
      `$ports=@(${ports.join(",")})`,
      "$connections=@(Get-NetTCPConnection -State Listen | Where-Object { $ports -contains $_.LocalPort } | Select-Object LocalPort,OwningProcess)",
      "$processes=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,@{Name='Started';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}})",
      "@{connections=$connections;processes=$processes} | ConvertTo-Json -Depth 4 -Compress",
    ].join("; ");
    const result = await run("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script]);
    if (!result.ok) throw new Error("Cannot inspect port owners. PowerShell 7 and Get-NetTCPConnection are required.");
    const payload = JSON.parse(result.stdout);
    const array = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
    const processes = array(payload.processes).map((item) => ({
      pid: Number(item.ProcessId), parentPid: Number(item.ParentProcessId), command: item.Name, started: item.Started,
    }));
    return { processes, listeners: array(payload.connections).map((item) => ({ port: Number(item.LocalPort), pid: Number(item.OwningProcess) })) };
  }
  const [listening, table] = await Promise.all([
    run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]),
    run("ps", ["-axo", "pid=,ppid=,lstart=,comm="]),
  ]);
  if (!listening.ok && (listening.exitCode !== 1 || listening.stdout.trim() || listening.stderr.trim())) {
    throw new Error("Cannot inspect port owners. Install lsof and retry.");
  }
  if (!table.ok) throw new Error("Cannot inspect process identities; no processes will be stopped.");
  const processes = table.stdout.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.+)$/.exec(line);
    return match ? [{ pid: Number(match[1]), parentPid: Number(match[2]), started: match[3], command: match[4] }] : [];
  });
  if (!processes.length) throw new Error("Could not parse process identities; no processes will be stopped.");
  const listeners = [];
  let pid;
  for (const line of listening.stdout.split(/\r?\n/)) {
    if (/^p\d+$/.test(line)) pid = Number(line.slice(1));
    const port = Number(line.match(/^n.*:(\d+)$/)?.[1]);
    if (pid && ports.includes(port) && !listeners.some((entry) => entry.pid === pid && entry.port === port)) listeners.push({ port, pid });
  }
  return { processes, listeners };
}

function descendsFrom(pid, ancestor, processes) {
  const byPid = new Map(processes.map((item) => [item.pid, item]));
  const seen = new Set();
  while (pid && !seen.has(pid)) {
    if (pid === ancestor) return true;
    seen.add(pid);
    pid = byPid.get(pid)?.parentPid;
  }
  return false;
}

export async function managedLaunchers(roots) {
  return (await Promise.all(roots.map(async (root) => {
    const entries = await readProcessRegistry(root);
    if (!entries.length) return [];
    const times = await Promise.all(["processes.posix.tsv", "processes.json"].map(async (file) => {
      try { return (await stat(join(root, ".dev-run", file))).mtimeMs; }
      catch (error) { if (error.code === "ENOENT") return 0; throw error; }
    }));
    return entries.map((entry) => ({ ...entry, root, recordedAt: Math.max(...times) }));
  }))).flat();
}

export function makePortStopReview(ports, snapshot, launchers = [], protectedPids = [process.pid]) {
  const targets = new Map();
  for (const listener of snapshot.listeners) {
    let target = snapshot.processes.find((item) => item.pid === listener.pid);
    if (!target?.started) throw new Error("A listener exited or has no reliable process identity. Review ports again.");
    for (const launcher of launchers.filter((entry) => entry.port === listener.port)) {
      const candidate = snapshot.processes.find((item) => item.pid === launcher.pid);
      const created = Date.parse(candidate?.started);
      if (candidate && /(?:^|[/\\])(?:uv|node|npm|npm\.cmd|cmd\.exe|python[\d.]*(?:\.exe)?|func|dotnet)(?:\.exe)?$/i.test(candidate.command)
        && Number.isFinite(created) && created <= launcher.recordedAt && launcher.recordedAt - created < 600_000
        && descendsFrom(listener.pid, candidate.pid, snapshot.processes)) target = candidate;
    }
    if (target.pid <= 1 || protectedPids.some((pid) => descendsFrom(pid, target.pid, snapshot.processes))) {
      throw new Error("Refusing to stop Unity Studio, its host, or a protected system process.");
    }
    const existing = targets.get(target.pid);
    if (existing) existing.ports.push(listener.port);
    else targets.set(target.pid, { ...target, ports: [listener.port] });
  }
  const all = [...targets.values()];
  const result = all.filter((target) => !all.some((other) => other.pid !== target.pid
    && descendsFrom(target.pid, other.pid, snapshot.processes))).map((target) => ({
      ...target,
      ports: [...new Set(all.filter((item) => descendsFrom(item.pid, target.pid, snapshot.processes)).flatMap((item) => item.ports))],
    })).sort((a, b) => a.pid - b.pid);
  const identities = snapshot.listeners.map((listener) => ({
    ...listener, started: snapshot.processes.find((item) => item.pid === listener.pid)?.started,
  })).sort((a, b) => a.port - b.port || a.pid - b.pid);
  return {
    ports: [...ports].sort((a, b) => a - b),
    targets: result,
    fingerprint: createHash("sha256").update(JSON.stringify(identities)).digest("hex"),
    createdAt: Date.now(),
  };
}

export async function stopReviewedPortProcesses(review, {
  inspect = inspectPortProcesses, run = runCommand, platform = process.platform,
  signal = (pid) => process.kill(pid, "SIGTERM"), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (Date.now() - review.createdAt > 60_000) throw new Error("Port review expired. Review the current listeners again.");
  const snapshot = await inspect(review.ports);
  const current = makePortStopReview(review.ports, snapshot);
  if (current.fingerprint !== review.fingerprint) throw new Error("Port owners changed. Review them again; no processes were stopped.");
  for (const target of review.targets) {
    const live = snapshot.processes.find((item) => item.pid === target.pid);
    if (!live || live.started !== target.started || descendsFrom(process.pid, target.pid, snapshot.processes)) {
      throw new Error("A reviewed process changed or is protected. Review ports again.");
    }
  }
  for (const target of review.targets) {
    if (platform === "win32") {
      const result = await run("taskkill", ["/PID", String(target.pid), "/T", "/F"]);
      if (!result.ok) throw new Error(`Could not stop PID ${target.pid}: ${result.stderr || result.error}`);
    } else {
      const tree = [target, ...snapshot.processes.filter((item) => item.pid !== target.pid && descendsFrom(item.pid, target.pid, snapshot.processes))];
      for (const item of tree) {
        try { signal(item.pid); }
        catch (error) { if (error.code !== "ESRCH") throw new Error(`Could not stop PID ${item.pid}: ${error.message}`); }
      }
    }
  }
  const terminated = snapshot.processes.filter((item) => review.targets.some((target) =>
    descendsFrom(item.pid, target.pid, snapshot.processes)));
  let freeChecks = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await wait(300);
    const remaining = await inspect(review.ports);
    const stillRunning = terminated.some((item) => remaining.processes.some((live) =>
      live.pid === item.pid && live.started === item.started));
    freeChecks = remaining.listeners.length || stillRunning ? 0 : freeChecks + 1;
    if (freeChecks >= 3) return {
      stopped: review.targets.map((item) => item.pid), ports: review.ports,
      terminatedPids: terminated.map((item) => item.pid),
    };
  }
  throw new Error("Some ports are still occupied, reviewed processes have not exited, or a supervisor restarted an app. Review the current processes before stopping them.");
}

export async function forgetStoppedLaunchers(launchers, terminatedPids) {
  const stopped = new Set(terminatedPids);
  const roots = [...new Set(launchers.filter((entry) => stopped.has(entry.pid)).map((entry) => entry.root))];
  for (const root of roots) {
    for (const file of ["processes.posix.tsv", "processes.json"]) {
      const path = join(root, ".dev-run", file);
      let before;
      try { before = await readFile(path, "utf8"); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      const parsed = file.endsWith(".json") ? JSON.parse(before) : null;
      const after = parsed !== null
        ? JSON.stringify((Array.isArray(parsed) ? parsed : [parsed]).filter((entry) => !stopped.has(Number(entry.pid))))
        : before.split(/\r?\n/).filter((line) => !stopped.has(Number(line.split("\t")[2]))).join("\n");
      if (after === before) continue;
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, after, { mode: 0o600, flag: "wx" });
        if (await readFile(path, "utf8") !== before) throw new Error("Process registry changed during cleanup. Review the app before restarting it.");
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
      }
    }
  }
}
