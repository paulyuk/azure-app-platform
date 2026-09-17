import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_BYTES, readBuildWorkspace } from "./build-workspace.mjs";
import { runCommand } from "./discovery.mjs";

function invalid(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function parseUnifiedDiff(output) {
  const hunks = [];
  let additions = 0;
  let deletions = 0;
  let hunk, oldLine, newLine;
  for (const line of output.split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      hunk = {
        oldStart: Number(header[1]), oldCount: Number(header[2] ?? 1),
        newStart: Number(header[3]), newCount: Number(header[4] ?? 1), lines: [],
      };
      hunks.push(hunk);
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
    } else if (hunk && line.startsWith("\\ ")) {
      hunk.lines.push({ kind: "notice", oldLine: null, newLine: null, text: line.slice(2) });
    } else if (hunk && line.startsWith("+")) {
      hunk.lines.push({ kind: "added", oldLine: null, newLine: newLine++, text: line.slice(1) });
      additions++;
    } else if (hunk && line.startsWith("-")) {
      hunk.lines.push({ kind: "removed", oldLine: oldLine++, newLine: null, text: line.slice(1) });
      deletions++;
    } else if (hunk && line.startsWith(" ")) {
      hunk.lines.push({ kind: "context", oldLine: oldLine++, newLine: newLine++, text: line.slice(1) });
    } else if (hunk && line) {
      throw new Error("Could not parse the source diff. Review the file in your code editor.");
    }
  }
  for (const item of hunks) {
    if (item.lines.filter((line) => line.oldLine !== null).length !== item.oldCount
      || item.lines.filter((line) => line.newLine !== null).length !== item.newCount) {
      throw new Error("The source diff is incomplete. Review the file in your code editor.");
    }
  }
  return { additions, deletions, hunks };
}

export async function diffSource(current, proposed, { commandRunner = runCommand, temporaryRoot = tmpdir() } = {}) {
  if (current === proposed) return { additions: 0, deletions: 0, hunks: [] };
  const directory = await mkdtemp(join(temporaryRoot, "unity-build-diff-"));
  try {
    const before = join(directory, "saved");
    const after = join(directory, "draft");
    await Promise.all([
      writeFile(before, current, { mode: 0o600, flag: "wx" }),
      writeFile(after, proposed, { mode: 0o600, flag: "wx" }),
    ]);
    const result = await commandRunner("git", [
      "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--no-color", "--text", "--unified=3",
      "--output-indicator-new=+", "--output-indicator-old=-", "--output-indicator-context= ", "--", before, after,
    ], { timeout: 10_000, preserveStdout: true });
    if (!result.ok && result.exitCode !== 1) {
      throw new Error(`Could not compare the draft: ${result.stderr || result.error || "git diff failed"}`);
    }
    const diff = parseUnifiedDiff(result.stdout);
    if (!diff.hunks.length) throw new Error("The source diff did not contain the changed lines. Review the file in your code editor.");
    return diff;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function reviewBuildArtifact(root, input, options) {
  if (typeof input?.content !== "string" || Buffer.byteLength(input.content) > MAX_BYTES) {
    throw invalid("Provide source text within the 96 KiB editor limit.");
  }
  const { artifacts } = await readBuildWorkspace(root);
  const artifact = artifacts.find((item) => item.id === input.id);
  if (!artifact?.available || !artifact.editable) throw invalid("Choose an available, editable Build artifact.");
  if (input.baseSha !== artifact.sha) {
    throw invalid("The saved file changed. Discard the draft and reload before reviewing again.", 409);
  }
  return { baseSha: artifact.sha, ...await diffSource(artifact.content, input.content, options) };
}
