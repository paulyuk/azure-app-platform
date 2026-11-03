import assert from "node:assert/strict";
import test from "node:test";
import { createStudioNotices } from "./studio-notice.mjs";

const settle = () => new Promise(resolve => setImmediate(resolve));
const element = () => ({ nodeType: 1 });

test("shared notices keep keyed roots and latest callbacks without redundant renders", async () => {
  const calls = [], actions = [];
  const handles = new Map();
  const toolkit = {
    MessageBar() {},
    mountCanvasComponent(host, component, props) {
      calls.push(["mount", host]);
      const handle = {
        props,
        update(next) { calls.push(["update", host, next]); this.props = { ...this.props, ...next }; },
        dispose() { calls.push(["dispose", host]); },
      };
      handles.set(host, handle);
      return handle;
    },
  };
  const { renderNotice, clearNotice, dispose } = createStudioNotices({
    loadToolkit: async () => toolkit, onError: message => assert.fail(message),
  });
  const first = element(), second = element();
  renderNotice(first, { children: "Initial", intent: "info", onClick: () => actions.push("stale") });
  renderNotice(first, { children: "Ready", onClick: () => actions.push("current") });
  renderNotice(second, { children: "Independent" });
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(handles.get(first).props.children, "Ready");
  handles.get(first).props.onClick();
  assert.deepEqual(actions, ["current"]);
  for (let index = 0; index < 20; index++) {
    renderNotice(first, { children: "Ready", intent: "info", onClick: () => actions.push("latest") });
  }
  assert.equal(calls.length, 2, "Callback refreshes must not re-render or re-announce unchanged content");
  handles.get(first).props.onClick();
  assert.deepEqual(actions, ["current", "latest"]);
  renderNotice(first, { children: "Updated" });
  assert.deepEqual(calls.at(-1), ["update", first, { children: "Updated" }]);
  renderNotice(first, { onClick: undefined, children: "Updated" });
  assert.equal(handles.get(first).props.onClick, undefined);
  clearNotice(first);
  clearNotice(first);
  assert.equal(calls.filter(([kind]) => kind === "dispose").length, 1);
  assert.equal(handles.get(second).props.children, "Independent");
  renderNotice(first, { children: "Reused" });
  await settle();
  assert.equal(handles.get(first).props.children, "Reused");
  renderNotice(first, { children: "" });
  dispose();
  dispose();
  assert.equal(calls.filter(([kind]) => kind === "dispose").length, 3);
  assert.throws(() => renderNotice({}, { children: "Invalid" }), /mount element/);
});

test("clear cancels pending roots and reuse mounts only the newest props", async () => {
  const calls = [];
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const toolkit = {
    MessageBar() {},
    mountCanvasComponent: (host, component, props) => {
      calls.push(["mount", host, props]);
      return { dispose: () => calls.push(["dispose", host]) };
    },
  };
  const notices = createStudioNotices({ loadToolkit: () => pending, onError: message => assert.fail(message) });
  const host = element();
  notices.renderNotice(host, { children: "Removed" });
  notices.clearNotice(host);
  notices.renderNotice(host, { children: "Current" });
  resolve(toolkit);
  await settle();
  assert.deepEqual(calls, [["mount", host, { children: "Current" }]]);
  notices.dispose();
});

test("sync and async toolkit failures report explicitly and allow safe retry", async () => {
  for (const synchronous of [true, false]) {
    const errors = [];
    let fail = true, mounts = 0;
    const notices = createStudioNotices({
      loadToolkit() {
        if (fail) {
          if (synchronous) throw new Error("Missing browser asset");
          return Promise.reject(new Error("Missing browser asset"));
        }
        return { MessageBar() {}, mountCanvasComponent() { mounts++; return { dispose() {} }; } };
      },
      onError: message => errors.push(message),
    });

    const host = element();
    notices.renderNotice(host, { children: "Notice" });
    await settle();
    assert.deepEqual(errors, ["Could not load the review notice: Missing browser asset"]);
    fail = false;
    notices.renderNotice(host, { children: "Notice" });
    await settle();
    assert.equal(mounts, 1);
    notices.dispose();
  }
});

test("the shared component owner handles removed mounts, component changes and render retry", async () => {
  const calls = [], errors = [];
  let resolve, broken = false;
  const toolkit = {
    Navigation() {}, MessageBar() {},
    mountCanvasComponent(host, component, props) {
      calls.push(["mount", component, props]);
      if (broken) throw new Error("Render failed");
      return {
        update() { if (broken) throw new Error("Update failed"); },
        dispose() { calls.push(["dispose", component]); },
      };
    },
  };
  let pending = new Promise(done => { resolve = done; });
  const owner = createStudioNotices({ loadToolkit: () => pending, onError: message => errors.push(message) });
  const removed = { nodeType: 1, isConnected: true };
  owner.renderComponent(removed, "Navigation", { current: "build" }, "workspace navigation");
  removed.isConnected = false;
  resolve(toolkit);
  await settle();
  assert.deepEqual(calls, [], "An asynchronously removed mount must not be revived");
  pending = Promise.resolve(toolkit);
  const host = element();
  owner.renderComponent(host, "Navigation", { current: "build" }, "workspace navigation");
  await settle();
  owner.renderNotice(host, { children: "Different component" });
  await settle();
  assert.equal(calls[1][0], "dispose");
  assert.equal(calls[2][1], toolkit.MessageBar);
  broken = true;
  owner.renderNotice(host, { children: "Updated" });
  assert.deepEqual(errors, ["Could not load the review notice: Update failed"]);
  owner.renderComponent(host, "Navigation", { current: "observe" }, "workspace navigation");
  await settle();
  assert.equal(errors.at(-1), "Could not load the workspace navigation: Render failed");
  broken = false;
  owner.renderComponent(host, "Navigation", { current: "manage" }, "workspace navigation");
  await settle();
  assert.equal(calls.at(-1)[2].current, "manage");
  owner.dispose();
});
