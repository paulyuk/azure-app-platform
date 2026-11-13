import assert from "node:assert/strict";
import test from "node:test";
import { hasNewOutputLines, parseRuntimeOutputLine } from "./run-output.mjs";

test("runtime output recognizes explicit severity and observed prefixes conservatively", () => {
  const examples = [
    ["[agent] 2026-06-07 12:34:56,789 [ERROR] deal-finder: tool failed", "agent", "error"],
    ["[agent] 2026-06-07 12:34:56,789 [WARNING] deal-finder: slow", "agent", "warning"],
    ["[sandbox/worker_1] WARN: connection slow", "sandbox/worker_1", "warning"],
    ["[http] POST /invoke -> HTTP 503", "http", "error"],
    ["[egress] host=example.test status=422 verdict=rejected", "egress", "error"],
    ["[agent] Traceback (most recent call last):", "agent", "error"],
    ["[2026-06-07T12:34:56Z] ERROR: runtime failure", "", "error"],
    ["[ERROR] runtime failure", "", "error"],
    ["HTTP/1.1 404 Not Found", "", "error"],
    ["[agent] INFO Mentioning an ERROR in a successful response", "agent", ""],
    ["[agent] Request failed while parsing a quoted example", "agent", ""],
    ["Unlabeled runtime output", "", ""],
  ];
  for (const [line, prefix, level] of examples) {
    assert.deepEqual(parseRuntimeOutputLine(line), { prefix, level }, line);
  }
});

test("bounded snapshot changes respect duplicates without inventing line counts", () => {
  assert.equal(hasNewOutputLines([], []), false);
  assert.equal(hasNewOutputLines([], ["a"]), true);
  assert.equal(hasNewOutputLines(["a", "b"], ["b", "a"]), false);
  assert.equal(hasNewOutputLines(["a", "a"], ["a"]), false);
  assert.equal(hasNewOutputLines(["a", "a"], ["a", "a", "a"]), true);
  assert.equal(hasNewOutputLines(["a", "b"], ["b", "c"]), true);
  assert.equal(hasNewOutputLines(["same", "same"], ["same", "same"]), false);
});
