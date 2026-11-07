import assert from "node:assert/strict";
import test from "node:test";
import { getAppPathLabels } from "./studio-open-apps.mjs";

test("app paths show only distinct folder suffixes", () => {
  const paths = [
    "C:\\Users\\developer\\.copilot\\worktrees\\customer-portal",
    "C:\\projects\\customer-app\\source",
    "C:\\projects\\internal-app\\source",
  ];
  assert.deepEqual([...getAppPathLabels(paths).values()], [
    "customer-portal", "customer-app\\source", "internal-app\\source",
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
  assert.deepEqual([...getAppPathLabels(paths).values()], ["Source", "source", "/workspace/shared", "/shared"]);
});

test("root paths and repeated paths retain their exact identity", () => {
  const paths = ["/", "C:\\", "C:\\projects\\app", "C:\\projects\\app"];
  assert.deepEqual([...getAppPathLabels(paths).entries()], [
    ["/", "/"], ["C:\\", "C:\\"], ["C:\\projects\\app", "C:\\projects\\app"],
  ]);
  assert.equal(getAppPathLabels([]).size, 0);
});
