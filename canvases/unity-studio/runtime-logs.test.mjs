import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { appendFile, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  APP_LOG_MAX_BYTES,
  APP_LOG_MAX_CATALOG_SERVICES,
  APP_LOG_MAX_LINES,
  APP_LOG_MAX_SERVICES,
  LOG_READ_BYTES,
  parseLogTail,
  readAppLogs,
  readComponentLogs,
  redactLogText,
} from "./runtime-logs.mjs";
import { readProcessRegistry } from "./runtime-state.mjs";

const fixtureBase = resolve("canvases/unity-studio/.runtime-logs-fixtures");

async function fixture(run) {
  const root = join(fixtureBase, randomUUID());
  await mkdir(join(root, ".dev-run/logs"), { recursive: true });
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function node(tierId, projectPath, name = projectPath.split("/").at(-1)) {
  return { id: `${tierId}:${projectPath}`, kind: "project", tierId, projectPath, name, source: "repository" };
}

test("registry metadata scopes stdout and stderr to the exact component", async () => {
  await fixture(async (root) => {
    const agent = node("agent", "src/agent", "agent");
    const web = node("web", "src/web", "web");
    await writeFile(join(root, ".dev-run/processes.json"), JSON.stringify([
      {
        name: "agent",
        port: 8088,
        pid: 101,
        log: "logs/agent.out.log",
        errlog: "logs/agent.err.log",
        projectPath: "src/agent",
      },
      {
        name: "web",
        port: 3000,
        pid: 102,
        log: "logs/web.out.log",
        errlog: "logs/web.err.log",
        projectPath: "src/web",
      },
    ]));
    await writeFile(join(root, ".dev-run/logs/agent.out.log"), "agent output\n");
    await writeFile(join(root, ".dev-run/logs/agent.err.log"), "agent warning\n");
    await writeFile(join(root, ".dev-run/logs/web.out.log"), "unrelated web output\n");
    await writeFile(join(root, ".dev-run/logs/web.err.log"), "unrelated web warning\n");

    assert.deepEqual(await readProcessRegistry(root), [
      { name: "agent", port: 8088, pid: 101 },
      { name: "web", port: 3000, pid: 102 },
    ]);
    const registry = await readProcessRegistry(root, undefined, { includeMetadata: true });
    assert.equal(registry[0].projectPath, "src/agent");
    assert.equal(registry[0].log, "logs/agent.out.log");

    const result = await readComponentLogs(root, agent, { nodes: [agent, web] });
    assert.equal(result.availability, "available");
    assert.deepEqual(result.streams.map((stream) => stream.stream), ["stdout", "stderr"]);
    assert.deepEqual(result.streams.flatMap((stream) => stream.lines), ["agent output", "agent warning"]);
    assert.doesNotMatch(JSON.stringify(result), /unrelated web/);
    assert.doesNotMatch(JSON.stringify(result), /\.dev-run|agent\.out\.log/);
  });
});

test("POSIX Dealer registry derives component names without scanning unrelated logs", async () => {
  await fixture(async (root) => {
    const inventory = node("skills", "src/skills/inventory-search");
    const tradeIn = node("skills", "src/skills/trade-in-value");
    await writeFile(join(root, ".dev-run/processes.posix.tsv"),
      "inventory-search\t7071\t101\t2026-09-15T10:00:00Z\ntrade-in-value\t7072\t102\t2026-09-15T10:00:01Z\n");
    await writeFile(join(root, ".dev-run/logs/inventory-search.out.log"), "inventory ready\n");
    await writeFile(join(root, ".dev-run/logs/inventory-search.err.log"), "");
    await writeFile(join(root, ".dev-run/logs/trade-in-value.out.log"), "trade-in ready\n");
    const result = await readComponentLogs(root, inventory, { nodes: [inventory, tradeIn] });
    assert.deepEqual(result.streams.find((stream) => stream.stream === "stdout").lines, ["inventory ready"]);
    assert.doesNotMatch(JSON.stringify(result), /trade-in ready/);
  });
});

test("Windows registry paths and PowerShell stdout names are normalized safely", async () => {
  await fixture(async (root) => {
    const web = node("web", "src/web");
    await writeFile(join(root, ".dev-run/processes.json"), JSON.stringify({
      name: "web",
      port: 3000,
      pid: 201,
      log: ".dev-run\\logs\\web.out.log",
      errlog: ".dev-run\\logs\\web.err.log",
      projectPath: "src\\web",
    }));
    await writeFile(join(root, ".dev-run/logs/web.out.log"), "windows stdout\n");
    await writeFile(join(root, ".dev-run/logs/web.err.log"), "windows stderr\n");
    let result = await readComponentLogs(root, web, { nodes: [web] });
    assert.deepEqual(result.streams.flatMap((stream) => stream.lines), ["windows stdout", "windows stderr"]);

    await rm(join(root, ".dev-run/processes.json"));
    await rm(join(root, ".dev-run/logs"), { recursive: true });
    await writeFile(join(root, ".dev-run/web.stdout.log"), "template stdout\n");
    await writeFile(join(root, ".dev-run/web.stderr.log"), "template stderr\n");
    result = await readComponentLogs(root, web, {
      nodes: [web],
      runtimeProfile: { entrypoints: [{ name: "web", port: 3000 }] },
    });
    assert.deepEqual(result.streams.flatMap((stream) => stream.lines), ["template stdout", "template stderr"]);
  });
});

test("legacy combined logs and a generic single-skill process remain supported", async () => {
  await fixture(async (root) => {
    const skill = node("skills", "src/skills/document-lookup");
    await writeFile(join(root, ".dev-run/processes.posix.tsv"), "skill\t7071\t301\n");
    await writeFile(join(root, ".dev-run/skill.log"), "function host ready\n");
    const result = await readComponentLogs(root, skill, { nodes: [skill] });
    assert.equal(result.streams.length, 1);
    assert.equal(result.streams[0].stream, "combined");
    assert.deepEqual(result.streams[0].lines, ["function host ready"]);
  });
});

test("extended POSIX registry records preserve declared log and project metadata", async () => {
  await fixture(async (root) => {
    const agent = node("agent", "src/agent");
    await writeFile(join(root, ".dev-run/processes.posix.tsv"),
      "agent\t8088\t301\tagent.out.log\tagent.err.log\tsrc/agent\n");
    await writeFile(join(root, ".dev-run/agent.out.log"), "declared stdout\n");
    await writeFile(join(root, ".dev-run/agent.err.log"), "declared stderr\n");
    const registry = await readProcessRegistry(root, undefined, { includeMetadata: true });
    assert.equal(registry[0].log, "agent.out.log");
    assert.equal(registry[0].errlog, "agent.err.log");
    assert.equal(registry[0].projectPath, "src/agent");
    const result = await readComponentLogs(root, agent, { nodes: [agent] });
    assert.deepEqual(result.streams.flatMap((stream) => stream.lines), ["declared stdout", "declared stderr"]);
  });
});

test("log symlinks and registered paths outside .dev-run are never read", async () => {
  await fixture(async (root) => {
    const agent = node("agent", "src/agent");
    await writeFile(join(root, "private.log"), "TOP SECRET\n");
    await symlink(join(root, "private.log"), join(root, ".dev-run/logs/agent.out.log"));
    await writeFile(join(root, ".dev-run/processes.json"), JSON.stringify({
      name: "agent",
      port: 8088,
      pid: 401,
      log: join(root, "private.log"),
      errlog: "logs/agent.err.log",
      projectPath: "src/agent",
    }));
    const result = await readComponentLogs(root, agent, { nodes: [agent] });
    assert.equal(result.availability, "unavailable");
    assert.ok(result.streams.some((stream) => /escapes|symlink/i.test(stream.reason)));
    assert.doesNotMatch(JSON.stringify(result), /TOP SECRET/);
  });
});

test("tail reads are bounded, redacted, and cursors return appended complete lines once", async () => {
  await fixture(async (root) => {
    const agent = node("agent", "src/agent");
    await writeFile(join(root, ".dev-run/processes.posix.tsv"), "agent\t8088\t501\n");
    const log = join(root, ".dev-run/agent.log");
    await writeFile(log, [
      "line 1",
      "line 2",
      "line 3",
      "Authorization: Bearer private-token",
      "API_KEY=private-value",
      "",
    ].join("\n"));
    let result = await readComponentLogs(root, agent, { nodes: [agent], tail: 3 });
    const stream = result.streams[0];
    assert.equal(stream.lines.length, 3);
    assert.doesNotMatch(stream.lines.join("\n"), /private/);
    assert.match(stream.lines.join("\n"), /\[REDACTED\]/);

    await appendFile(log, "next line\npartial");
    result = await readComponentLogs(root, agent, {
      nodes: [agent],
      tail: 3,
      cursors: { combined: stream.cursor },
    });
    assert.deepEqual(result.streams[0].lines, ["next line"]);
    const cursor = result.streams[0].cursor;
    await appendFile(log, " value\n");
    result = await readComponentLogs(root, agent, {
      nodes: [agent],
      tail: 3,
      cursors: { combined: cursor },
    });
    assert.deepEqual(result.streams[0].lines, ["partial value"]);
    const forged = Buffer.from(JSON.stringify({
      v: 1,
      id: "different-source",
      identity: "1:1",
      offset: 0,
      anchor: "",
      discarding: false,
    })).toString("base64url");
    await assert.rejects(readComponentLogs(root, agent, {
      nodes: [agent],
      cursors: { combined: forged },
    }), /Invalid log cursor/);

    await writeFile(log, "entry\n".repeat(LOG_READ_BYTES));
    result = await readComponentLogs(root, agent, { nodes: [agent], tail: 400 });
    assert.equal(result.streams[0].lines.length, 400);
    assert.match(result.streams[0].notice, /64 KiB/);
  });
});

test("tail bounds, cursors, and credential redaction reject unsafe values", async () => {
  assert.equal(parseLogTail(), 200);
  assert.equal(parseLogTail("400"), 400);
  assert.throws(() => parseLogTail("0"), /1 to 400/);
  assert.throws(() => parseLogTail("401"), /1 to 400/);
  for (const text of [
    "Authorization: Bearer private-token",
    'AZURE_AI_GATEWAY_API_KEY="private-token"',
    '{"client_secret":"private-token"}',
    "https://example.test?sig=private-token&other=ok",
    "AccountKey=private-token;Endpoint=test",
  ]) assert.doesNotMatch(redactLogText(text), /private-token/);
});

test("cloud-only and non-service components report explicit unavailability without fallback output", async () => {
  await fixture(async (root) => {
    await writeFile(join(root, ".dev-run/random-command.log"), "command history must not appear\n");
    for (const cloud of [
      node("gateway", "infra-ai-gateway", "AI Gateway binding"),
      node("connectors", "src/connectors/crm", "CRM connector"),
    ]) {
      const result = await readComponentLogs(root, cloud, { nodes: [cloud] });
      assert.equal(result.availability, "unavailable");
      assert.match(result.reason, /Cloud service logs are unavailable/);
      assert.match(result.reason, /No Azure log query/);
      assert.deepEqual(result.streams, []);
      assert.doesNotMatch(JSON.stringify(result), /command history/);
    }

    const sandbox = node("sandbox", "src/tools/document-validation");
    await writeFile(join(root, ".dev-run/document-validation.log"), "PRIVATE PAYLOAD\n");
    const sandboxResult = await readComponentLogs(root, sandbox, { nodes: [sandbox] });
    assert.equal(sandboxResult.availability, "unavailable");
    assert.match(sandboxResult.reason, /no separately captured local service log/);
    assert.doesNotMatch(JSON.stringify(sandboxResult), /PRIVATE PAYLOAD/);
  });
});

test("application logs include registered supporting services, alias them once, and retain unavailable components", async () => {
  await fixture(async (root) => {
    const agent = node("agent", "src/agent", "Deal agent");
    await writeFile(join(root, ".dev-run/processes.json"), JSON.stringify([
      { name: "azurite", port: 10000, pid: 901, log: "logs/azurite.out.log", errlog: "logs/azurite.err.log" },
      { name: "azurite-queue", port: 10001, pid: 901, log: "logs/azurite.out.log", errlog: "logs/azurite.err.log" },
      { name: "azurite-table", port: 10002, pid: 901, log: "logs/azurite.out.log", errlog: "logs/azurite.err.log" },
    ]));
    await writeFile(join(root, ".dev-run/logs/azurite.out.log"), "storage ready\nAPI_KEY=private-storage-key\n");
    await writeFile(join(root, ".dev-run/logs/azurite.err.log"), "");

    const result = await readAppLogs(root, { nodes: [agent] });
    assert.equal(result.scope.groupedByService, true);
    assert.match(result.scope.description, /No cross-service chronology/);
    const component = result.services.find((service) => service.componentId === agent.id);
    assert.equal(component.availability, "unavailable");
    assert.match(component.reason, /Log capture|No local service log capture/);
    const supporting = result.services.filter((service) => service.kind === "supporting");
    assert.equal(supporting.length, 1);
    assert.equal(supporting[0].label, "azurite");
    assert.deepEqual(supporting[0].aliases, ["azurite-queue", "azurite-table"]);
    assert.deepEqual(supporting[0].streams.find((stream) => stream.stream === "stdout").lines, [
      "storage ready",
      "API_KEY=[REDACTED]",
    ]);

    const targeted = await readAppLogs(root, {
      nodes: [agent],
      serviceId: supporting[0].id,
    });
    assert.equal(targeted.scope.serviceId, supporting[0].id);
    assert.deepEqual(targeted.services.map((service) => service.id), [supporting[0].id]);
    const selectedIds = [supporting[0].id, component.id];
    const multi = await readAppLogs(root, { nodes: [agent], serviceIds: selectedIds });
    assert.equal(multi.scope.serviceId, null);
    assert.deepEqual(multi.scope.serviceIds, selectedIds);
    assert.deepEqual(multi.services.map((service) => service.id), selectedIds);
    assert.equal(multi.clipping.services.total, 2);
    assert.doesNotMatch(JSON.stringify(multi), /private-storage-key/);
    for (const serviceIds of [[supporting[0].id, "unknown"], ["unknown", supporting[0].id]]) {
      await assert.rejects(readAppLogs(root, { nodes: [agent], serviceIds }), (error) => error.statusCode === 404);
    }
    for (const serviceIds of ["not-an-array", [null], [""], [supporting[0].id, supporting[0].id],
      Array.from({ length: APP_LOG_MAX_SERVICES + 1 }, (_, index) => `service-${index}`)]) {
      await assert.rejects(readAppLogs(root, { nodes: [agent], serviceIds }), (error) => error.statusCode === 400);
    }
    await assert.rejects(readAppLogs(root, { serviceId: component.id, serviceIds: selectedIds }), /Choose serviceId or/);
    await assert.rejects(
      readAppLogs(root, { nodes: [agent], serviceId: "runtime:not-real" }),
      (error) => error.statusCode === 404 && /unknown/.test(error.message),
    );
  });
});

test("application logs preserve path and symlink confinement for supporting services", async () => {
  await fixture(async (root) => {
    await writeFile(join(root, "private.log"), "PRIVATE SUPPORTING DATA\n");
    await symlink(join(root, "private.log"), join(root, ".dev-run/logs/helper.out.log"));
    await writeFile(join(root, ".dev-run/processes.json"), JSON.stringify({
      name: "helper",
      port: 9090,
      pid: 902,
      log: "logs/helper.out.log",
      errlog: join(root, "private.log"),
    }));
    const result = await readAppLogs(root);
    assert.equal(result.services.length, 1);
    assert.equal(result.services[0].availability, "unavailable");
    assert.match(result.services[0].reason, /symlink|escapes/i);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE SUPPORTING DATA/);
  });
});

test("explicit service selection stays available beyond the default catalog window", async () => {
  await fixture(async (root) => {
    const nodes = Array.from({ length: APP_LOG_MAX_CATALOG_SERVICES + 5 }, (_, index) =>
      node("agent", `src/agent-${String(index).padStart(3, "0")}`));
    const all = await readAppLogs(root, { nodes });
    assert.equal(all.catalog.length, APP_LOG_MAX_CATALOG_SERVICES);
    assert.equal(all.catalog.some((service) => service.id === nodes.at(-1).id), false);
    const serviceIds = [nodes[0].id, nodes.at(-1).id];
    const selected = await readAppLogs(root, { nodes, serviceIds });
    assert.deepEqual(selected.services.map((service) => service.id), serviceIds);
    assert.ok(serviceIds.every((id) => selected.catalog.some((service) => service.id === id)));
    assert.equal(selected.catalog.length, APP_LOG_MAX_CATALOG_SERVICES);
  });
});

test("all-service application logs enforce and disclose aggregate service, line, and byte bounds", async () => {
  await fixture(async (root) => {
    const entries = [];
    for (let index = 0; index < APP_LOG_MAX_SERVICES + 8; index += 1) {
      const name = `helper-${String(index).padStart(2, "0")}`;
      entries.push({ name, port: 12000 + index, pid: 2000 + index, log: `logs/${name}.out.log` });
      await writeFile(
        join(root, `.dev-run/logs/${name}.out.log`),
        Array.from({ length: 80 }, (_, line) => `${name} ${line} ${"x".repeat(200)}`).join("\n") + "\n",
      );
    }
    await writeFile(join(root, ".dev-run/processes.json"), JSON.stringify(entries));
    const result = await readAppLogs(root);
    const returnedLines = result.services.flatMap((service) =>
      service.streams.flatMap((stream) => stream.lines));
    const returnedBytes = returnedLines.reduce((total, line) => total + Buffer.byteLength(line) + 1, 0);
    assert.ok(result.services.length <= APP_LOG_MAX_SERVICES);
    assert.ok(returnedLines.length <= APP_LOG_MAX_LINES);
    assert.ok(returnedBytes <= APP_LOG_MAX_BYTES);
    assert.equal(result.clipping.lines.included, returnedLines.length);
    assert.equal(result.clipping.bytes.included, returnedBytes);
    assert.equal(result.clipping.clipped, true);
    assert.match(result.clipping.notices.join(" "), /Showing \d+ of \d+ discovered services/);
    assert.match(result.clipping.notices.join(" "), /limited to 1200 lines/);
    const ids = result.catalog.slice(-APP_LOG_MAX_SERVICES).map((service) => service.id);
    const multi = await readAppLogs(root, { serviceIds: ids });
    const multiLines = multi.services.flatMap((service) => service.streams.flatMap((stream) => stream.lines));
    assert.ok(multiLines.length <= APP_LOG_MAX_LINES);
    assert.ok(multiLines.reduce((bytes, line) => bytes + Buffer.byteLength(line) + 1, 0) <= APP_LOG_MAX_BYTES);
    assert.deepEqual(multi.scope.serviceIds, ids);
    assert.ok(multi.services.every((service) => ids.includes(service.id)));
    assert.match(multi.clipping.notices.join(" "), /Showing \d+ of 24 selected services/);
  });
});
