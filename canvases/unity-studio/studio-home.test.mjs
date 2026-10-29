import assert from "node:assert/strict";
import test from "node:test";
import { mountStudioHome } from "./studio-home.mjs";

test("Unity home composes public toolkit components and retains all journey callbacks", () => {
  const tree = [];
  const toolkit = Object.fromEntries(["FeaturePanel", "SpotIllustration", "Button", "ActionCard", "SectionHeader", "SymbolIcon"]
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
  const panel = tree.find(node => node.type === "FeaturePanel");
  assert.equal(panel.props.title, "Create a new app");
  assert.equal(panel.props.headingLevel, 2);
  assert.equal(panel.props.onClick, undefined, "The leading region is not an interactive card");
  assert.equal(panel.props.illustration.type, "SpotIllustration");
  assert.equal(panel.props.illustration.props.variant, "layers");
  assert.equal(panel.props.actions.type, "Button");
  assert.equal(panel.props.actions.props.appearance, "primary");
  assert.deepEqual(panel.props.actions.children, ["Create"]);
  panel.props.actions.props.onClick();
  const secondary = tree.filter(node => node.type === "ActionCard");
  assert.deepEqual(secondary.map(node => node.props.title), ["Open an app", "Assemble existing pieces"]);
  for (const node of secondary) {
    assert.equal(node.props.joined, true);
    assert.equal(node.props.compact, true);
    assert.equal(node.props.type, "button");
    node.props.onClick();
  }
  assert.deepEqual(calls, ["create", "open", "assemble"]);
  assert.equal(tree.filter(node => node.type === "h1").length, 1);
});
