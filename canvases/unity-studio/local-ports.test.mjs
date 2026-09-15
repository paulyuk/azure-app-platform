import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyPortSettings, forgetStoppedLaunchers, inspectPortProcesses, makePortStopReview,
  parsePortSettings, pickAvailablePorts, readPortSettings, reservedPortsForApps, stopReviewedPortProcesses,
} from "./local-ports.mjs";
import { materializePortLoaders } from "./template-materializer.mjs";
import { runCommand } from "./discovery.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "unity-ports-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await materializePortLoaders(root);
  for (const file of ["dev-start.sh", "dev-start.ps1"]) {
    await writeFile(join(root, "scripts", file), [
      "AGENT_PORT WEB_PORT SKILL_PORT INVENTORY_SEARCH_PORT TRADE_IN_VALUE_PORT RATE_SHEET_PORT DEAL_DOC_PORT",
      "AZURITE_BLOB_PORT AZURITE_QUEUE_PORT AZURITE_TABLE_PORT load-ports.sh load-ports.ps1",
    ].join(" "));
  }
  return root;
}

const snapshot = {
  processes: [
    { pid: 510001, parentPid: 1, started: "2026-01-01T00:00:00Z", command: "/usr/bin/node" },
    { pid: 510002, parentPid: 510001, started: "2026-01-01T00:00:01Z", command: "/usr/bin/node" },
  ],
  listeners: [{ port: 8088, pid: 510002 }],
};

test("settings reject executable content, duplicate ports, invalid ranges and oversize files", () => {
  assert.deepEqual(parsePortSettings("AGENT_PORT=8090\r\nWEB_PORT=3001\n"), { AGENT_PORT: 8090, WEB_PORT: 3001 });
  for (const text of ["PORT=8088", "AGENT_PORT=80", "AGENT_PORT=65536", "AGENT_PORT=$(id)",
    "AGENT_PORT=8088\nWEB_PORT=8088", "AGENT_PORT=8088\nAGENT_PORT=8089", " ".repeat(4097)]) {
    assert.throws(() => parsePortSettings(text), /Port settings/);
  }
  assert.deepEqual(parsePortSettings("INVENTORY_SEARCH_PORT=7100\nAZURITE_BLOB_PORT=10100\n"), {
    INVENTORY_SEARCH_PORT: 7100, AZURITE_BLOB_PORT: 10100,
  });
});

test("profile mapping preserves metadata and remaps every runtime surface", () => {
  const profile = {
    start: "./scripts/dev-start.sh", startArgs: ["--skip-skill"],
    entrypoints: [{ name: "agent", port: 8088 }, { name: "web", port: 3000 }],
    startEntrypoints: [{ name: "agent", port: 8088 }], reservedPorts: [8088, 3000],
  };
  const mapped = applyPortSettings(profile, { AGENT_PORT: 8089, WEB_PORT: 3001 });
  assert.deepEqual(mapped.reservedPorts, [8089, 3001]);
  assert.equal(mapped.startEntrypoints[0].port, 8089);
  assert.equal(mapped.entrypoints[1].port, 3001);
  assert.deepEqual(mapped.startArgs, profile.startArgs);
  assert.equal(profile.entrypoints[0].port, 8088);
});

test("allocation avoids live listeners, reserved ports and concurrent saved assignments", async (t) => {
  const root = await fixture(t);
  const second = await fixture(t);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const entrypoints = [{ name: "agent", port }, { name: "web", port }];
  const reserved = new Set([port + 1]);
  const [first, next] = await Promise.all([
    pickAvailablePorts(root, entrypoints, reserved),
    pickAvailablePorts(second, entrypoints, async () => new Set([...reserved, ...Object.values(await readPortSettings(root))])),
  ]);
  assert.equal(new Set([...Object.values(first), ...Object.values(next)]).size, 4);
  assert.ok([...Object.values(first), ...Object.values(next)].every((selected) => selected > port + 1));
  assert.deepEqual(await readPortSettings(root), first);
  await assert.rejects(pickAvailablePorts(root, [{ name: "unknown", port }]), /do not support/);
  await assert.rejects(pickAvailablePorts(root, [{ name: "agent", port }, { name: "agent", port }]), /do not support/);
});

test("POSIX and PowerShell load saved settings as data and reject invalid input", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, ".unity-studio"));
  const path = join(root, ".unity-studio/ports.env");
  await writeFile(path, "AGENT_PORT=8095\nWEB_PORT=3015\nINVENTORY_SEARCH_PORT=7101\nAZURITE_BLOB_PORT=10101\n");
  const sh = ["-c", '. "$1/scripts/load-ports.sh"; load_unity_ports "$1" || exit; printf "%s:%s:%s:%s" "$AGENT_PORT" "$WEB_PORT" "$INVENTORY_SEARCH_PORT" "$AZURITE_BLOB_PORT"', "ports", root];
  const ps = ["-NoProfile", "-NonInteractive", "-Command",
    `. '${root}/scripts/load-ports.ps1'; Import-UnityPorts '${root}'; Write-Output "$env:AGENT_PORT\`:$env:WEB_PORT\`:$env:INVENTORY_SEARCH_PORT\`:$env:AZURITE_BLOB_PORT"`];
  for (const [command, args] of [["bash", sh], ["pwsh", ps]]) {
    const result = await runCommand(command, args);
    assert.equal(result.ok, true, result.stderr || result.error);
    assert.equal(result.stdout, "8095:3015:7101:10101");
  }
  await writeFile(path, "AGENT_PORT=$(touch /tmp/not-executed)\n");
  for (const [command, args] of [["bash", sh], ["pwsh", ps]]) {
    const result = await runCommand(command, args);
    assert.equal(result.ok, false);
  }
});

test("saved sibling reservations override defaults without changing the older app", async (t) => {
  const root = await fixture(t);
  const other = await fixture(t);
  await mkdir(join(other, ".unity-studio"));
  await writeFile(join(other, ".unity-studio/app.json"), JSON.stringify({
    runtime: { entrypoints: [{ name: "agent", port: 8088 }], reservedPorts: [8088] },
  }));
  await writeFile(join(other, ".unity-studio/ports.env"), "AGENT_PORT=8199\n");
  assert.deepEqual(await reservedPortsForApps([root, other], root), new Set([8199]));
  assert.equal(await readFile(join(other, ".unity-studio/ports.env"), "utf8"), "AGENT_PORT=8199\n");
  await writeFile(join(other, ".unity-studio/ports.env"), "AGENT_PORT=invalid\n");
  await assert.rejects(reservedPortsForApps([root, other], root), /Port settings/);
});

test("allocation rechecks saved reservations after holding a candidate port", async (t) => {
  const root = await fixture(t);
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  let reads = 0;
  const settings = await pickAvailablePorts(root, [{ name: "agent", port }], async () => {
    reads += 1;
    return reads === 1 ? new Set() : new Set([port]);
  });
  assert.ok(reads >= 2);
  assert.notEqual(settings.AGENT_PORT, port);
});

test("review protects host ancestors and identifies managed launcher trees", () => {
  assert.throws(() => makePortStopReview([8088], snapshot, [], [510002]), /Refusing/);
  const review = makePortStopReview([8088], snapshot, [{
    pid: 510001, port: 8088, recordedAt: Date.parse("2026-01-01T00:00:02Z"),
  }]);
  assert.equal(review.targets[0].pid, 510001);
  assert.deepEqual(review.targets[0].ports, [8088]);
});

test("confirmation rejects expired reviews, reused PIDs and changed listener ownership without signals", async () => {
  const review = makePortStopReview([8088], snapshot);
  const changed = structuredClone(snapshot);
  changed.processes[1].started = "2026-01-02T00:00:01Z";
  let signals = 0;
  const signal = () => { signals++; };
  await assert.rejects(stopReviewedPortProcesses({ ...review, createdAt: Date.now() - 61_000 }, { signal }), /expired/);
  await assert.rejects(stopReviewedPortProcesses(review, { inspect: async () => changed, signal }), /owners changed/);
  assert.equal(signals, 0);
});

test("stop includes reviewed children and reports denied or respawned processes", async () => {
  const review = makePortStopReview([8088], snapshot, [{ pid: 510001, port: 8088, recordedAt: Date.parse("2026-01-01T00:00:02Z") }]);
  const signals = [];
  let checks = 0;
  const inspect = async () => checks++ ? { processes: [], listeners: [] } : snapshot;
  assert.deepEqual((await stopReviewedPortProcesses(review, { inspect, signal: (pid) => signals.push(pid), wait: async () => {} })).stopped, [510001]);
  assert.deepEqual(signals, [510001, 510002]);
  await assert.rejects(stopReviewedPortProcesses(review, {
    inspect: async () => snapshot, signal: () => { throw new Error("EPERM"); },
  }), /Could not stop.*EPERM/);
  await assert.rejects(stopReviewedPortProcesses(review, {
    inspect: async () => snapshot, signal: () => {}, wait: async () => {},
  }), /still occupied/);
});

test("Windows inspection normalizes singleton results and uses reviewed taskkill IDs only", async () => {
  const inspected = await inspectPortProcesses([8088], {
    platform: "win32", run: async () => ({ ok: true, stdout: JSON.stringify({
      processes: { ProcessId: 510002, ParentProcessId: 1, Started: snapshot.processes[1].started, Name: "node.exe" },
      connections: { LocalPort: 8088, OwningProcess: 510002 },
    }) }),
  });
  assert.equal(inspected.listeners[0].pid, 510002);
  const review = makePortStopReview([8088], inspected);
  const commands = [];
  let checks = 0;
  await stopReviewedPortProcesses(review, {
    platform: "win32", inspect: async () => checks++ ? { listeners: [], processes: [] } : inspected,
    run: async (...args) => { commands.push(args); return { ok: true }; }, wait: async () => {},
  });
  assert.deepEqual(commands, [["taskkill", ["/PID", "510002", "/T", "/F"]]]);
});

test("POSIX distinguishes an empty listener table from inspection failure", async () => {
  const processTable = " 510002 1 Thu Jan 1 00:00:01 2026 /usr/bin/node";
  const run = async (command) => command === "ps" ? { ok: true, stdout: processTable }
    : { ok: false, stdout: "", stderr: "", exitCode: 1 };
  assert.equal((await inspectPortProcesses([8088], { run, platform: "darwin" })).listeners.length, 0);
  await assert.rejects(inspectPortProcesses([8088], {
    platform: "darwin", run: async (command) => command === "ps" ? run(command)
      : { ok: false, stdout: "", stderr: "", error: "spawn lsof ENOENT" },
  }), /Install lsof/);
});

test("cleanup drops stopped launcher records without removing another component", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, ".dev-run"));
  const path = join(root, ".dev-run/processes.posix.tsv");
  await writeFile(path, "agent\t8088\t510001\nweb\t3000\t510003\n");
  await forgetStoppedLaunchers([{ root, pid: 510001 }], [510001, 510002]);
  assert.equal(await readFile(path, "utf8"), "web\t3000\t510003\n");
});

test("real disposable listener is stopped while an unrelated listener remains alive", async (t) => {
  const child = spawn(process.execPath, ["--input-type=module", "-e",
    'import {createServer} from "node:net"; const s=createServer(); s.listen(0,"127.0.0.1",()=>console.log(s.address().port));'],
  { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); });
  const [output] = await once(child.stdout, "data");
  const port = Number(String(output).trim());
  const other = createServer();
  await new Promise((resolve) => other.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => other.close(resolve)));
  const before = await inspectPortProcesses([port]);
  const review = makePortStopReview([port], before);
  assert.equal(review.targets[0].pid, child.pid);
  await stopReviewedPortProcesses(review);
  assert.equal((await inspectPortProcesses([port])).listeners.length, 0);
  assert.equal(other.listening, true);
});
