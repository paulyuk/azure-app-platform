export function getAgentStatus({ app, readiness, agentReady = false, requestState = "idle", readinessError = "" } = {}) {
  const runtime = !app ? readinessError ? "Unavailable" : "Checking"
    : ({
      running: readiness?.mode === "preview" ? "Local preview" : "Running locally",
      starting: app.recovered ? "Partial startup" : "Starting locally",
      stopping: "Stopping", configuring: "Configuring",
      provisioning: "Provisioning Azure", deploying: "Deploying to Azure",
      failed: "Operation failed", stopped: "Not running",
    }[app.state] || "Not running");
  const configuring = app?.state === "configuring" || readiness?.activeGateway?.configurationStatus === "configuring";
  const connection = configuring ? "Applying connection"
    : readiness?.gatewayConfigured ? [readiness.model, readiness.activeGateway?.name].filter(Boolean).join(" · ") || "Configured"
    : readiness ? "Not configured" : "Unknown";
  let state = "checking";
  let title = "Checking test readiness";
  let description = "Waiting for runtime and connection information. Your task stays here.";
  if (readinessError) {
    state = "unavailable";
    title = "Readiness unavailable";
    description = readinessError;
  } else if (app?.state === "stopping") {
    state = "stopping";
    title = "Stopping the app";
    description = "Wait for shutdown before invoking another task. The payload and last result are retained.";
  } else if (configuring) {
    state = "configuring";
    title = "Applying model connection";
    description = "Connection settings are being applied. This does not verify agent execution or policy enforcement.";
  } else if (!agentReady && app?.foreignEntrypoints?.length) {
    state = "ports";
    title = "Local ports are in use";
    description = "Resolve the port conflict before starting this app. Another app's endpoint is not test readiness.";
  } else if (agentReady) {
    state = "ready";
    title = "Ready to test";
    description = app?.state === "failed" || (app?.state === "starting" && app.recovered)
      ? "The agent endpoint is available, but an app operation needs review in Output and Operations."
      : app?.state === "starting"
        ? "The agent endpoint is available while other services start."
        : ["provisioning", "deploying"].includes(app?.state)
          ? "The local agent is available while the Azure operation continues."
          : "Dispatch an event or task. Review its result, reported tools and document checks separately.";
  } else if (app?.state === "failed" || (app?.state === "starting" && app.recovered)) {
    state = "runtime-failed";
    title = "Runtime needs attention";
    description = "Startup or another app operation did not complete. Review Output and Operations before retrying.";
  } else if (app?.state === "starting") {
    state = "starting";
    title = "Waiting for the agent";
    description = "Local services are starting; the agent endpoint is not ready yet. Your task stays here.";
  } else if (["provisioning", "deploying"].includes(app?.state)) {
    state = app.state;
    title = app.state === "provisioning" ? "Preparing Azure resources" : "Deploying the app";
    description = "An Azure operation is in progress. This does not establish local agent readiness.";
  } else if (readiness?.prerequisites?.ready === false) {
    state = "prerequisites";
    title = "Local prerequisites missing";
    description = "Install or sign in to the missing tools before starting the agent.";
  } else if (readiness && !readiness.gatewayConfigured && (readiness.mode === "preview" || !readiness.ready)) {
    state = readiness.mode === "preview" ? "preview" : "connection";
    title = readiness.mode === "preview" ? "Preview is not an agent test" : "Model connection required";
    description = "Connect an AI Gateway and model to enable the agent workflow. A running web app is not a ready agent.";
  } else if (app?.state === "running") {
    state = "agent-unavailable";
    title = "App running; agent unavailable";
    description = "The app is running, but no ready agent endpoint was reported. Review Services and Output.";
  } else if (app && readiness) {
    state = readiness.ready ? "stopped" : "connection";
    title = readiness.ready ? "Ready to start a task" : "Complete connection setup";
    description = readiness.ready
      ? "Invoke agent starts the local app and waits for its agent endpoint before dispatching your task."
      : readiness.guidance || "Review connection settings before invoking the agent.";
  }
  const availabilityState = state;
  if (requestState === "invoking") {
    state = "invoking";
    title = "Task in progress";
    description = "Waiting for task execution. Runtime readiness is listed separately; tool activity appears only when reported.";
  } else if (requestState === "succeeded") {
    state = "succeeded";
    title = "Task result received";
    description = "A response is not proof of safety or tool success. Select View execution to review the result and reported evidence."
      + (availabilityState !== "ready" ? " " + description : "");
  }
  return {
    state, availabilityState, title, description, runtime, connection,
    agent: agentReady ? "Endpoint available" : !app ? "Unknown" : "Not ready",
    runtimeError: app?.error || "",
  };
}

export function createAgentStatusComponent(toolkit) {
  const h = toolkit.createElement;
  return function AgentStatus({ state, title, description, runtime, agent, connection, runtimeError,
    command, errorDetail, prerequisites = [], actions = [], onConnection, connectionIcon }) {
    const tone = ["ready", "succeeded"].includes(state) ? "success"
      : ["runtime-failed", "unavailable"].includes(state) ? "danger"
      : ["ports", "prerequisites", "preview", "connection", "agent-unavailable"].includes(state) ? "warning"
      : ["checking", "starting", "stopping", "configuring", "provisioning", "deploying", "invoking"].includes(state) ? "busy"
      : "neutral";
    return h("section", { className: "agent-status-brief", "data-state": state, "aria-label": "Status Brief" },
      h("div", { className: "agent-status-summary" },
        h("span", { className: "agent-status-icon", "data-tone": tone, "aria-hidden": true }),
        h("div", { className: "agent-status-copy" },
          h("h2", { className: "visually-hidden" }, "Status Brief"),
          h("h3", null, title),
          h("p", null, description),
          runtimeError ? h("p", { className: "error" }, "Runtime: " + runtimeError) : null,
          command ? h("pre", { className: "command-code" }, command) : null,
          errorDetail && errorDetail !== runtimeError ? h("details", { "data-run-disclosure": "runtime-error" },
            h("summary", null, "Error details"),
            h("pre", { className: "command-code", "data-run-scroll-key": "runtime-error" }, errorDetail)) : null,
          prerequisites.length ? h("ul", { className: "agent-status-prerequisites", "aria-label": "Missing local prerequisites" },
            ...prerequisites.map(item => h("li", { key: item.id || item.label },
              h("strong", null, item.label + ": "), item.command))) : null),
        actions.length ? h("div", { className: "agent-status-actions", "aria-label": "Readiness actions" },
          ...actions.map(action => h(toolkit.Button, {
            key: action.key, "data-action-key": action.key, appearance: "secondary", size: "small",
            disabled: action.disabled, onClick: action.onClick,
          }, action.label))) : null),
      h("dl", { className: "agent-status-facts" },
        ...[["Runtime", runtime], ["Agent", agent], ["Connection", connection]].map(([label, value]) =>
          h("div", { key: label }, h("dt", null, label), h("dd", null, h("span", null, value),
            label === "Connection" && onConnection ? h(toolkit.Button, {
              className: "agent-connection-shortcut", appearance: "secondary", size: "small",
              icon: connectionIcon, "aria-label": "Open connections", title: "Open connections",
              "data-action-key": "status-connections", onClick: onConnection,
            }) : null)))));
  };
}
