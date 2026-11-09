export { getAppPathLabels, getAppOpenedLabel } from "./studio-app-list.mjs";

export function mountStudioOpenApps(element, { toolkit, AppList, ...props }) {
  const { createElement: h, mountCanvasComponent, useState, useRef, Button, TextInput } = toolkit;

  function OpenApps({ apps, initialSearch = "", onSearchChange, appHref, onCopyPath, onRename, onDelete, onCreate, onRetry, emptyIllustrations, loadError = null, loading = false, loadingSkeleton = "", disabled = false }) {
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
      apps.length > 0 || query ? h("div", { className: "open-app-search" },
        h(TextInput, {
          ref: search, type: "search", placeholder: "Search apps by name or path",
          "aria-label": "Search apps", "aria-controls": "open-app-list", value: query, disabled: disabled || Boolean(loadError),
          onChange: (_event, data) => changeSearch(data.value),
        }),
        query ? h(Button, { appearance: "subtle", disabled: disabled || Boolean(loadError),
          onClick: () => { changeSearch(""); search.current?.focus(); } }, "Clear search") : null) : null,
      loading ? h("p", { className: "journey-progress", role: "status" },
        h("span", { className: "journey-spinner", "aria-hidden": true }), "Finding your apps...") : null,
      loadError && !loading
        ? h("div", { className: "open-app-recovery" },
          h("h2", null, "Apps could not be loaded"),
          h("p", { role: "alert" }, loadError),
          h(Button, { id: "retry-apps", appearance: "primary", disabled, onClick: onRetry }, "Retry")) : null,
      loading && apps.length === 0
        ? h("div", { "aria-busy": true, "aria-label": "App list", dangerouslySetInnerHTML: { __html: loadingSkeleton } })
        : !loadError && apps.length === 0
        ? h("div", { className: "open-app-welcome" },
          h("div", { className: "open-app-empty-art", "aria-hidden": true },
            ...["light", "dark"].map(theme => h("span", { key: theme, "data-open-app-art-theme": theme,
              dangerouslySetInnerHTML: { __html: emptyIllustrations[theme] } }))),
          h("h1", null, "Your next app starts here"),
          h("p", null, "Start with a template and make it your own."),
          h(Button, { appearance: "primary", disabled, onClick: onCreate }, "Create an app"))
        : apps.length > 0 ? h(toolkit.Fragment, null,
          h("div", { className: "open-app-count", role: "status", "aria-live": "polite", "aria-atomic": true },
            query.trim() ? filtered.length + " of " + apps.length + " apps" : apps.length + (apps.length === 1 ? " app" : " apps")),
          h(AppList, { id: "open-app-list", apps: filtered, inventory: apps,
            appHref, onCopyPath, onRename, onDelete, disabled, actionsDisabled: disabled || loading }),
          filtered.length === 0 ? h("p", { className: "open-app-empty" }, "No apps match your search.") : null) : null);
  }
  return mountCanvasComponent(element, OpenApps, props);
}
