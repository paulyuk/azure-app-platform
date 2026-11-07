import assert from "node:assert/strict";
import test from "node:test";
import { getAppOpenedLabel, getAppPathLabels } from "./studio-open-apps.mjs";

test("app paths show only distinct folder suffixes", () => {
  const paths = [
    "C:\\Users\\developer\\.copilot\\worktrees\\customer-portal",
    "C:\\projects\\customer-app\\source",
    "C:\\projects\\internal-app\\source",
  ];
  assert.deepEqual([...getAppPathLabels(paths).values()], [
    "worktrees\\customer-portal", "customer-app\\source", "internal-app\\source",
  ]);
});

test("app paths expand shared suffixes across Windows drives and UNC shares", () => {
  const paths = ["C:\\apps\\source", "D:\\apps\\source", "\\\\host\\share\\apps\\source"];
  assert.deepEqual([...getAppPathLabels(paths).values()], [
    "C:\\apps\\source", "D:\\apps\\source", "share\\apps\\source",
  ]);
});

test("Windows app path comparisons ignore case and handle mixed separators", () => {
  const paths = ["C:\\customer\\Source\\", "D:/internal/source/"];
  assert.deepEqual([...getAppPathLabels(paths).values()], ["customer\\Source", "internal/source"]);
  assert.deepEqual([...getAppPathLabels(["C:/customer/Source", "D:/internal/source"]).values()], [
    "customer/Source", "internal/source",
  ]);
});

test("POSIX app path suffixes preserve case and root distinctions", () => {
  const paths = ["/projects/Source", "/projects/source", "/workspace/shared", "/shared"];
  assert.deepEqual([...getAppPathLabels(paths).values()], ["/projects/Source", "/projects/source", "/workspace/shared", "/shared"]);
});

test("root paths and repeated paths retain their exact identity", () => {
  const paths = ["/", "C:\\", "C:\\projects\\app", "C:\\projects\\app"];
  assert.deepEqual([...getAppPathLabels(paths).entries()], [
    ["/", "/"], ["C:\\", "C:\\"], ["C:\\projects\\app", "C:\\projects\\app"],
  ]);
  assert.equal(getAppPathLabels([]).size, 0);
});

test("app path labels always include the parent and app folder when available", () => {
  assert.deepEqual([...getAppPathLabels(["C:\\projects\\app-name", "/projects/app-name"]).values()],
    ["C:\\projects\\app-name", "/projects/app-name"]);
  assert.equal(getAppPathLabels(["C:\\projects\\app-name"]).get("C:\\projects\\app-name"), "projects\\app-name");
});

test("opening times use bounded compact relative labels and omit missing timestamps", () => {
  const now = Date.parse("2026-11-07T18:00:00Z");
  const ago = minutes => new Date(now - minutes * 60000).toISOString();
  for (const value of [undefined, null, "", "invalid"]) assert.equal(getAppOpenedLabel(value, now), "");
  assert.equal(getAppOpenedLabel(ago(-5), now), "opened just now");
  assert.equal(getAppOpenedLabel(ago(0), now), "opened just now");
  assert.equal(getAppOpenedLabel(ago(5), now), "opened 5m ago");
  assert.equal(getAppOpenedLabel(ago(59), now), "opened 59m ago");
  assert.equal(getAppOpenedLabel(ago(60), now), "opened 1h ago");
  assert.equal(getAppOpenedLabel(ago(1439), now), "opened 23h ago");
  assert.equal(getAppOpenedLabel(ago(1440), now), "opened 1d ago");
});
