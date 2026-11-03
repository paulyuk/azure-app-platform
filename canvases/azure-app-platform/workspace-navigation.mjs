export function createWorkspaceNavigationComponent(toolkit) {
  const { createElement: h, useEffect, useRef, CanvasShell, CanvasHeader } = toolkit;
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
    current, items, appTitle, utilities, content, defaultCollapsed,
    onNavigate, onCollapsedChange, onReady, onHome,
  }) {
    useEffect(() => { onReady(); }, [onReady]);
    return h(CanvasShell, {
      id: "studio-workspace-navigation",
      defaultNavigationCollapsed: defaultCollapsed,
      onNavigationCollapsedChange: onCollapsedChange,
      header: h(CanvasHeader, {
        variant: "workbench", title: "Azure App Platform",
        icon: h("img", { src: "/assets/app-platform-symbol.png", alt: "" }),
        onHome, homeButton: { "aria-label": "App home" },
        context: h(RetainedContent, { element: appTitle }),
        contextVisibility: "always",
        browse: {
          id: "browse-workspaces", "aria-label": "Browse app workspaces",
          title: "Browse app workspaces", "aria-controls": "app-workspace-navigation", "aria-expanded": false,
        },
        actions: h(RetainedContent, { element: utilities }),
      }),
      navigation: {
        id: "app-workspace-navigation", label: "App workspaces", title: "App workspaces",
        items, current, onNavigate,
        closeLabel: "Close workspace menu", collapseLabel: "Collapse workspace sidebar",
      },
    }, h(RetainedContent, { element: content, className: "studio-workspace-content" }));
  };
}
