export function createRunWorkspace({
  container,
  renderTry,
  renderServices,
  renderOutput,
  renderOperations,
  renderDeployment,
  onConnection,
}) {
  const expanded = new Map();
  let selectedTab = "output";
  let lastState;
  let failures = 0;
  let operationCount = 0;
  let outputError = "";

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
    if (failures) return failures + " failed";
    return operationCount ? operationCount + " recorded" : "No activity";
  }

  function deploymentSummary(state, readiness) {
    if (state === "provisioning") return "Provisioning…";
    if (state === "deploying") return "Deploying…";
    return readiness?.deploymentBlocker ? "Setup needed" : "Azure";
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

  function activateTab(shell, id, { focus = false } = {}) {
    if (!["services", "output", "operations", "deployment"].includes(id)) return;
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
      const focusedPanel = active?.closest?.("[data-run-panel]")?.dataset.runPanel;
      const focusedTab = active?.closest?.("[data-run-tab]")?.dataset.runTab;
      const label = active?.getAttribute("aria-label");
      const key = active?.getAttribute("data-action-key");
      const content = ["BUTTON", "SUMMARY"].includes(active?.tagName) ? active.textContent : null;
      const selection = hadFocus && typeof active.selectionStart === "number"
        ? [active.selectionStart, active.selectionEnd] : null;
      const scrollTop = container.scrollTop;
      const nested = [...container.querySelectorAll("[data-run-disclosure]")]
        .map((node) => [node.dataset.runDisclosure, node.open]);
      const scrolling = [...container.querySelectorAll("[data-run-scroll-key]")].map((node) => [
        node.dataset.runScrollKey,
        node.scrollTop,
        node.scrollHeight - node.scrollTop - node.clientHeight < 40,
      ]);
      lastState = state;

      container.replaceChildren();
      const shell = text(container, "div", "", "run-workspace");
      const heading = text(shell, "div", "", "run-heading");
      text(heading, "h2", "Try your app");
      const connected = Boolean(readiness?.gatewayConfigured);
      const action = readiness && !connected ? "Connect AI Gateway" : "Connection settings";
      const connection = text(heading, "button", "", "run-connection");
      text(connection, "span", action, "run-connection-action");
      const value = text(connection, "span", connected
        ? (readiness.model || "Model connected") + " · " + (readiness.activeGateway?.name || "AI Gateway")
        : readiness ? "No AI Gateway connected" : "Checking model connection...", "run-connection-value");
      value.id = "run-connection-value";
      connection.type = "button";
      connection.setAttribute("aria-label", action);
      connection.setAttribute("aria-describedby", value.id);
      connection.title = action + ": " + value.textContent;
      connection.dataset.connected = String(connected);
      connection.addEventListener("click", onConnection);
      renderTry(text(shell, "div", "", "run-primary"));

      const support = text(shell, "div", "", "run-support");
      const tablist = text(support, "div", "", "run-tabs studio-tabs");
      tablist.setAttribute("role", "tablist");
      tablist.setAttribute("aria-label", "Run details");
      const tabs = {
        output: createTab(tablist, "output", "Output"),
        services: createTab(tablist, "services", "Services"),
        operations: createTab(tablist, "operations", "Operations"),
        deployment: createTab(tablist, "deployment", "Deploy"),
      };
      const expected = services.filter((service) => service.expected !== false);
      const ready = expected.filter((service) => service.ready).length;
      setTabSummary(tabs.services, expected.length ? ready + "/" + expected.length + " ready" : "Components");
      setTabSummary(tabs.output, outputSummary(state), Boolean(outputError));
      setTabSummary(tabs.operations, operationsSummary(), Boolean(failures));
      setTabSummary(tabs.deployment, deploymentSummary(state, readiness),
        Boolean(readiness?.deploymentBlocker));

      const panels = text(support, "div", "", "run-tab-panels");
      createPanel(panels, "output", renderOutput);
      createPanel(panels, "services", renderServices);
      createPanel(panels, "operations", renderOperations);
      createPanel(panels, "deployment", renderDeployment);
      activateTab(shell, selectedTab);

      for (const [id, open] of nested) {
        const node = container.querySelector('[data-run-disclosure="' + id + '"]');
        if (node) node.open = open;
      }
      for (const [id, top, following] of scrolling) {
        const node = container.querySelector('[data-run-scroll-key="' + id + '"]');
        if (node) node.scrollTop = following ? node.scrollHeight : top;
      }
      container.scrollTop = scrollTop;
      if (hadFocus) {
        const replacement = [...container.querySelectorAll("button, input, textarea, select, summary")]
          .find((node) => !node.disabled && !node.closest("[hidden]") && (key ? node.dataset.actionKey === key
            : label ? node.getAttribute("aria-label") === label : content && node.textContent === content));
        if (replacement) {
          replacement.focus({ preventScroll: true });
          if (selection && replacement.setSelectionRange) replacement.setSelectionRange(...selection);
        } else if (focusedTab || focusedPanel) {
          const fallback = container.querySelector('[data-run-tab="' + (focusedTab || focusedPanel || selectedTab) + '"]');
          fallback?.focus({ preventScroll: true });
          queueMicrotask(() => fallback?.isConnected && fallback.focus({ preventScroll: true }));
        }
      }
    },
    diagnostics({ failures: count = 0, operations = operationCount, error = "" } = {}) {
      failures = count;
      operationCount = operations;
      outputError = error;
      const outputTab = container.querySelector('[data-run-tab="output"]');
      const operationsTab = container.querySelector('[data-run-tab="operations"]');
      if (outputTab) setTabSummary(outputTab, outputSummary(lastState), Boolean(outputError));
      if (operationsTab) setTabSummary(operationsTab, operationsSummary(), Boolean(failures));
    },
    selectedTab() {
      return selectedTab;
    },
  };
}
