import assert from "node:assert/strict";
import test from "node:test";
import { mountStudioHome } from "./studio-home.mjs";

test("Unity home composes public toolkit components and retains all journey callbacks", () => {
  const tree = [];
  const toolkit = Object.fromEntries(["WorkItem", "Button", "ActionCard", "SectionHeader", "SymbolIcon"]
    .map(name => [name, name]));
  toolkit.createElement = (type, props, ...children) => {
    const node = { type, props: props || {}, children };
    tree.push(node);
    return node;
  };
  const handle = { dispose() {} };
  const element = {};
  toolkit.mountCanvasComponent = (mount, component) => {
    assert.equal(mount, element);
    component();
    return handle;
  };
  const calls = [];
  assert.equal(mountStudioHome(element, {
    toolkit, onCreate: () => calls.push("create"),
    onOpen: () => calls.push("open"), onAssemble: () => calls.push("assemble"),
  }), handle);
  const secondary = tree.filter(node => node.type === "ActionCard");
  assert.deepEqual(secondary.map(node => node.props.title), ["Create a new app", "Open an app", "Assemble existing pieces"]);
  for (const node of secondary) {
    assert.equal(node.props.joined, undefined);
    assert.equal(node.props.compact, true);
    assert.equal(node.props.type, "button");
    node.props.onClick();
  }
  assert.deepEqual(calls, ["create", "open", "assemble"]);
  assert.equal(tree.filter(node => node.type === "h1").length, 1);
});

test("recent apps distinguish not-loaded, empty, failed and recorded rows without new discovery", () => {
  for (const [recentApps, recentError, expected] of [
    [null, null, "Recent apps have not been loaded."],
    [[], null, "No recently viewed apps were found."],
    [null, "Unavailable", "Recent apps could not be refreshed."],
    [[{ name: "Synthetic app", path: "projects/synthetic", lastOpenedAt: "2026-10-29T12:00:00Z" }], null, "Synthetic app"],
  ]) {
    const tree = [];
    const toolkit = Object.fromEntries(["ActionCard", "SectionHeader", "WorkItem", "Button", "SymbolIcon"].map(name => [name, name]));
    toolkit.createElement = (type, props, ...children) => {
      const node = { type, props: props || {}, children };
      tree.push(node);
      return node;
    };
    toolkit.mountCanvasComponent = (_, component) => component();
    const opened = [];
    mountStudioHome({}, { toolkit, recentApps, recentError, onOpenRecent: path => opened.push(path) });
    assert.ok(JSON.stringify(tree).includes(expected));
    const recent = tree.find(node => node.type === "WorkItem");
    if (recent) {
      recent.props.actions.props.onClick();
      assert.deepEqual(opened, ["projects/synthetic"]);
      assert.equal(recent.props.metadata.props.dateTime, "2026-10-29T12:00:00Z");
    }
  }
});
