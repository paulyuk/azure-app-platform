import assert from "node:assert/strict";
import test from "node:test";
import { createStudioAppList, getAppOpenedLabel, getAppPathLabels } from "./studio-app-list.mjs";

function listFixture() {
  const tree = [], effects = [];
  let now;
  const toolkit = {
    Fragment: "Fragment", MenuButton: "MenuButton", MenuItem: "MenuItem", Tooltip: "Tooltip",
    createElement(type, props, ...children) {
      const node = { type, props: props || {}, children };
      tree.push(node);
      return node;
    },
    useState(initial) { now ??= initial; return [now, value => { now = value; }]; },
    useEffect(effect) { if (!effects.length) effects.push(effect); },
    useRef() { return { current: "row-trigger" }; },
  };
  // The runtime injects these functions into an unrelated browser scope.
  const factory = (0, eval)("(" + createStudioAppList.toString() + ")");
  const AppList = factory(toolkit, {
    getAppPathLabels: (0, eval)("(" + getAppPathLabels.toString() + ")"),
    getAppOpenedLabel: (0, eval)("(" + getAppOpenedLabel.toString() + ")"),
  });
  return {
    tree, effects,
    render(props) {
      tree.length = 0;
      AppList(props);
      for (const row of tree.filter(node => typeof node.type === "function")) row.type(row.props);
    },
  };
}

test("shared app rows keep one project folder, full-path links, tooltip and toolkit actions after filtering", () => {
  const app = { name: "source", path: "C:\\east\\shared\\source", lastOpenedAt: null };
  const inventory = [app, { name: "source", path: "D:\\west\\shared\\source" }];
  const calls = [];
  const fixture = listFixture();
  for (const itemAttribute of ["data-existing-app", "data-recent-app"]) {
    fixture.render({
      apps: [app], inventory, itemAttribute, appHref: path => "/app-map?root=" + encodeURIComponent(path),
      onOpen: path => calls.push(["open", path]),
      onCopyPath: path => calls.push(["copy", path]),
      onRename: (...args) => calls.push(["rename", ...args]),
      onDelete: (...args) => calls.push(["delete", ...args]),
    });
    const { tree } = fixture;
    const link = tree.find(node => node.type === "a");
    assert.equal(link.props[itemAttribute], app.path);
    assert.equal(link.props["aria-label"], app.name);
    assert.equal(link.props.tabIndex, 0, "Enabled links remain in WebKit's keyboard sequence");
    assert.equal(link.props.href, "/app-map?root=" + encodeURIComponent(app.path));
    assert.equal(tree.find(node => node.props.className === "app-list-path").children[0], "source");
    assert.equal(tree.find(node => node.type === "Tooltip").props.content.children[0], app.path);
    assert.equal(tree.some(node => node.type === "time"), false);
    const trigger = tree.find(node => node.type === "MenuButton").props.button;
    assert.equal(trigger["aria-label"], "More actions for source");
    assert.equal(trigger["data-app-actions"], app.path);
    let prevented = false;
    link.props.onClick({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    for (const item of tree.filter(node => node.type === "MenuItem")) item.props.onClick();
  }
  assert.deepEqual(calls, Array(2).fill([
    ["open", app.path], ["copy", app.path],
    ["rename", app.path, app.name, "row-trigger"], ["delete", app.path, app.name, "row-trigger"],
  ]).flat());
  fixture.render({ apps: [app], appHref: () => "/app-map", disabled: true });
  const link = fixture.tree.find(node => node.type === "a").props;
  assert.equal(link["aria-disabled"], true);
  assert.equal(link.tabIndex, -1);
  assert.equal(fixture.tree.find(node => node.type === "MenuButton").props.button.disabled, true);
  let prevented = false;
  link.onClick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, "Busy links cannot navigate");
});

test("shared rows show root-only paths intact instead of splitting them into folder bullets", () => {
  const fixture = listFixture();
  for (const path of ["/", "C:\\", "C:/", "\\\\host\\share\\", "//host/share/"]) {
    fixture.render({ apps: [{ name: "Root app", path }], appHref: root => "/app-map?root=" + encodeURIComponent(root) });
    const { tree } = fixture;
    assert.equal(tree.find(node => node.props.className === "app-list-path").children[0], path);
    assert.equal(tree.find(node => node.type === "Tooltip").props.content.children[0], path);
    assert.equal(tree.find(node => node.type === "a").props.href, "/app-map?root=" + encodeURIComponent(path));
  }
});

test("cached app links stay usable while discovery disables row actions", () => {
  const fixture = listFixture();
  const opened = [];
  fixture.render({
    apps: [{ name: "Cached app", path: "projects/cached" }],
    appHref: () => "/app-map", onOpen: path => opened.push(path), actionsDisabled: true,
  });
  const link = fixture.tree.find(node => node.type === "a").props;
  assert.equal(link["aria-disabled"], undefined);
  assert.equal(link.tabIndex, 0);
  assert.equal(fixture.tree.find(node => node.type === "MenuButton").props.button.disabled, true);
  link.onClick({ preventDefault() {} });
  assert.deepEqual(opened, ["projects/cached"]);
});

test("the shared relative clock refreshes rows and is cleared when its list is disposed", context => {
  context.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-07T18:00:00Z") });
  let tick;
  context.mock.method(globalThis, "setInterval", (callback, delay) => {
    assert.equal(delay, 60000);
    tick = callback;
    return 42;
  });
  const clear = context.mock.method(globalThis, "clearInterval", timer => assert.equal(timer, 42));
  const fixture = listFixture();
  const props = { apps: [{ name: "App", path: "C:\\projects\\app", lastOpenedAt: "2026-11-07T17:55:00Z" }],
    appHref: () => "/app-map" };
  fixture.render(props);
  const cleanup = fixture.effects[0]();
  assert.equal(fixture.tree.find(node => node.type === "time").children[0], "\u2022 opened 5m ago");
  context.mock.timers.tick(60000);
  tick();
  fixture.render(props);
  assert.equal(fixture.tree.find(node => node.type === "time").children[0], "\u2022 opened 6m ago");
  assert.equal(fixture.tree.find(node => node.type === "time").props.dateTime, props.apps[0].lastOpenedAt);
  assert.equal(fixture.effects.length, 1);
  cleanup();
  assert.equal(clear.mock.callCount(), 1);
});
