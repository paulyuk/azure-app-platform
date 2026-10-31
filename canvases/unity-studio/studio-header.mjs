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
    title: "Unity", onHome,
    homeButton: { "aria-label": "Unity Studio home", style: { fontWeight: 400 } },
    icon: h("img", {
      src: "/assets/unity-symbol.png", width: 20, height: 20, alt: "", "aria-hidden": true,
      style: { display: "block", objectFit: "contain" },
    }),
    actions: h(Utilities),
  }));
}
