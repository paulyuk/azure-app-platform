export function mountStudioHome(element, { toolkit, onCreate, onOpen, onAssemble }) {
  const { createElement: h, mountCanvasComponent, FeaturePanel, SpotIllustration, Button, ActionCard, SectionHeader, SymbolIcon } = toolkit;
  function UnityHome() {
    return h("div", { style: { display: "grid", gap: 24 } },
      h("div", null,
        h("h1", { style: { fontSize: "var(--text-title-size, 20px)", lineHeight: "var(--text-title-line-height, 28px)", fontWeight: 600, marginBottom: 8 } }, "Build an app with Unity"),
        h("p", { style: { fontSize: "var(--canvas-body)", lineHeight: "var(--canvas-line)", color: "var(--canvas-muted)" } },
          "Start from a template or bring your existing pieces together.")),
      h(FeaturePanel, {
        title: "Create a new app",
        description: "Choose a starting point, describe its purpose, and review the app before creation.",
        illustration: h(SpotIllustration, { variant: "layers" }),
        actions: h(Button, { id: "new-app", type: "button", appearance: "primary", onClick: onCreate }, "Create"),
        headingLevel: 2,
      }),
      h("section", { "aria-labelledby": "other-ways-title" },
        h(SectionHeader, { title: h("span", { id: "other-ways-title" }, "Other ways to work") }),
        h("div", null,
          h(ActionCard, {
            id: "open-app", type: "button", title: "Open an app",
            description: "Continue building, running, or managing an app you already have.",
            icon: h(SymbolIcon, { name: "file-code" }),
            joined: true, compact: true, onClick: onOpen,
          }),
          h(ActionCard, {
            id: "assemble-app", type: "button", title: "Assemble existing pieces",
            description: "Combine source projects and optionally map Azure resources.",
            icon: h(SymbolIcon, { name: "workflow" }),
            joined: true, compact: true, onClick: onAssemble,
          }))));
  }
  return mountCanvasComponent(element, UnityHome);
}
