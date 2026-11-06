import assert from "node:assert/strict";
import test from "node:test";
import { mountStudioHome } from "./studio-home.mjs";

function mountHome(options = {}) {
  const tree = [], state = [];
  let component, props = {}, cursor;
  const element = {};
  const render = () => { tree.length = 0; cursor = 0; component(props); };
  const handle = { update(next) { props = { ...props, ...next }; render(); }, dispose() {} };
  const toolkit = Object.fromEntries(["WorkItem", "Button", "SectionHeader", "SymbolIcon", "FilterToolbar", "Disclosure"]
    .map(name => [name, name]));
  toolkit.createElement = (type, props, ...children) => {
    const node = { type, props: props || {}, children };
    tree.push(node);
    return node;
  };
  toolkit.useState = initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; render(); }];
  };
  toolkit.mountCanvasComponent = (mount, view) => {
    assert.equal(mount, element);
    component = view;
    render();
    return handle;
  };
  assert.equal(mountStudioHome(element, { toolkit, ...options }), handle);
  return { tree, handle };
}

test("home composes public toolkit primitives with the selected illustrations and real journey callbacks", () => {
  const calls = [];
  const { tree } = mountHome({
    onCreate: () => calls.push("create"), onOpen: () => calls.push("open"), onAssemble: () => calls.push("assemble"),
  });
  const tasks = tree.filter(node => node.props.className === "simple-home-task");
  assert.deepEqual(tasks.map(node => node.props["aria-label"]), ["Create a new app", "Open an app", "Assemble existing projects"]);
  for (const node of tasks) {
    assert.equal(node.type, "Button");
    assert.equal(node.props.type, "button");
    assert.equal(node.props["aria-pressed"], undefined);
    assert.equal(node.props["data-default-selected"], undefined);
    node.props.onClick();
  }
  assert.deepEqual(calls, ["create", "open", "assemble"]);
  tree.find(node => node.props.className === "simple-home-browse").props.onClick();
  assert.deepEqual(calls, ["create", "open", "assemble", "open"]);
  assert.deepEqual(tree.filter(node => node.type === "img").map(node => [node.props.src, node.props.alt]), [
    ["/assets/homepage-create.svg", ""], ["/assets/homepage-create-dark.svg", ""],
    ["/assets/homepage-open.svg", ""], ["/assets/homepage-open-dark.svg", ""],
    ["/assets/homepage-assemble.svg", ""], ["/assets/homepage-assemble-dark.svg", ""],
  ]);
  assert.deepEqual(tree.filter(node => node.type === "img").map(node => node.props["data-home-art-theme"]),
    ["light", "dark", "light", "dark", "light", "dark"]);
  assert.deepEqual(tree.filter(node => node.type === "h1").map(node => node.children), [["What would you like to do?"]]);
  assert.ok(JSON.stringify(tree).includes("Start a new app, bring existing projects together, or pick up where you left off."));
});

test("recent apps distinguish not-loaded, empty, failed and recorded rows without new discovery", () => {
  for (const [recentApps, recentError, expected] of [
    [null, null, "Recent apps have not been loaded."],
    [[], null, "No recently viewed apps were found."],
    [null, "Unavailable", "Recent apps could not be refreshed."],
    [[{ name: "Synthetic app", path: "projects/synthetic", lastOpenedAt: "2026-10-29T12:00:00Z" }], null, "Synthetic app"],
  ]) {
    const opened = [];
    const { tree } = mountHome({ recentApps, recentError, onOpenRecent: path => opened.push(path) });
    assert.ok(JSON.stringify(tree).includes(expected));
    const recent = tree.find(node => node.type === "WorkItem");
    if (recent) {
      assert.equal(recent.props.actions, undefined, "No duplicate row action");
      recent.props.title.props.onClick();
      assert.deepEqual(opened, ["projects/synthetic"]);
      assert.equal(recent.props.metadata.props.dateTime, "2026-10-29T12:00:00Z");
    }
  }
});

test("home caps its own rows at five without truncating or mutating the source inventory", () => {
  for (const count of [0, 1, 5, 7]) {
    const recentApps = Array.from({ length: count }, (_, index) => ({
      name: `Synthetic app ${index}`, path: `projects/app-${index}`,
      lastOpenedAt: new Date(Date.UTC(2026, 9, 29 - index, 12)).toISOString(),
    }));
    const original = structuredClone(recentApps), opened = [];
    const { tree } = mountHome({ recentApps, onOpenRecent: path => opened.push(path) });
    const rows = tree.filter(node => node.type === "WorkItem");
    assert.deepEqual(rows.map(row => row.props.title.children[0]), original.slice(0, 5).map(app => app.name));
    for (const row of rows) row.props.title.props.onClick();
    assert.deepEqual(opened, original.slice(0, 5).map(app => app.path));
    assert.deepEqual(recentApps, original);
  }
});

test("search filters the complete cached inventory before capping and survives owner updates", () => {
  const recentApps = Array.from({ length: 7 }, (_, index) => ({
    name: `Synthetic app ${index}`, path: `projects/app-${index}`, lastOpenedAt: "2026-10-29T12:00:00Z",
  }));
  const original = structuredClone(recentApps);
  const { tree, handle } = mountHome({ recentApps });
  const search = () => tree.find(node => node.type === "FilterToolbar").props.search;
  search().onChange(null, { value: "  APP-6  " });
  assert.deepEqual(tree.filter(node => node.type === "WorkItem").map(row => row.props.title.children[0]), ["Synthetic app 6"]);
  handle.update({ busy: true });
  assert.equal(search().value, "  APP-6  ");
  assert.equal(search().disabled, true);
  assert.equal(tree.find(node => node.type === "fieldset").props.disabled, true);
  assert.ok(tree.filter(node => node.type === "Button").every(node => node.props.disabled));
  handle.update({ busy: false, recentError: "Refresh failed" });
  assert.equal(search().disabled, true);
  assert.ok(JSON.stringify(tree).includes("Recent apps could not be refreshed."));
  handle.update({ recentError: null });
  assert.equal(search().value, "  APP-6  ");
  assert.equal(search().disabled, false);
  search().onChange(null, { value: "unmatched" });
  assert.equal(tree.filter(node => node.type === "WorkItem").length, 0);
  assert.ok(JSON.stringify(tree).includes("No recent apps match."));
  search().onChange(null, { value: "SYNTHETIC APP 2" });
  assert.equal(tree.filter(node => node.type === "WorkItem").length, 1);
  search().onChange(null, { value: " " });
  assert.equal(tree.filter(node => node.type === "WorkItem").length, 5);
  assert.deepEqual(recentApps, original);
});

test("app guidance is opt-in and does not imply mapping or local simulation grants protection", () => {
  const { tree } = mountHome();
  assert.deepEqual(tree.filter(node => node.type === "Disclosure").map(node => node.props.title), [
    "What makes up an app?", "How is tool execution isolated?", "How is shared access governed?",
    "How do I check that things work?", "How apps work",
  ]);
  assert.ok(tree.filter(node => node.type === "Disclosure").every(node => !node.props.defaultOpen && node.props.keepMounted));
  const copy = JSON.stringify(tree);
  assert.match(copy, /Local subprocess execution is a simulation, not that isolation boundary/);
  assert.match(copy, /mapping a resource does not itself grant permission/);
  assert.match(copy, /configured and verified for each app/);
  assert.doesNotMatch(copy, /this preview|mock apps|Simulated loading/);
});
