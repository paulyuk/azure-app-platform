import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { allowsActiveLifecycle, cancelStartupProcess } from "./startup-cancellation.mjs";

function startup() {
  return Object.assign(new EventEmitter(), { pid: 424242, exitCode: null, signalCode: null });
}

test("only local startup may be interrupted by Stop", () => {
  for (const state of ["starting", "configuring", "deploying", "provisioning", "stopping"]) {
    assert.equal(allowsActiveLifecycle("stop-local", { state }), state === "starting");
    assert.equal(allowsActiveLifecycle("run-local", { state }), true);
    assert.equal(allowsActiveLifecycle("configure-gateway", { state }), false);
  }
});

test("cancel startup signals its owned process group and waits for launcher exit", async () => {
  const child = startup();
  let signalled;
  const cancellation = cancelStartupProcess(child, {
    platform: "darwin", signal: (pid) => { signalled = pid; },
  });
  assert.equal(signalled, -child.pid);
  child.signalCode = "SIGTERM";
  child.emit("exit", null, "SIGTERM");
  assert.equal(await cancellation, true);
  assert.equal(child.listenerCount("exit"), 0);
});

test("exited or missing startup launchers are never signalled", async () => {
  for (const child of [null, { ...startup(), exitCode: 0 }, { ...startup(), signalCode: "SIGTERM" }]) {
    assert.equal(await cancelStartupProcess(child, {
      signal: () => assert.fail("Must not signal an exited or untracked PID"),
    }), false);
  }
  await assert.rejects(cancelStartupProcess({ ...startup(), pid: 1 }), /identity/);
});

test("Windows cancellation targets the recorded launcher and its children", async () => {
  const child = startup();
  assert.equal(await cancelStartupProcess(child, {
    platform: "win32",
    run: async (command, args) => {
      assert.equal(command, "taskkill");
      assert.deepEqual(args, ["/PID", String(child.pid), "/T", "/F"]);
      child.exitCode = 1;
      child.emit("exit", 1, null);
      return { ok: true };
    },
  }), true);
});

test("cancellation errors and hung launchers fail visibly without leaking listeners", async () => {
  const child = startup();
  await assert.rejects(cancelStartupProcess(child, {
    platform: "darwin", timeoutMs: 5, signal: () => {},
  }), /has not exited/);
  assert.equal(child.listenerCount("exit"), 0);
  await assert.rejects(cancelStartupProcess(child, {
    platform: "win32", run: async () => ({ ok: false, stderr: "Access denied" }),
  }), /Access denied/);
  assert.equal(child.listenerCount("exit"), 0);
});
