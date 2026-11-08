export function mountStudioHome(element, { toolkit, AppList, artwork, onCreate, onOpen, onAssemble, onOpenRecent,
  appHref, onCopyPath, onRename, onDelete, appInventory = null, recentApps = null, recentError = null, busy = false }) {
  const { createElement: h, mountCanvasComponent, SectionHeader, Button, SymbolIcon, FilterToolbar, Disclosure, useState } = toolkit;
  const tasks = [
    { id: "new-app", title: "Create a new app", description: "Start with a template. Make it yours.", illustration: "create", onClick: onCreate },
    { id: "open-app", title: "Open an app", description: "Pick up where you left off.", illustration: "open", onClick: onOpen },
    { id: "assemble-app", title: "Assemble existing projects", description: "Bring your projects and Azure resources together.", illustration: "assemble", onClick: onAssemble },
  ];
  const questions = [
    ["What makes up an app?", "An app can include agents, tools, a web experience, and Azure resources. The App Map shows its components and connections; what is included depends on your template and configuration."],
    ["How is tool execution isolated?", "ACA Sandboxes can isolate tool execution from the agent. Local subprocess execution is a simulation, not that isolation boundary."],
    ["How is shared access governed?", "AI Gateway can govern access to shared models and tools. The controls that apply depend on your app's configuration; mapping a resource does not itself grant permission."],
    ["How do I check that things work?", "Review your connections, run a tool-backed task, and inspect the results and logs. These controls need to be configured and verified for each app."],
  ];
  function AppPlatformHome({ busy: currentBusy = busy, recentApps: currentApps = recentApps,
    appInventory: currentInventory = appInventory, recentError: currentError = recentError } = {}) {
    const [query, setQuery] = useState("");
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visibleApps = (currentApps || []).filter(app =>
      (app.name + " " + app.path).toLocaleLowerCase().includes(normalizedQuery)).slice(0, 5);
    return h("fieldset", { className: "simple-home", disabled: currentBusy, "aria-label": "App home", "aria-busy": currentBusy },
      h("style", null, `
        :root { --home-art-light: block; --home-art-dark: none; }
        :root[data-studio-theme="dark"] { --home-art-light: none; --home-art-dark: block; }
        :root.studio-shared-presentation[data-theme-tone="light"],
        :root.studio-shared-presentation:not([data-theme-tone="light"]):not([data-theme-tone="dark"])[data-color-mode="light"] { --home-art-light: block; --home-art-dark: none; }
        :root.studio-shared-presentation[data-theme-tone="dark"],
        :root.studio-shared-presentation:not([data-theme-tone="light"]):not([data-theme-tone="dark"])[data-color-mode="dark"] { --home-art-light: none; --home-art-dark: block; }
        body:has(#studio-home) { padding-inline: 0; }
        body:has(#studio-home) .studio-site-nav { margin-inline: 0; }
        main:has(#studio-home) { padding-block: 0; }
        #studio-home { width: 100%; container: simple-home-shell / inline-size; }
        .simple-home { width: 100%; max-width: 888px; min-width: 0; box-sizing: border-box; border: 0; margin: 0 auto; padding: 24px; color: var(--canvas-fg); }
        .simple-home-start { display: grid; gap: 24px; container: simple-home / inline-size; }
        .simple-home-start > *, .simple-home-tasks > * { min-width: 0; }
        .simple-home-introduction h1 { margin: 0; font-size: var(--text-title-size, 20px); line-height: var(--text-title-line-height, 28px); font-weight: var(--font-weight-semibold, 600); }
        .simple-home-introduction p { margin: 8px 0 0; color: var(--canvas-muted); font-size: var(--canvas-body); line-height: 20px; font-weight: 400; }
        .simple-home-tasks { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
        .simple-home .simple-home-task.simple-home-task { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: center; gap: 12px; width: 100%; height: 100%; min-height: 100px; padding: 12px; text-align: start; border: 1px solid var(--canvas-border); border-radius: var(--canvas-radius-large, 12px); background: var(--canvas-bg); color: var(--canvas-fg); }
        .simple-home .simple-home-task.simple-home-task:hover:not(:disabled) { background: var(--canvas-hover); }
        .simple-home-art { display: flex; justify-content: center; align-items: center; width: 84px; height: 74px; }
        .simple-home-art svg { display: block; width: 84px; height: 74px; }
        .simple-home-art [data-home-art-theme="light"] { display: var(--home-art-light); }
        .simple-home-art [data-home-art-theme="dark"] { display: var(--home-art-dark); }
        .simple-home-art {
          --art-shell-start: color-mix(in srgb, var(--canvas-fg) 18%, var(--canvas-bg));
          --art-shell-end: var(--canvas-tint);
          --art-inset-start: color-mix(in srgb, var(--canvas-fg) 8%, var(--canvas-bg));
          --art-inset-end: var(--canvas-bg);
          --art-accent-start: color-mix(in srgb, var(--canvas-accent) 70%, var(--canvas-bg));
          --art-accent-end: var(--canvas-accent);
          --art-accent-shade: color-mix(in srgb, var(--canvas-accent) 80%, var(--canvas-fg));
        }
        .simple-home-art [data-art-material="shell"] stop:first-child { stop-color: var(--art-shell-start); }
        .simple-home-art [data-art-material="shell"] stop:last-child { stop-color: var(--art-shell-end); }
        .simple-home-art [data-art-material="recess"] stop:first-child { stop-color: var(--art-inset-start); }
        .simple-home-art [data-art-material="recess"] stop:last-child { stop-color: var(--art-inset-end); }
        .simple-home-art [data-art-material="accent"] stop:first-child { stop-color: var(--art-accent-start); }
        .simple-home-art [data-art-material="accent"] stop:last-child { stop-color: var(--art-accent-end); }
        .simple-home-art [data-art-material="accent-shade"] stop { stop-color: var(--art-accent-shade); }
        .simple-home-art [data-art-material="detail"] { fill: var(--canvas-muted); }
        .simple-home-art [data-art-material="ink"] { stroke: var(--canvas-accent); }
        .simple-home-task-copy { display: grid; gap: 4px; min-width: 0; }
        .simple-home-task-title { font-size: var(--canvas-body); line-height: 20px; font-weight: var(--font-weight-semibold, 600); }
        .simple-home-task-description { color: var(--canvas-muted); font-size: var(--canvas-small); line-height: 18px; font-weight: 400; }
        .simple-home-recent { margin-top: 24px; padding: 20px; border: 1px solid var(--canvas-border); border-radius: var(--canvas-radius-large, 12px); }
        .simple-home-recent-heading { flex-wrap: wrap; }
        .simple-home .simple-home-browse.simple-home-browse { font-size: var(--canvas-small); }
        .simple-home-search { width: 100%; box-sizing: border-box; }
        .simple-home-search-toolbar { column-gap: 0; }
        .simple-home-results { display: grid; gap: 4px; margin-top: 8px; }
        .simple-home-help { margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--canvas-border); }
        .simple-home-questions { padding-inline-start: 16px; }
        .simple-home-questions p { margin: 0 0 12px; max-width: 620px; color: var(--canvas-muted); font-size: var(--canvas-small); line-height: 20px; }
        @container simple-home-shell (max-width: 519px) {
          .simple-home { padding: 24px 16px; }
          .simple-home-recent { padding: 16px; }
        }
        @container simple-home (min-width: 640px) {
          .simple-home-tasks { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .simple-home-task:first-child:nth-last-child(odd) { grid-column: 1 / -1; }
        }
      `),
      h("div", { className: "simple-home-start" },
        h("div", { className: "simple-home-introduction" },
          h("h1", null, "What would you like to do?"),
          h("p", null, "Start a new app, bring existing projects together, or pick up where you left off.")),
        h("div", { className: "simple-home-tasks", role: "group", "aria-label": "Ways to start" },
          ...tasks.map(task => h(Button, {
            key: task.id, id: task.id, className: "simple-home-task", type: "button",
            "aria-label": task.title, disabled: currentBusy, onClick: task.onClick,
          }, h("span", { className: "simple-home-art", "aria-hidden": true },
            ...["light", "dark"].map(theme => h("span", {
              key: theme, "data-home-art-theme": theme,
              dangerouslySetInnerHTML: { __html: artwork[task.illustration][theme]
                .replaceAll('id="', 'id="home-' + task.illustration + '-' + theme + '-')
                .replaceAll('url(#', 'url(#home-' + task.illustration + '-' + theme + '-')
                .replaceAll('aria-labelledby="' + task.illustration + '-title ' + task.illustration + '-description"',
                  'aria-hidden="true" focusable="false"') },
            }))),
          h("span", { className: "simple-home-task-copy" },
            h("span", { className: "simple-home-task-title" }, task.title),
            h("span", { className: "simple-home-task-description" }, task.description)))))),
      h("section", { className: "simple-home-recent", "aria-labelledby": "recent-apps-title" },
        h(SectionHeader, {
          className: "simple-home-recent-heading",
          title: h("span", { id: "recent-apps-title" }, "Get back to your app"),
          actions: h(Button, { className: "simple-home-browse", type: "button", appearance: "subtle", icon: h(SymbolIcon, { name: "forward", size: 16 }), iconPosition: "after", disabled: currentBusy, onClick: onOpen }, "Browse apps"),
        }),
        h(FilterToolbar, { className: "simple-home-search-toolbar", search: {
          id: "recent-app-search", className: "simple-home-search", type: "search",
          "aria-label": "Find a recent app", placeholder: "Find a recent app", "aria-controls": "recent-app-results",
          value: query, onChange: (_, data) => setQuery(data.value),
          disabled: currentBusy || currentApps === null || Boolean(currentError),
        } }),
        h("div", { className: "simple-home-results", id: "recent-app-results", "aria-live": "polite" },
        currentError
          ? h("p", { role: "status" }, "Recent apps could not be refreshed. Use Open an app to retry.")
          : currentApps === null
            ? h("p", null, "Recent apps have not been loaded. Use Open an app to find your existing apps.")
            : currentApps.length === 0
              ? h("p", null, "No recently viewed apps were found.")
              : visibleApps.length === 0
                ? h("p", { role: "status" }, "No recent apps match. Try a different name or path.")
                : h(AppList, { apps: visibleApps, inventory: currentInventory || currentApps,
                  itemAttribute: "data-recent-app", appHref, onOpen: onOpenRecent,
                  onCopyPath, onRename, onDelete, disabled: currentBusy }))),
      h("aside", { className: "simple-home-help", "aria-label": "App guidance" },
        h(Disclosure, { title: "How apps work", keepMounted: true },
          h("div", { className: "simple-home-questions" },
            ...questions.map(([title, answer]) => h(Disclosure, { key: title, title, keepMounted: true },
              h("p", null, answer)))))));
  }
  return mountCanvasComponent(element, AppPlatformHome);
}
