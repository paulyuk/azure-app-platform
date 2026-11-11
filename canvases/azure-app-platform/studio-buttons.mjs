export function createStudioButtons(toolkit) {
  const { Button, createElement, mountCanvasComponent } = toolkit;
  const views = new Map();
  const controls = new WeakMap();

  function Field({ kind, label, hint, fieldError, options, ...props }) {
    return createElement(toolkit.FormField, { label, hint, error: fieldError, required: props.required },
      createElement(toolkit[kind], props, options?.map(option =>
        createElement("option", { key: option.value, value: option.value }, option.label))));
  }
  function Menu({ items, ...props }) {
    return createElement(toolkit.MenuButton, props, items.map(({ id, label, ...item }) =>
      createElement(toolkit.MenuItem, { key: id, ...item }, label)));
  }
  function Split({ heading, items, ...props }) {
    return createElement(toolkit.SplitButton, props,
      createElement(toolkit.MenuGroup, null,
        createElement(toolkit.MenuGroupHeader, null, heading),
        items.map(({ id, label, ...item }) => createElement(toolkit.MenuItem, { key: id, ...item }, label))));
  }
  function Segmented({ items, value, onValueChange, onReselect, iconOnly = false, ...props }) {
    return createElement(toolkit.ActionToolbar, props, items.map(item => createElement(toolkit.ToolbarToggleButton, {
      key: item.value, name: "selection", value: item.value, icon: item.icon,
      checked: item.value === value,
      onChange: (event, data) => {
        if (data.checked) onValueChange(item.value);
        else if (item.value === value) onReselect?.(item.value);
      },
      appearance: "subtle", size: "small",
      "aria-label": item.label, title: item.title ?? item.label, "aria-controls": item.controls,
      "data-focus-key": item.focusKey,
    }, iconOnly ? undefined : item.label)));
  }

  function render(element, props, component = Button, selector = "button") {
    let view = views.get(element);
    if (!view) {
      view = { props: {}, callbacks: new Map(), handle: null, component, selector };
      views.set(element, view);
    }
    const changed = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === "function" && !view.callbacks.has(key)) {
        view.callbacks.set(key, (...args) => view.props[key]?.(...args));
      }
      const previous = typeof view.props[key] === "function" ? view.callbacks.get(key) : view.props[key];
      const next = typeof value === "function" ? view.callbacks.get(key) : value;
      if (!Object.is(previous, next)) changed[key] = next;
    }
    view.props = { ...view.props, ...props };
    if (view.handle) {
      if (Object.keys(changed).length) view.handle.update(changed);
    } else {
      try {
        view.handle = mountCanvasComponent(element, component, Object.fromEntries(
          Object.entries(view.props).map(([key, value]) =>
            [key, typeof value === "function" ? view.callbacks.get(key) : value])));
      } catch (cause) {
        views.delete(element);
        throw cause;
      }
      view.control = selector ? element.querySelector(selector) : null;
      if (view.control) controls.set(view.control, element);
    }
    return view.control;
  }

  function create(props) {
    const element = document.createElement("span");
    element.className = "studio-button-mount";
    return render(element, { type: "button", ...props });
  }
  function field(props) {
    if (!["TextInput", "Textarea", "Select"].includes(props.kind)) throw new Error("Choose a supported toolkit form control.");
    const element = document.createElement("div");
    element.className = "studio-field-mount";
    return render(element, props, Field, "input,textarea,select");
  }
  function menu(props) {
    const element = document.createElement("span");
    element.className = "studio-button-mount";
    return render(element, props, Menu);
  }
  function split(props) {
    const element = document.createElement("span");
    element.className = "studio-button-mount";
    return render(element, props, Split, '[role="group"]');
  }
  function segmented(props) {
    const element = document.createElement("div");
    element.className = "studio-segmented-mount";
    return render(element, props, Segmented, '[role="toolbar"]');
  }
  function renderComponent(element, name, props) {
    const view = views.get(element);
    if (view && view.component !== toolkit[name]) throw new Error("Cannot replace an owned toolkit component without clearing it.");
    render(element, props, toolkit[name], null);
  }
  function actionGroup(parent, props = {}) {
    const element = document.createElement("div");
    element.className = "studio-action-mount";
    parent.append(element);
    renderComponent(element, "ActionGroup", props);
    views.get(element).actionChildren = [];
    return element;
  }
  function host(control) {
    return controls.get(control) ?? control;
  }
  function append(parent, ...children) {
    const group = views.get(parent);
    if (group?.actionChildren) {
      group.actionChildren.push(...children.map(host));
      renderComponent(parent, "ActionGroup", {
        children: group.actionChildren.map((element, index) =>
          createElement(toolkit.DomContent, { key: index, element })),
      });
    } else parent.append(...children.map(host));
  }
  function update(control, props) {
    const element = controls.get(control);
    if (!element || !views.has(element)) throw new Error("Cannot update an unowned Studio button.");
    const view = views.get(element);
    return render(element, props, view.component, view.selector);
  }
  function setDisabled(control, disabled) {
    if (controls.has(control)) update(control, { disabled });
    else control.disabled = disabled;
  }
  function setText(control, children) {
    if (controls.has(control)) update(control, { children });
    else control.textContent = children;
  }
  function clear(root) {
    const owned = [...views].filter(([element]) => root === element || root.contains(element));
    for (const [element, view] of owned.reverse()) {
      views.delete(element);
      controls.delete(view.control);
      view.handle.dispose();
    }
  }
  function content(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return null;
    const props = {};
    for (const { name, value } of node.attributes) {
      const property = name === "class" ? "className" :
        name.startsWith("aria-") || name.startsWith("data-") ? name :
          name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      props[property] = value;
    }
    return createElement(node.localName, props, ...[...node.childNodes].map(content));
  }
  function icon(markup) {
    const template = document.createElement("template");
    template.innerHTML = markup;
    return content(template.content.firstElementChild);
  }
  function mountAll(root) {
    for (const original of root.querySelectorAll("button[data-studio-button]")) {
      const props = { type: "button" };
      for (const { name, value } of original.attributes) {
        if (name === "data-studio-button") continue;
        props[name === "class" ? "className" : name === "tabindex" ? "tabIndex" : name] =
          ["disabled", "autofocus", "hidden"].includes(name) ? true : value;
      }
      if (props.autofocus) { props.autoFocus = true; delete props.autofocus; }
      props.appearance = original.dataset.studioButton || "secondary";
      const children = [...original.childNodes];
      const icon = children.find(node => node.nodeType === 1 && node.localName === "svg");
      if (icon) props.icon = content(icon);
      props.children = createElement(toolkit.Fragment, null, ...children.filter(node => node !== icon).map(content));
      const focused = original === document.activeElement;
      const control = create(props);
      original.replaceWith(host(control));
      if (focused) control.focus({ preventScroll: true });
    }
  }
  function replace(root, html) {
    clear(root);
    root.innerHTML = html;
    mountAll(root);
  }
  function dispose() {
    for (const element of [...views.keys()]) clear(element);
  }
  return { renderButton: render, create, field, menu, split, segmented, renderComponent, actionGroup, host, append, update, setDisabled, setText, icon, clear, mountAll, replace, dispose };
}

export const STUDIO_BUTTON_MOUNT_CSS = `
  :root[data-studio-theme="light"] { color-scheme: light; }
  :root[data-studio-theme="dark"] { color-scheme: dark; }
  .studio-button-mount, .studio-button-mount > .ct-provider,
  .studio-action-mount, .studio-action-mount > .ct-provider,
  .studio-segmented-mount > .ct-provider { display: contents; }
`;
