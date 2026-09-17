export function createRunWorkspace({ container, renderTry, renderServices, renderDeployment, renderDiagnostics, onConnection }) {
  const expanded = new Map();
  let lastState;
  let failures = 0;
  let outputError = "";

  function text(parent, tag, content, className = "") {
    const node = document.createElement(tag);
    node.textContent = content;
    node.className = className;
    parent.append(node);
    return node;
  }

  function disclosure(parent, id, title, summary, render) {
    const section = document.createElement("details");
    section.className = "run-section";
    section.dataset.runSection = id;
    section.open = expanded.get(id) || false;
    const heading = text(section, "summary", "");
    heading.setAttribute("aria-label", title);
    text(heading, "span", title, "run-section-title");
    const description = text(heading, "span", summary, "run-section-summary");
    if (id === "diagnostics") description.dataset.diagnosticSummary = "true";
    section.addEventListener("toggle", () => {
      if (section.isConnected) expanded.set(id, section.open);
    });
    const body = text(section, "div", "", "run-section-body");
    parent.append(section);
    render(body);
  }

  function diagnosticSummary() {
    return outputError ? "Output unavailable"
      : failures ? failures + " failed operation" + (failures === 1 ? "" : "s")
        : "Output & operations";
  }

  return {
    render({ state, readiness, services = [] }) {
      const active = document.activeElement;
      const hadFocus = container.contains(active);
      const label = active?.getAttribute("aria-label");
      const key = active?.getAttribute("data-action-key");
      const content = ["BUTTON", "SUMMARY"].includes(active?.tagName) ? active.textContent : null;
      const selection = hadFocus && typeof active.selectionStart === "number"
        ? [active.selectionStart, active.selectionEnd] : null;
      const scrollTop = container.scrollTop;
      const nested = [...container.querySelectorAll("[data-run-disclosure]")]
        .map((node) => [node.dataset.runDisclosure, node.open]);
      for (const section of container.querySelectorAll("[data-run-section]")) {
        expanded.set(section.dataset.runSection, section.open);
      }
      if (state !== lastState && ["starting", "failed", "provisioning", "deploying"].includes(state)) {
        expanded.set("diagnostics", true);
      }
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
      const sections = text(shell, "div", "", "run-sections");
      const expected = services.filter((service) => service.expected !== false);
      const ready = expected.filter((service) => service.ready).length;
      disclosure(sections, "services", "Services",
        expected.length ? ready + " of " + expected.length + " ready" : "Components & endpoints", renderServices);
      disclosure(sections, "diagnostics", "Diagnostics", diagnosticSummary(), renderDiagnostics);
      disclosure(sections, "deployment", "Deploy to Azure",
        ["provisioning", "deploying"].includes(state) ? state === "provisioning" ? "Provisioning..." : "Deploying..."
          : readiness?.deploymentBlocker ? "Setup needed" : "Provision & deploy", renderDeployment);
      this.diagnostics({ failures, error: outputError });
      for (const [id, open] of nested) {
        const node = container.querySelector('[data-run-disclosure="' + id + '"]');
        if (node) node.open = open;
      }
      container.scrollTop = scrollTop;
      if (hadFocus) {
        const replacement = [...container.querySelectorAll("button, input, textarea, select, summary")]
          .find((node) => !node.disabled && (key ? node.dataset.actionKey === key
            : label ? node.getAttribute("aria-label") === label : content && node.textContent === content));
        if (replacement) {
          replacement.focus({ preventScroll: true });
          if (selection && replacement.setSelectionRange) replacement.setSelectionRange(...selection);
        }
      }
    },
    diagnostics({ failures: count = 0, error = "" } = {}) {
      failures = count;
      outputError = error;
      const summary = container.querySelector("[data-diagnostic-summary]");
      if (summary) {
        summary.textContent = diagnosticSummary();
        summary.dataset.attention = String(Boolean(failures || outputError));
      }
    },
  };
}
