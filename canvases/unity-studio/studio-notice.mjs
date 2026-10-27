export function createStudioNotice({ loadToolkit, onError }) {
  let current;
  return {
    mount(element, props) {
      if (current?.element === element) return this.update(props);
      this.dispose();
      const state = { element, props: { ...props }, handle: null };
      current = state;
      void loadToolkit().then(({ mountCanvasComponent, MessageBar }) => {
        if (current !== state) return;
        state.handle = mountCanvasComponent(element, MessageBar, state.props);
      }).catch(cause => {
        if (current === state) onError(`Could not load the review notice: ${cause.message}`);
      });
    },
    update(props) {
      if (!current) throw new Error("Mount the review notice before updating it.");
      if (Object.entries(props).every(([key, value]) => Object.is(current.props[key], value))) return;
      current.props = { ...current.props, ...props };
      current.handle?.update(props);
    },
    dispose() {
      const previous = current;
      current = undefined;
      previous?.handle?.dispose();
    },
  };
}
