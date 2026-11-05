export const STUDIO_FILTERABLE_DROPDOWN_CSS = `
  .studio-filterable-dropdown { display:block; min-width:0; width:100%; font-weight:400; }
  .studio-filterable-dropdown > .ct-provider { display:block; min-width:0; width:100%; }
  #details .studio-filterable-dropdown .ct-combobox,
  .studio-settings .studio-filterable-dropdown .ct-combobox {
    width:100%; min-width:0; min-height:34px; justify-content:space-between;
    overflow-wrap:anywhere; text-align:left; white-space:normal;
  }
  .studio-filterable-dropdown .ct-combobox > svg { flex:none; }
`;

export function createStudioToolkitComponents(toolkit) {
  const { mountCanvasComponent, SelectPanel } = toolkit;
  if (typeof mountCanvasComponent !== "function" || !SelectPanel) {
    throw new TypeError("The canvas toolkit filterable dropdown is unavailable.");
  }
  const views = new Map();

  function createFilterableDropdown({
    ariaLabel,
    title = ariaLabel,
    searchPlaceholder = "Filter options",
    placeholder = "Select an option",
    options = [],
    value = "",
    disabled = false,
    onChange = () => {},
  }) {
    if (!ariaLabel) throw new TypeError("A filterable dropdown accessible name is required.");
    const element = document.createElement("span");
    element.className = "studio-filterable-dropdown";
    element.dataset.filterableDropdown = "";
    const state = {
      options: [...options],
      value: String(value || ""),
      disabled: Boolean(disabled),
      onChange,
    };
    let disposed = false;
    let handle;

    const selectedOptions = () => state.value ? [state.value] : [];
    const updateHandle = () => handle.update({
      options: state.options,
      selectedOptions: selectedOptions(),
      disabled: state.disabled,
    });
    const view = {
      element,
      get value() { return state.value; },
      set value(nextValue) {
        state.value = String(nextValue || "");
        updateHandle();
      },
      get disabled() { return state.disabled; },
      set disabled(nextDisabled) {
        state.disabled = Boolean(nextDisabled);
        updateHandle();
      },
      update(next = {}) {
        if ("options" in next) state.options = [...next.options];
        if ("value" in next) state.value = String(next.value || "");
        if ("disabled" in next) state.disabled = Boolean(next.disabled);
        if ("onChange" in next) state.onChange = next.onChange;
        updateHandle();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        views.delete(element);
        handle.dispose();
      },
    };

    handle = mountCanvasComponent(element, SelectPanel, {
      options: state.options,
      selectedOptions: selectedOptions(),
      disabled: state.disabled,
      placeholder,
      title,
      searchPlaceholder,
      "aria-label": ariaLabel,
      onOptionSelect: (event, data) => {
        const nextValue = data.selectedOptions.at(-1) || "";
        if (nextValue === state.value) return;
        state.value = nextValue;
        handle.update({ selectedOptions: selectedOptions() });
        state.onChange(nextValue, event);
      },
    });
    Object.defineProperties(element, {
      value: {
        configurable: true,
        get: () => view.value,
        set: nextValue => { view.value = nextValue; },
      },
      disabled: {
        configurable: true,
        get: () => view.disabled,
        set: nextDisabled => { view.disabled = nextDisabled; },
      },
      update: { configurable: true, value: next => view.update(next) },
      dispose: { configurable: true, value: () => view.dispose() },
    });
    views.set(element, view);
    return element;
  }

  function clear(element) {
    for (const [mount, view] of [...views]) {
      if (mount === element || element.contains(mount)) view.dispose();
    }
  }

  return {
    createFilterableDropdown,
    clear,
    dispose() {
      for (const view of [...views.values()]) view.dispose();
    },
  };
}
