import assert from "node:assert/strict";
import test from "node:test";
import { createStudioNotice } from "./studio-notice.mjs";

test("review notice mounts once, merges pending props and avoids redundant updates", async () => {
  const calls = [];
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const controller = createStudioNotice({
    loadToolkit: () => pending,
    onError: message => assert.fail(message),
  });
  const element = {};
  const toolkit = {
    MessageBar() {},
    mountCanvasComponent: (host, component, props) => {
      calls.push(["mount", host, component, props]);
      return { update: props => calls.push(["update", props]), dispose: () => calls.push(["dispose"]) };
    },
  };
  controller.mount(element, { children: "Initial", intent: "info" });
  controller.update({ children: "Ready" });
  resolve(toolkit);
  await pending;
  assert.deepEqual(calls, [["mount", element, toolkit.MessageBar, { children: "Ready", intent: "info" }]]);
  controller.mount(element, { children: "Ready", intent: "info" });
  controller.update({ children: "Ready" });
  assert.equal(calls.length, 1);
  controller.update({ children: "Updated" });
  assert.deepEqual(calls[1], ["update", { children: "Updated" }]);
  controller.dispose();
  controller.dispose();
  assert.deepEqual(calls.at(-1), ["dispose"]);
  assert.equal(calls.length, 3);
  assert.throws(() => controller.update({}), /Mount the review notice/);
});

test("navigation cancels pending mounts and disposes an existing root before replacement", async () => {
  const calls = [];
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const toolkit = {
    MessageBar() {},
    mountCanvasComponent: element => {
      calls.push(["mount", element]);
      return { dispose: () => calls.push(["dispose", element]) };
    },
  };
  const controller = createStudioNotice({ loadToolkit: () => pending, onError: message => assert.fail(message) });
  controller.mount({ id: "removed" }, {});
  controller.dispose();
  resolve(toolkit);
  await pending;
  assert.deepEqual(calls, []);
  const first = { id: "first" }, second = { id: "second" };
  controller.mount(first, {});
  await Promise.resolve();
  controller.mount(second, {});
  assert.deepEqual(calls, [["mount", first], ["dispose", first]]);
  await Promise.resolve();
  assert.deepEqual(calls.at(-1), ["mount", second]);
  controller.dispose();
});

test("toolkit failures are reported without reviving a removed notice", async () => {
  const errors = [];
  const controller = createStudioNotice({
    loadToolkit: () => Promise.reject(new Error("Missing browser asset")),
    onError: message => errors.push(message),
  });
  controller.mount({}, {});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, ["Could not load the review notice: Missing browser asset"]);
  controller.mount({}, {});
  controller.dispose();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 1);
});
