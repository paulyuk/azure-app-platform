export function createRunWorkspace({
  container,
  renderTry,
  renderServices,
  renderEnvironment,
  renderOutput,
  renderOperations,
  buttons,
  onClear = () => {},
}) {
  const disclosures = new Map();
  const scrolling = new Map();
  const selections = new Map();
  let selectedTab = "output";
  let lastState;
  let failures = 0;
  let operationCount = 0;
  let outputError = "";
  let diagnosticsOpen = false;
  let diagnosticsHeight = 240;
  let toggle;
  let drag;
  const listeners = new AbortController();

  function restoreScrolling(root = container) {
    for (const [id, [top, following]] of scrolling) {
      const node = root.querySelector('[data-run-scroll-key="' + id + '"]');
      if (node?.getClientRects().length) node.scrollTop = following ? node.scrollHeight : top;
    }
  }

  function sizeDiagnostics(height = diagnosticsHeight, remember = false) {
    const shell = container.querySelector(".run-workspace");
    if (!shell) return;
    const maximum = Math.max(0, Math.min(560, Math.floor(shell.clientHeight * .55)));
    const minimum = Math.min(120, maximum);
    const size = Math.round(Math.max(minimum, Math.min(maximum, height)));
    if (remember) diagnosticsHeight = size;
    shell.style.setProperty("--diagnostics-height", size + "px");
    const separator = shell.querySelector(".run-diagnostics-resizer");
    separator.setAttribute("aria-valuemin", String(minimum));
    separator.setAttribute("aria-valuemax", String(maximum));
    separator.setAttribute("aria-valuenow", String(size));
    separator.setAttribute("aria-valuetext", size + " pixels high");
  }

  function syncDiagnostics() {
    const shell = container.querySelector(".run-workspace");
    if (!shell) return;
    const support = shell.querySelector(".run-support");
    const separator = shell.querySelector(".run-diagnostics-resizer");
    if (!diagnosticsOpen && (support.contains(document.activeElement) || separator === document.activeElement)) {
      toggle.focus({ preventScroll: true });
    }
    support.hidden = !diagnosticsOpen;
    separator.hidden = !diagnosticsOpen;
    shell.dataset.diagnostics = diagnosticsOpen ? "open" : "closed";
    buttons.update(toggle, {
      children: diagnosticsOpen ? "Hide Diagnostics" : "Show Diagnostics",
      "aria-expanded": diagnosticsOpen,
    });
    const issues = [
      outputError && "Logs unavailable: " + outputError,
      failures > 0 && failures + (failures === 1 ? " failed operation" : " failed operations") + " in Operations.",
    ].filter(Boolean).join(" ");
    const status = shell.querySelector("#diagnostics-status");
    if (status.textContent !== issues) status.textContent = issues;
    status.hidden = !issues;
    sizeDiagnostics();
  }

  function setDiagnosticsOpen(open) {
    capture();
    diagnosticsOpen = open;
    syncDiagnostics();
    if (open) restoreScrolling();
  }

  function finishResize(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const pointerId = drag.pointerId;
    drag = null;
    container.classList.remove("resizing-diagnostics");
    if (container.hasPointerCapture(pointerId)) container.releasePointerCapture(pointerId);
  }
  container.addEventListener("pointermove", event => {
    if (drag?.pointerId === event.pointerId) sizeDiagnostics(drag.height + drag.startY - event.clientY, true);
  }, { signal: listeners.signal });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    container.addEventListener(name, finishResize, { signal: listeners.signal });
  }
  const resizeObserver = new ResizeObserver(() => sizeDiagnostics());
  resizeObserver.observe(container);

  function capture() {
    for (const node of container.querySelectorAll("[data-run-disclosure]")) {
      disclosures.set(node.dataset.runDisclosure, node.open);
    }
    for (const node of container.querySelectorAll("[data-run-scroll-key]")) {
      if (!node.getClientRects().length) continue;
      scrolling.set(node.dataset.runScrollKey, [
        node.scrollTop,
        node.dataset.runScrollKey === "output" && node.scrollHeight - node.scrollTop - node.clientHeight < 40,
      ]);
    }
    for (const node of container.querySelectorAll("textarea[aria-label]")) {
      selections.set(node.getAttribute("aria-label"), [node.selectionStart, node.selectionEnd, node.scrollTop]);
    }
  }

  function text(parent, tag, content, className = "") {
    const node = document.createElement(tag);
    node.textContent = content;
    node.className = className;
    parent.append(node);
    return node;
  }

  function outputSummary(state) {
    if (outputError) return "Unavailable";
    return {
      starting: "Starting…",
      failed: "Needs review",
      provisioning: "Provisioning…",
      deploying: "Deploying…",
    }[state] || "Live logs";
  }

  function operationsSummary() {
    return operationCount ? operationCount + " recorded" : "No activity";
  }

  function setTabSummary(tab, summary, attention = false) {
    const summaryNode = tab.querySelector(".run-tab-summary");
    summaryNode.textContent = summary;
    summaryNode.dataset.attention = String(attention);
    const label = tab.querySelector(".run-tab-label").textContent;
    summaryNode.id = tab.id + "-summary";
    tab.setAttribute("aria-label", label);
    tab.setAttribute("aria-describedby", summaryNode.id);
  }

  function activateTab(shell, id, { focus = false, captureState = true } = {}) {
    if (!["services", "environment", "output", "operations"].includes(id)) return;
    if (captureState) capture();
    selectedTab = id;
    for (const tab of shell.querySelectorAll('[role="tab"]')) {
      const selected = tab.dataset.runTab === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus({ preventScroll: true });
    }
    for (const panel of shell.querySelectorAll('[role="tabpanel"]')) {
      panel.hidden = panel.dataset.runPanel !== id;
    }
    restoreScrolling(shell);
  }

  function createTab(tablist, id, label, iconId = id) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "run-tab-" + id;
    tab.className = "run-tab studio-tab";
    tab.dataset.runTab = id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", "run-panel-" + id);
    const main = text(tab, "span", "", "studio-tab-main");
    const icon = text(main, "span", "", "studio-tab-icon studio-tab-icon--" + iconId);
    icon.setAttribute("aria-hidden", "true");
    text(main, "span", label, "run-tab-label studio-tab-label");
    text(tab, "span", "", "run-tab-summary studio-tab-summary");
    tab.addEventListener("click", () => activateTab(tablist.parentElement, id));
    tab.addEventListener("keydown", (event) => {
      const tabs = [...tablist.querySelectorAll('[role="tab"]')];
      const current = tabs.indexOf(event.currentTarget);
      const rtl = getComputedStyle(tablist).direction === "rtl";
      let next = null;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (event.key === "ArrowRight") next = (current + (rtl ? -1 : 1) + tabs.length) % tabs.length;
      if (event.key === "ArrowLeft") next = (current + (rtl ? 1 : -1) + tabs.length) % tabs.length;
      if (next == null) return;
      event.preventDefault();
      activateTab(tablist.parentElement, tabs[next].dataset.runTab, { focus: true });
    });
    tablist.append(tab);
    return tab;
  }

  function createPanel(parent, id, render) {
    const panel = document.createElement("section");
    panel.id = "run-panel-" + id;
    panel.className = "run-tab-panel studio-tab-panel";
    panel.dataset.runPanel = id;
    panel.dataset.runScrollKey = "panel-" + id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "run-tab-" + id);
    panel.tabIndex = 0;
    parent.append(panel);
    render(panel);
    return panel;
  }

  return {
    render({ state, readiness, services = [] }) {
      const active = document.activeElement;
      const hadFocus = container.contains(active);
      const focusedTester = hadFocus && Boolean(active?.closest?.(".agent-tester"));
      const focusedPanel = active?.closest?.("[data-run-panel]")?.dataset.runPanel;
      const focusedTab = active?.closest?.("[data-run-tab]")?.dataset.runTab;
      const label = active?.getAttribute("aria-label");
      const key = active?.getAttribute("data-action-key");
      const scrollKey = active?.getAttribute("data-run-scroll-key");
      const content = ["BUTTON", "SUMMARY"].includes(active?.tagName) ? active.textContent : null;
      const selection = hadFocus && typeof active.selectionStart === "number"
        ? [active.selectionStart, active.selectionEnd] : null;
      const scrollTop = container.scrollTop;
      capture();
      finishResize();
      lastState = state;

      onClear(container);
      container.replaceChildren();
      const shell = text(container, "div", "", "run-workspace");
      const connected = Boolean(readiness?.gatewayConfigured);
      const primary = text(shell, "div", "", "run-primary");
      primary.dataset.runScrollKey = "primary";
      renderTry(primary);

      const toolbar = text(shell, "div", "", "run-diagnostics-toolbar");
      const status = text(toolbar, "span", "", "run-diagnostics-status");
      status.id = "diagnostics-status";
      status.setAttribute("role", "status");
      toggle = buttons.create({
        id: "run-diagnostics-toggle", appearance: "subtle", children: "Show Diagnostics",
        "aria-controls": "run-diagnostics", "aria-describedby": "diagnostics-status",
        onClick: () => setDiagnosticsOpen(!diagnosticsOpen),
      });
      buttons.append(toolbar, toggle);
      const separator = text(shell, "div", "", "run-diagnostics-resizer");
      separator.setAttribute("role", "separator");
      separator.setAttribute("aria-label", "Resize Diagnostics");
      separator.setAttribute("aria-orientation", "horizontal");
      separator.setAttribute("aria-controls", "run-diagnostics");
      separator.tabIndex = 0;
      separator.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        event.preventDefault();
        separator.focus({ preventScroll: true });
        drag = { pointerId: event.pointerId, startY: event.clientY, height: Number(separator.getAttribute("aria-valuenow")) };
        container.setPointerCapture(event.pointerId);
        container.classList.add("resizing-diagnostics");
      });
      separator.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setDiagnosticsOpen(false);
          return;
        }
        const height = Number(separator.getAttribute("aria-valuenow"));
        const next = event.key === "ArrowUp" ? height + (event.shiftKey ? 48 : 24)
          : event.key === "ArrowDown" ? height - (event.shiftKey ? 48 : 24)
            : event.key === "Home" ? 0 : event.key === "End" ? Infinity : null;
        if (next === null) return;
        event.preventDefault();
        sizeDiagnostics(next, true);
      });

      const support = text(shell, "div", "", "run-support");
      support.id = "run-diagnostics";
      support.setAttribute("role", "region");
      support.setAttribute("aria-label", "Diagnostics");
      support.addEventListener("keydown", event => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        setDiagnosticsOpen(false);
      });
      const tablist = text(support, "div", "", "run-tabs studio-tabs");
      tablist.setAttribute("role", "tablist");
      tablist.setAttribute("aria-label", "Run details");
      const tabs = {
        output: createTab(tablist, "output", "Output"),
        services: createTab(tablist, "services", "Services"),
        ...(renderEnvironment ? { environment: createTab(tablist, "environment", "Environment") } : {}),
        operations: createTab(tablist, "operations", "Operations"),
      };
      const expected = services.filter((service) => service.expected !== false);
      const ready = expected.filter((service) => service.ready).length;
      setTabSummary(tabs.services, expected.length ? ready + "/" + expected.length + " ready" : "Components");
      if (tabs.environment) {
        const prereqReady = readiness?.prerequisites ? readiness.prerequisites.ready : true;
        const configuring = state === "configuring" || readiness?.activeGateway?.configurationStatus === "configuring";
        const envSummary = !prereqReady
          ? "Missing CLI"
          : configuring
            ? "Applying…"
            : connected
              ? (readiness?.sandboxGroup?.name ? "Gateway + Sandbox" : "Gateway ready")
              : "Setup needed";
        setTabSummary(tabs.environment, envSummary, !configuring && (!prereqReady || !connected));
      }
      setTabSummary(tabs.output, outputSummary(state), Boolean(outputError));
      setTabSummary(tabs.operations, operationsSummary(), false);

      const panels = text(support, "div", "", "run-tab-panels");
      createPanel(panels, "output", renderOutput);
      createPanel(panels, "services", renderServices);
      if (renderEnvironment) createPanel(panels, "environment", renderEnvironment);
      createPanel(panels, "operations", renderOperations);
      activateTab(shell, selectedTab, { captureState: false });
      syncDiagnostics();

      for (const [id, open] of disclosures) {
        const node = container.querySelector('[data-run-disclosure="' + id + '"]');
        if (node) node.open = open;
      }
      restoreScrolling();
      container.scrollTop = scrollTop;
      for (const node of container.querySelectorAll("textarea[aria-label]")) {
        const previous = selections.get(node.getAttribute("aria-label"));
        if (previous) {
          node.setSelectionRange(previous[0], previous[1]);
          node.scrollTop = previous[2];
        }
      }
      if (hadFocus) {
        const replacement = [...container.querySelectorAll("button, input, textarea, select, summary, [data-run-scroll-key][tabindex], [role='separator']")]
          .find((node) => !node.disabled && !node.closest("[hidden]") && (key ? node.dataset.actionKey === key
            : label ? node.getAttribute("aria-label") === label
              : scrollKey ? node.dataset.runScrollKey === scrollKey : content && node.textContent === content));
        if (replacement) {
          replacement.focus({ preventScroll: true });
          if (selection && replacement.setSelectionRange) replacement.setSelectionRange(...selection);
        } else if (focusedTester) {
          container.querySelector(".agent-response")?.focus({ preventScroll: true });
        } else if (focusedTab || focusedPanel) {
          const fallback = container.querySelector('[data-run-tab="' + (focusedTab || focusedPanel || selectedTab) + '"]');
          fallback?.focus({ preventScroll: true });
          queueMicrotask(() => fallback?.isConnected && fallback.focus({ preventScroll: true }));
        }
      }
    },
    capture,
    diagnostics({ failures: count = 0, operations = operationCount, error = "" } = {}) {
      failures = count;
      operationCount = operations;
      outputError = error;
      const outputTab = container.querySelector('[data-run-tab="output"]');
      const operationsTab = container.querySelector('[data-run-tab="operations"]');
      if (outputTab) setTabSummary(outputTab, outputSummary(lastState), Boolean(outputError));
      if (operationsTab) setTabSummary(operationsTab, operationsSummary(), false);
      syncDiagnostics();
    },
    openDiagnostics(tab = selectedTab) {
      setDiagnosticsOpen(true);
      const shell = container.querySelector(".run-workspace");
      if (shell) activateTab(shell, tab, { focus: true });
    },
    dispose() {
      finishResize();
      listeners.abort();
      resizeObserver.disconnect();
    },
    selectedTab() {
      return selectedTab;
    },
  };
}
