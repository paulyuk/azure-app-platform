import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function redactActivityText(value) {
  return String(value ?? "")
    .replace(/\bBearer\s+[^\s"'<>]+/gi, "Bearer REDACTED")
    .replace(/([?&](?:sig|code|key|token|api[-_]?key)=)[^&\s"'<>]+/gi, "$1REDACTED")
    .replace(/((?:[\w-]*(?:api[_-]?key|password|secret|connection[_-]?string|access[_-]?token)|authorization|ocp-apim-subscription-key|x-functions-key)["']?\s*[:=]\s*["']?)[^"'\r\n,;}]+/gi, "$1REDACTED");
}

export function createCommandActivity(filePath) {
  let records;
  let pending = Promise.resolve();
  async function load() {
    if (records) return;
    try {
      const saved = JSON.parse(await readFile(filePath, "utf8"));
      if (!Array.isArray(saved)) throw new Error("Invalid command activity history.");
      records = saved.slice(0, 60).map((record) => {
        if (record.status === "running") {
          return { ...record, status: "unknown", note: "Provider reloaded; review command output for completion." };
        }
        if (record.kind === "az" && record.label === "Azure discovery" &&
            record.status === "failed" && record.note === "Cancelled" && !record.error) {
          return { ...record, status: "cancelled" };
        }
        return record;
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      records = [];
    }
  }
  function update(operation) {
    const next = pending.then(async () => {
      await load();
      const result = operation();
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
      await rename(temporary, filePath);
      return result;
    });
    pending = next.catch(() => {});
    return next;
  }
  return {
    async start({ kind, label, command }) {
      const record = {
        id: randomUUID(), kind, label: redactActivityText(label).slice(0, 500),
        command: redactActivityText(command).slice(0, 8000),
        startedAt: Date.now(), status: "running", durationMs: null, note: "", error: "",
      };
      await update(() => { records.unshift(record); records.length = Math.min(records.length, 60); });
      return record.id;
    },
    async finish(id, { ok, cancelled = false, note = "", error = "" }) {
      await update(() => {
        const record = records.find((item) => item.id === id);
        if (!record) return;
        Object.assign(record, {
          status: cancelled ? "cancelled" : ok ? "succeeded" : "failed", durationMs: Date.now() - record.startedAt,
          note: redactActivityText(note).slice(0, 1000),
          error: redactActivityText(error).slice(0, 4000),
        });
      });
    },
    async list() {
      await pending;
      await load();
      return records.map((record) => ({ ...record }));
    },
  };
}
