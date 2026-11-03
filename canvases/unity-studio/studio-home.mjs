export function mountStudioHome(element, { toolkit, onCreate, onOpen, onAssemble, onOpenRecent, recentApps = null, recentError = null }) {
  const { createElement: h, mountCanvasComponent, ActionCard, SectionHeader, WorkItem, Button, SymbolIcon } = toolkit;
  const tasks = [
    { id: "new-app", title: "Create a new app", description: "Start from a Sandboxes app template and customize.", icon: "code", onClick: onCreate },
    { id: "open-app", title: "Open an app", description: "Continue building, running, or managing an app.", icon: "file-code", onClick: onOpen },
    { id: "assemble-app", title: "Assemble existing projects", description: "Combine source projects, ACA Sandboxes, and Azure resources.", icon: "workflow", onClick: onAssemble },
  ];
  function UnityHome() {
    return h("div", { className: "simple-home" },
      h("style", null, `
        #studio-home { width: min(888px, 100vw); margin-inline-start: 50%; translate: -50% 0; }
        .simple-home { max-width: 888px; box-sizing: border-box; margin: 0 auto; padding: 24px; color: var(--canvas-fg); }
        .simple-home-start { display: grid; gap: 24px; container: simple-home / inline-size; }
        .simple-home-start > *, .simple-home-tasks > * { min-width: 0; }
        .simple-home-introduction h1 { margin: 0; font-size: var(--text-title-size, 20px); line-height: var(--text-title-line-height, 28px); font-weight: var(--font-weight-semibold, 600); }
        .simple-home-introduction p { margin: 8px 0 0; color: var(--canvas-muted); font-size: var(--canvas-body); line-height: 20px; font-weight: 400; }
        .simple-home-tasks { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
        .simple-home .simple-home-task.simple-home-task { min-height: 88px; height: 100%; }
        .simple-home .simple-home-task[data-default-selected="true"] {
          border-color: var(--studio-accent, #6b3fd6);
          box-shadow: 0 0 0 1px var(--studio-accent, #6b3fd6) inset;
          background: color-mix(in srgb, var(--studio-accent, #6b3fd6) 6%, var(--studio-raised, transparent));
        }
        .simple-home-recent { margin-top: 24px; }
        @container simple-home (min-width: 520px) { .simple-home-tasks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @container simple-home (min-width: 760px) { .simple-home-tasks { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      `),
      h("div", { className: "simple-home-start" },
        h("div", { className: "simple-home-introduction" },
          h("h1", null, "What would you like to do?"),
          h("p", null, "Start a new app, assemble existing projects, or continue working on an app you already have.")),
        h("div", { className: "simple-home-tasks" },
          ...tasks.map((task, index) => h(ActionCard, {
            key: task.id, id: task.id, className: "simple-home-task", type: "button",
            "data-default-selected": index === 0 ? "true" : undefined,
            title: task.title, description: task.description,
            icon: h(SymbolIcon, { name: task.icon }), compact: true, onClick: task.onClick,
          })))),
      h("section", { className: "simple-home-recent", "aria-labelledby": "recent-apps-title" },
        h(SectionHeader, { title: h("span", { id: "recent-apps-title" }, "Recently viewed") }),
        recentError
          ? h("p", { role: "status" }, "Recent apps could not be refreshed. Use Open an app to retry.")
          : recentApps === null
            ? h("p", null, "Recent apps have not been loaded. Use Open an app to find your existing apps.")
            : recentApps.length === 0
              ? h("p", null, "No recently viewed apps were found.")
              : recentApps.slice(0, 5).map(app => h(WorkItem, {
                key: app.path, title: app.name, description: app.path,
                icon: h(SymbolIcon, { name: "file-code" }),
                metadata: h("time", { dateTime: app.lastOpenedAt }, "Last opened " + new Date(app.lastOpenedAt).toLocaleString()),
                actions: h(Button, { type: "button", "data-recent-app": app.path, onClick: () => onOpenRecent(app.path), "aria-label": "Open " + app.name }, "Open"),
              }))));
  }
  return mountCanvasComponent(element, UnityHome);
}
