export function getAppPathLabels(paths) {
  return new Map(paths.map(path => {
    const parts = path.replace(/^[A-Za-z]:/, "").split(/[\\/]/).filter(Boolean);
    const rootDepth = /^[\\/]{2}\?[\\/]UNC[\\/]/i.test(path) ? 4
      : /^[\\/]{2}[^\\/]/.test(path) ? 2 : 0;
    return [path, parts.length > rootDepth ? parts.at(-1) : path];
  }));
}

export function getAppOpenedLabel(value, now = Date.now()) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "";
  const minutes = Math.floor(Math.max(0, now - Date.parse(value)) / 60000);
  if (minutes === 0) return "opened just now";
  if (minutes < 60) return "opened " + minutes + "m ago";
  if (minutes < 1440) return "opened " + Math.floor(minutes / 60) + "h ago";
  return "opened " + Math.floor(minutes / 1440) + "d ago";
}

export function createStudioAppList(toolkit, { getAppPathLabels, getAppOpenedLabel }) {
  const { createElement: h, Fragment, useState, useEffect, useRef, MenuButton, MenuItem, Tooltip } = toolkit;

  function AppRow({ app, pathLabel, openedLabel, appHref, itemAttribute, onOpen, onCopyPath, onRename, onDelete, disabled, actionsDisabled = disabled }) {
    const trigger = useRef(null);
    return h("li", { className: "app-list-row" },
      h(Tooltip, { content: h("span", { className: "app-list-full-path" }, app.path) },
        h("a", {
          className: "app-list-target", href: appHref(app.path), [itemAttribute]: app.path,
          "aria-label": app.name,
          "aria-disabled": disabled || undefined, tabIndex: disabled ? -1 : 0,
          onClick: event => {
            if (disabled) { event.preventDefault(); return; }
            if (onOpen) { event.preventDefault(); onOpen(app.path); }
          },
          onKeyDown: event => {
            if (event.key !== "Escape") return;
            const popup = event.currentTarget.ownerDocument.getElementById(event.currentTarget.getAttribute("aria-describedby"));
            if (popup?.matches(":popover-open")) {
              // WebKit does not dismiss native hint popovers on Escape.
              popup.hidePopover();
              event.preventDefault();
              event.stopPropagation();
            }
          },
        },
        h("strong", { className: "app-list-name", title: app.name }, app.name),
        h("span", { className: "app-list-metadata" },
          h("span", { className: "app-list-path" }, pathLabel),
          openedLabel ? h("time", { className: "app-list-opened", dateTime: app.lastOpenedAt,
            title: new Date(app.lastOpenedAt).toLocaleString() }, "\u2022 " + openedLabel) : null))),
      h(MenuButton, {
        label: null, positioning: "below-end",
        button: {
          ref: trigger, appearance: "subtle", size: "small", disabled: actionsDisabled,
          icon: h("span", { "aria-hidden": true }, "\u22ef"),
          "aria-label": "More actions for " + app.name, "data-app-actions": app.path,
        },
      }, h(MenuItem, { onClick: () => onCopyPath(app.path) }, "Copy full path"),
      h(MenuItem, { onClick: () => onRename(app.path, app.name, trigger.current) }, "Rename app"),
      h(MenuItem, { onClick: () => onDelete(app.path, app.name, trigger.current) },
        h("span", { className: "app-list-delete" }, "Delete app"))));
  }

  return function AppList({ apps, inventory = apps, id, itemAttribute = "data-existing-app", ...rowProps }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), 60000);
      return () => clearInterval(timer);
    }, []);
    const pathLabels = getAppPathLabels(inventory.map(app => app.path));
    return h(Fragment, null,
      h("style", null, `
        .app-list { list-style: none; margin-block: 8px; padding: 0; }
        .app-list-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 8px; border: 0; }
        .app-list-row:hover, .app-list-row:focus-within { background: var(--studio-panel); }
        .app-list-target { display: grid; gap: 2px; min-width: 0; color: var(--studio-ink); text-decoration: none; }
        .app-list-target:focus-visible { outline: 2px solid var(--color-focus-outline, #0969da); outline-offset: 3px; border-radius: 2px; }
        .app-list-name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 13px; font-weight: 600; line-height: 18px; overflow-wrap: anywhere; }
        .app-list-metadata { display: flex; align-items: baseline; gap: 4px; min-width: 0; color: var(--studio-muted); font-size: 12px; line-height: 18px; }
        .app-list-path { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .app-list-opened { flex: none; white-space: nowrap; }
        .app-list-full-path { display: block; max-width: min(360px, calc(100vw - 40px)); overflow-wrap: anywhere; }
        [role="tooltip"]:has(.app-list-full-path) { border: 0; }
        .app-list-delete { color: var(--studio-danger); }
      `),
      h("ul", { className: "app-list", id },
        ...apps.map(app => h(AppRow, { key: app.path, app, pathLabel: pathLabels.get(app.path),
          openedLabel: getAppOpenedLabel(app.lastOpenedAt, now), itemAttribute, ...rowProps }))));
  };
}
