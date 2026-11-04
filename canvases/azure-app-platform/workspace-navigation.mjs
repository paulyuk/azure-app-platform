export function createWorkspaceNavigationComponent(toolkit) {
  const { createElement: h, useEffect, useRef, Fragment, CanvasShell, CanvasHeader, NavigationControls, Button } = toolkit;
  function RetainedContent({ element, className }) {
    const host = useRef(null);
    useEffect(() => {
      const parent = element.parentNode;
      const anchor = element.ownerDocument.createComment("Retained workspace content");
      parent.insertBefore(anchor, element);
      host.current.append(element);
      return () => {
        anchor.replaceWith(element);
      };
    }, [element]);
    return h("div", { ref: host, className });
  }
  return function WorkspaceNavigation({
    current, items, appTitle, utilities, content, history,
    onNavigate, onReady, onHome,
  }) {
    useEffect(() => { onReady(); }, [onReady]);
    return h(CanvasShell, {
      id: "studio-workspace-navigation",
      header: h(Fragment, null, h(CanvasHeader, {
        variant: "workbench", title: "Azure App Platform",
        icon: h("img", { src: "/assets/app-platform-symbol.png", alt: "" }),
        onHome, homeButton: { "aria-label": "App home" },
        context: h(RetainedContent, { element: appTitle }),
        contextVisibility: "always",
        history: h(NavigationControls, { ...history, variant: "browser", label: "Workspace history" }),
        actions: h(RetainedContent, { element: utilities }),
      }), h("div", { className: "workspace-navigation-bar" },
        h("nav", { id: "app-workspace-navigation", "aria-label": "App workspaces" },
          h("div", { className: "workspace-view-switch", role: "group", "aria-label": "Workspace view" },
            h("ul", null, items.map(item => h("li", { key: item.value },
              h(Button, {
                ...item.button, type: "button", size: "small",
                appearance: current === item.value ? "secondary" : "subtle",
                "aria-pressed": current === item.value,
                "aria-current": current === item.value ? "page" : undefined,
                onClick: event => onNavigate(event, item.value),
              }, item.label)))))),
        h(Button, {
          id: "build-app", type: "button", size: "small", appearance: "subtle",
          "aria-controls": "workspace-shell", "aria-current": current === "build" ? "page" : undefined,
          onClick: event => onNavigate(event, "build"),
        }, "Customize"))),
    }, h(RetainedContent, { element: content, className: "studio-workspace-content" }));
  };
}
