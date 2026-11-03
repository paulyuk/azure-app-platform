export function mountStudioHeader(element, { toolkit, utilities, onHome }) {
  const { createElement: h, mountCanvasComponent, CanvasHeader, useRef, useEffect } = toolkit;
  function Utilities() {
    const ref = useRef(null);
    useEffect(() => {
      ref.current.append(utilities);
      return () => utilities.remove();
    }, []);
    return h("div", { ref });
  }
  return mountCanvasComponent(element, () => h(CanvasHeader, {
    title: "Azure App Platform", onHome,
    homeButton: { "aria-label": "App home", style: { fontWeight: 400 } },
    icon: h("img", {
      src: "/assets/app-platform-symbol.png", width: 20, height: 20, alt: "", "aria-hidden": true,
      style: { display: "block", objectFit: "contain" },
    }),
    actions: h(Utilities),
  }));
}
