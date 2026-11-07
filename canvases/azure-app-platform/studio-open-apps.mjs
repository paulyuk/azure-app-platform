export function mountStudioOpenApps(element, { toolkit, ...props }) {
  const { createElement: h, mountCanvasComponent, useState, useRef, Button, TextInput, MenuButton, MenuItem } = toolkit;

  function AppCard({ app, appHref, onDelete, disabled }) {
    const trigger = useRef(null);
    const opened = Number.isFinite(Date.parse(app.lastOpenedAt));
    return h("li", { className: "open-app-row" },
      h("a", {
        className: "open-app-target", href: appHref(app.path), "data-existing-app": app.path,
        "aria-disabled": disabled || undefined, tabIndex: disabled ? -1 : undefined,
        onClick: event => { if (disabled) event.preventDefault(); },
      },
      h("strong", { className: "open-app-name", title: app.name }, app.name),
      h("span", { className: "open-app-path", title: app.path }, app.path),
      h("span", { className: "open-app-meta" },
        h("span", null, app.capabilityIds.length + (app.capabilityIds.length === 1 ? " capability" : " capabilities")),
        opened
          ? h("time", { dateTime: app.lastOpenedAt, title: new Date(app.lastOpenedAt).toLocaleString() },
            "Opened " + new Date(app.lastOpenedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))
          : h("span", null, "Opened: not recorded"))),
      h(MenuButton, {
        label: null, positioning: "below-end",
        button: {
          ref: trigger, appearance: "subtle", size: "small", disabled,
          icon: h("span", { "aria-hidden": true }, "\u22ef"),
          "aria-label": "More actions for " + app.name, "data-app-actions": app.path,
        },
      }, h(MenuItem, { onClick: () => onDelete(app.path, app.name, trigger.current) },
        h("span", { className: "open-app-delete" }, "Delete app"))));
  }

  function OpenApps({ apps, initialSearch = "", onSearchChange, appHref, onDelete, onCreate, onRetry, emptyIllustrations, loadError = null, disabled = false }) {
    const [query, setQuery] = useState(initialSearch);
    const search = useRef(null);
    const filtered = apps.filter(app => (app.name + " " + app.path).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    function changeSearch(value) {
      setQuery(value);
      onSearchChange(value);
    }
    return h("section", { className: "open-apps", "aria-label": "Existing apps" },
      h("style", null, `
        .open-apps { --open-app-art-light-display: block; --open-app-art-dark-display: none; }
        :root[data-studio-theme="dark"] .open-apps,
        :root.studio-shared-presentation[data-theme-tone="dark"] .open-apps,
        :root.studio-shared-presentation:not([data-theme-tone="light"]):not([data-theme-tone="dark"])[data-color-mode="dark"] .open-apps {
          --open-app-art-light-display: none; --open-app-art-dark-display: block;
        }
        :root.studio-shared-presentation[data-theme-tone="light"] .open-apps,
        :root.studio-shared-presentation:not([data-theme-tone="light"]):not([data-theme-tone="dark"])[data-color-mode="light"] .open-apps {
          --open-app-art-light-display: block; --open-app-art-dark-display: none;
        }
        .open-app-search { display: flex; align-items: center; gap: 8px; margin-block: 16px 8px; }
        .open-app-search > :first-child { flex: 1; min-width: 0; }
        .open-app-count { color: var(--studio-muted); font-size: 12px; }
        .open-app-list { display: grid; gap: 6px; list-style: none; margin-block: 8px; padding: 0; }
        .open-app-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; padding: 10px 12px; border: 1px solid var(--studio-line); border-radius: var(--studio-surface-radius, 8px); background: var(--studio-raised); }
        .open-app-row:hover, .open-app-row:focus-within { border-color: var(--studio-accent-2); }
        .open-app-target { display: grid; gap: 2px; min-width: 0; color: var(--studio-ink); text-decoration: none; }
        .open-app-target:focus-visible { outline: 2px solid var(--color-focus-outline, #0969da); outline-offset: 3px; border-radius: 2px; }
        .open-app-name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 13px; font-weight: 600; line-height: 18px; overflow-wrap: anywhere; }
        .open-app-path { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--studio-muted); font-size: 12px; line-height: 18px; }
        .open-app-meta { display: flex; flex-wrap: wrap; column-gap: 12px; color: var(--studio-muted); font-size: 12px; line-height: 18px; }
        .open-app-delete { color: var(--studio-danger); }
        .open-app-empty { margin-top: 16px; }
        .open-app-recovery { margin-top: 16px; }
        .open-app-recovery h2 { margin-top: 0; }
        .open-app-welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: min(560px, calc(100svh - 160px)); padding: 24px 12px 40px; text-align: center; }
        .open-app-welcome h1 { margin: 0; max-width: 22ch; font-size: var(--text-title-size, 20px); line-height: var(--text-title-line-height, 28px); font-weight: var(--font-weight-semibold, 600); }
        .open-app-welcome p { margin: 0; max-width: 34ch; text-wrap: pretty; }
        .open-app-welcome > button { margin-top: 4px; }
        .open-app-empty-art { width: min(224px, 100%); flex: none; }
        .open-app-empty-art [data-open-app-art-theme="light"] { display: var(--open-app-art-light-display); }
        .open-app-empty-art [data-open-app-art-theme="dark"] { display: var(--open-app-art-dark-display); }
        .open-app-empty-art svg { display: block; width: 100%; height: auto; }
        @media (max-height: 600px) {
          .open-app-welcome { min-height: 0; gap: 8px; padding-block: 12px; }
          .open-app-empty-art { width: min(160px, 100%); }
        }
      `),
      loadError
        ? h("div", { className: "open-app-recovery" },
          h("h2", null, "Apps could not be loaded"),
          h("p", { role: "alert" }, loadError),
          h(Button, { appearance: "primary", disabled, onClick: onRetry }, "Retry"))
        : apps.length === 0
        ? h("div", { className: "open-app-welcome" },
          h("div", { className: "open-app-empty-art", "aria-hidden": true },
            ...["light", "dark"].map(theme => h("span", { key: theme, "data-open-app-art-theme": theme,
              dangerouslySetInnerHTML: { __html: emptyIllustrations[theme] } }))),
          h("h1", null, "Your next app starts here"),
          h("p", null, "Start with a template and make it your own."),
          h(Button, { appearance: "primary", disabled, onClick: onCreate }, "Create an app"))
        : h(toolkit.Fragment, null,
          h("div", { className: "open-app-search" },
            h(TextInput, {
              ref: search, type: "search", placeholder: "Search apps by name or path",
              "aria-label": "Search apps", "aria-controls": "open-app-list", value: query, disabled,
              onChange: (_event, data) => changeSearch(data.value),
            }),
            query ? h(Button, { appearance: "subtle", disabled, onClick: () => { changeSearch(""); search.current?.focus(); } }, "Clear search") : null),
          h("div", { className: "open-app-count", role: "status", "aria-live": "polite", "aria-atomic": true },
            query.trim() ? filtered.length + " of " + apps.length + " apps" : apps.length + (apps.length === 1 ? " app" : " apps")),
          h("ul", { className: "open-app-list", id: "open-app-list" },
            ...filtered.map(app => h(AppCard, { key: app.path, app, appHref, onDelete, disabled }))),
          filtered.length === 0 ? h("p", { className: "open-app-empty" }, "No apps match your search.") : null));
  }
  return mountCanvasComponent(element, OpenApps, props);
}
