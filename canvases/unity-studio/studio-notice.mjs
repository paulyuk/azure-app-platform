export function createStudioNotices({ loadToolkit, onError }) {
  const views = new Map();
  function clearNotice(element) {
    const previous = views.get(element);
    views.delete(element);
    previous?.handle?.dispose();
  }
  function renderComponent(element, component, props, label = "shared component") {
    if (!element || element.nodeType !== 1) throw new TypeError("A component mount element is required.");
    let view = views.get(element);
    if (view && view.component !== component) { clearNotice(element); view = null; }
    const existing = Boolean(view);
    if (!view) {
      view = { component, props: {}, callbacks: new Map(), handle: null };
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
    const fail = cause => {
      if (views.get(element) !== view) return;
      clearNotice(element);
      onError(`Could not load the ${label}: ${cause.message}`);
    };
    if (existing) {
      try {
        if (Object.keys(changed).length) view.handle?.update(changed);
      } catch (cause) { fail(cause); }
      return;
    }
    const state = view;
    void Promise.resolve().then(loadToolkit).then(toolkit => {
      if (views.get(element) !== state) return;
      if (element.isConnected === false) { clearNotice(element); return; }
      const latest = Object.fromEntries(Object.entries(state.props).map(([key, value]) =>
        [key, typeof value === "function" ? state.callbacks.get(key) : value]));
      state.handle = toolkit.mountCanvasComponent(element, toolkit[component], latest);
    }).catch(fail);
  }
  function renderNotice(element, props) {
    if (!element || element.nodeType !== 1) throw new TypeError("A notice mount element is required.");
    if (!props?.children) { clearNotice(element); return; }
    renderComponent(element, "MessageBar", props, "review notice");
  }
  function dispose() {
    for (const element of views.keys()) clearNotice(element);
  }
  return { renderComponent, clearComponent: clearNotice, renderNotice, clearNotice, dispose };
}
