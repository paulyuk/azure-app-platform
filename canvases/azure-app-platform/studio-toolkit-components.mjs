export const STUDIO_FILTERABLE_DROPDOWN_CSS = `
  .studio-filterable-dropdown { display:block; min-width:0; width:100%; font-weight:400; color:var(--studio-ink); }
  .studio-filterable-dropdown > .ct-provider { display:block; min-width:0; width:100%; }
  :is(#details, #workspace-diagnostics, .studio-settings) .studio-filterable-dropdown .ct-combobox.ct-combobox {
    box-sizing:border-box; display:inline-flex; align-items:center; justify-content:space-between; gap:8px;
    width:100%; min-width:0; min-height:34px; padding:6px 10px;
    border:1px solid var(--studio-line); border-radius:var(--studio-control-radius, 6px);
    background:var(--studio-raised); color:var(--studio-ink);
    font:400 13px/1.4 var(--font-sans, system-ui, sans-serif);
    overflow-wrap:anywhere; text-align:left; white-space:normal;
  }
  :is(#details, #workspace-diagnostics, .studio-settings) .studio-filterable-dropdown .ct-combobox.ct-combobox:hover:not(:disabled),
  :is(#details, #workspace-diagnostics, .studio-settings) .studio-filterable-dropdown .ct-combobox.ct-combobox[aria-expanded="true"] {
    border-color:var(--studio-accent); background:var(--studio-raised); color:var(--studio-ink);
  }
  :is(#details, #workspace-diagnostics, .studio-settings) .studio-filterable-dropdown .ct-combobox.ct-combobox:focus-visible {
    outline:2px solid var(--studio-focus); outline-offset:2px;
  }
  .studio-filterable-dropdown .ct-combobox > svg { flex:none; width:16px; height:16px; color:var(--studio-muted); }
  .studio-filterable-dropdown .ct-select-panel {
    box-sizing:border-box; padding:0;
    width:min(560px, calc(100vw - 24px)); width:anchor-size(width, min(560px, calc(100vw - 24px)));
    max-width:calc(100vw - 24px);
    border:1px solid var(--studio-line); border-radius:var(--studio-surface-radius, 8px);
    background:var(--studio-raised); color:var(--studio-ink);
    font:400 13px/1.45 var(--font-sans, system-ui, sans-serif);
    box-shadow:0 8px 24px rgb(0 0 0 / .18);
  }
  .studio-filterable-dropdown .ct-select-panel[data-placement^="below"] { margin-top:4px !important; }
  .studio-filterable-dropdown .ct-select-panel[data-placement^="above"] { margin-bottom:4px !important; }
  .studio-filterable-dropdown .ct-select-panel-heading {
    padding:10px 12px 6px; color:var(--studio-ink);
    font:600 12px/1.4 var(--font-sans, system-ui, sans-serif);
  }
  .studio-filterable-dropdown .ct-select-search-row { position:relative; margin:0 8px 8px; }
  .studio-filterable-dropdown .ct-select-search-row > svg {
    position:absolute; top:50%; left:10px; transform:translateY(-50%);
    width:16px; height:16px; color:var(--studio-muted); pointer-events:none;
  }
  .studio-filterable-dropdown .ct-provider .ct-select-search.ct-input {
    box-sizing:border-box; width:100%; min-width:0; min-height:32px;
    padding:5px 8px 5px 32px;
    border:1px solid var(--studio-line); border-radius:var(--studio-control-radius, 6px);
    background:var(--studio-panel); color:var(--studio-ink);
    font:400 12px/1.4 var(--font-sans, system-ui, sans-serif);
  }
  .studio-filterable-dropdown .ct-provider .ct-select-search.ct-input::placeholder { color:var(--studio-muted); }
  .studio-filterable-dropdown .ct-provider .ct-select-search.ct-input:focus,
  .studio-filterable-dropdown .ct-provider .ct-select-search.ct-input:focus-visible {
    border-color:var(--studio-focus); box-shadow:inset 0 0 0 1px var(--studio-focus); outline:none;
  }
  .studio-filterable-dropdown .ct-select-options { padding:4px; border-top:1px solid var(--studio-line); }
  .studio-filterable-dropdown .ct-select-option {
    align-items:flex-start; min-height:32px; padding:6px 8px; border-radius:var(--studio-control-radius, 4px);
    color:var(--studio-ink); font:400 13px/1.4 var(--font-sans, system-ui, sans-serif);
  }
  .studio-filterable-dropdown .ct-select-option:hover,
  .studio-filterable-dropdown .ct-select-option:focus,
  .studio-filterable-dropdown .ct-select-option[data-activedescendant] {
    background:var(--studio-panel);
  }
  .studio-filterable-dropdown .ct-select-option[data-selected] { background:var(--studio-accent-soft); }
  .studio-filterable-dropdown .ct-option-check {
    display:inline-flex; align-items:center; justify-content:center; height:18px; color:var(--studio-accent);
  }
  .studio-filterable-dropdown .ct-option-label { color:var(--studio-ink); font-weight:400; line-height:1.4; }
  .studio-filterable-dropdown .ct-select-option[data-selected] .ct-option-label { font-weight:600; }
  .studio-filterable-dropdown .ct-option-description,
  .studio-filterable-dropdown .ct-select-empty {
    color:var(--studio-muted); font-size:11px; font-weight:400; line-height:1.4;
  }
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
