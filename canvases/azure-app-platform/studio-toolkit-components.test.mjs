import assert from "node:assert/strict";
import test from "node:test";

import { createStudioToolkitComponents } from "./studio-toolkit-components.mjs";

test("filterable dropdown controls selection, disabled state, callbacks and disposal", () => {
  const originalDocument = globalThis.document;
  const calls = [];
  globalThis.document = {
    createElement(tagName) {
      return { tagName, className: "", dataset: {} };
    },
  };
  try {
    const SelectPanel = {};
    const controller = createStudioToolkitComponents({
      SelectPanel,
      mountCanvasComponent(element, component, props) {
        const handle = {
          disposed: false,
          props,
          update(next) {
            this.props = { ...this.props, ...next };
            calls.push(["update", next]);
          },
          dispose() {
            this.disposed = true;
            calls.push(["dispose"]);
          },
        };
        calls.push(["mount", element, component, props]);
        return handle;
      },
    });
    const changes = [];
    const dropdown = controller.createFilterableDropdown({
      ariaLabel: "Azure subscription",
      title: "Azure subscription",
      searchPlaceholder: "Filter Azure subscriptions by name or ID",
      options: [
        { value: "sub-a", label: "Subscription A · sub-a" },
        { value: "sub-b", label: "Subscription B · sub-b" },
      ],
      value: "sub-a",
      onChange: value => changes.push(value),
    });
    const props = calls[0][3];
    assert.equal(calls[0][2], SelectPanel);
    assert.deepEqual(props.selectedOptions, ["sub-a"]);
    assert.equal(dropdown.value, "sub-a");
    dropdown.disabled = true;
    assert.equal(calls.at(-1)[1].disabled, true);
    props.onOptionSelect({}, { selectedOptions: ["sub-b"] });
    assert.equal(dropdown.value, "sub-b");
    assert.deepEqual(changes, ["sub-b"]);
    controller.clear({ contains: element => element === dropdown });
    assert.deepEqual(calls.at(-1), ["dispose"]);
  } finally {
    globalThis.document = originalDocument;
  }
});
