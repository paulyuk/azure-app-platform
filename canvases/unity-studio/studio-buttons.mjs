export function createStudioButtons(toolkit) {
  const { Button, createElement, mountCanvasComponent } = toolkit;
  const views = new Map();
  const controls = new WeakMap();

  function render(element, props) {
    let view = views.get(element);
    if (!view) {
      view = { props: {}, callbacks: new Map(), handle: null };
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
        view.handle = mountCanvasComponent(element, Button, Object.fromEntries(
          Object.entries(view.props).map(([key, value]) =>
            [key, typeof value === "function" ? view.callbacks.get(key) : value])));
      } catch (cause) {
        views.delete(element);
        throw cause;
      }
      view.control = element.querySelector("button");
      controls.set(view.control, element);
    }
    return view.control;
  }

  function create(props) {
    const element = document.createElement("span");
    element.className = "studio-button-mount";
    return render(element, { type: "button", ...props });
  }
  function host(control) {
    return controls.get(control) ?? control;
  }
  function append(parent, ...children) {
    parent.append(...children.map(host));
  }
  function update(control, props) {
    const element = controls.get(control);
    if (!element || !views.has(element)) throw new Error("Cannot update an unowned Studio button.");
    return render(element, props);
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
    for (const [element, view] of views) {
      if (root !== element && !root.contains(element)) continue;
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
  return { renderButton: render, create, host, append, update, setDisabled, setText, icon, clear, mountAll, replace, dispose };
}

export const STUDIO_BUTTON_MOUNT_CSS = `
  :root[data-studio-theme="light"] { color-scheme: light; }
  :root[data-studio-theme="dark"] { color-scheme: dark; }
  .studio-button-mount, .studio-button-mount > .ct-provider { display: contents; }
`;
