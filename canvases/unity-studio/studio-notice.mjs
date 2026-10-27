export function createStudioNotices({ loadToolkit, onError }) {
  const views = new Map();
  function clearNotice(element) {
    const previous = views.get(element);
    views.delete(element);
    previous?.handle?.dispose();
  }
  function renderNotice(element, props) {
    if (!element || element.nodeType !== 1) throw new TypeError("A notice mount element is required.");
    if (!props?.children) { clearNotice(element); return; }
    let view = views.get(element);
    const existing = Boolean(view);
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
    if (existing) {
      if (Object.keys(changed).length) view.handle?.update(changed);
      return;
    }
    const state = view;
    void Promise.resolve().then(loadToolkit).then(({ mountCanvasComponent, MessageBar }) => {
      if (views.get(element) !== state) return;
      const latest = Object.fromEntries(Object.entries(state.props).map(([key, value]) =>
        [key, typeof value === "function" ? state.callbacks.get(key) : value]));
      state.handle = mountCanvasComponent(element, MessageBar, latest);
    }).catch(cause => {
      if (views.get(element) !== state) return;
      clearNotice(element);
      onError(`Could not load the review notice: ${cause.message}`);
    });
  }
  function dispose() {
    for (const element of views.keys()) clearNotice(element);
  }
  return { renderNotice, clearNotice, dispose };
}
