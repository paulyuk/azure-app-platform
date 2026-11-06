import { readFileSync } from "node:fs";

const illustrationColors = {
  "#294482": "--run-art-outline",
  "#F5F5F5": "--run-art-paper",
  "#CEDEFF": "--run-art-soft-blue",
  "#FFE4B4": "--run-art-task",
  "#5C8DF8": "--run-art-brand",
  "#FFFFFF": "--run-art-highlight",
};

export const RUN_ILLUSTRATION_MARKUP = Object.fromEntries(["ready", "working"].map(state => [
  state,
  Object.entries(illustrationColors).reduce((markup, [color, token]) => markup.replaceAll(color, `var(${token})`),
    readFileSync(new URL(`./assets/run-${state}-spot.svg`, import.meta.url), "utf8")),
]));

export function getAgentResponsePresentation({ state = "idle", phase = "preparing", slow = false } = {}) {
  if (state === "succeeded") return null;
  if (state === "failed") {
    const sent = phase === "waiting";
    return {
      title: sent ? "Task request failed" : "The task was not sent",
      description: sent
        ? "Your task is retained above. A failed request does not confirm that backend execution stopped."
        : "Your task is retained above. Review startup output before trying again.",
      illustration: null, steps: [], showLogs: true, note: "",
    };
  }
  if (state === "idle") {
    return {
      title: "Your result will appear here",
      description: "Choose an event or enter a task above, then select Invoke agent.",
      illustration: "ready", steps: [], showLogs: false, note: "",
    };
  }
  const current = phase === "waiting" ? 2 : phase === "endpoint" ? 1 : 0;
  const [title, description, note] = phase === "waiting"
    ? [
      slow ? "Still waiting for a response" : "Waiting for the agent response",
      slow ? "No response yet. You can inspect logs while the request continues."
        : "The invocation request is in flight. No result has been reported yet.",
      "Tool reports arrive with the result.",
    ]
    : phase === "endpoint"
      ? ["Agent endpoint available", "Preparing the invocation request. Your task has not been sent yet.", "Request not sent yet."]
      : phase === "starting"
        ? ["Waiting for the agent endpoint", "Local services are starting. Your task has not been sent yet.", "Startup wait: up to 90 seconds."]
        : ["Preparing the agent", "Checking local agent availability. Your task has not been sent yet.", "Request not sent yet."];
  return {
    title, description, note, illustration: "working", showLogs: true,
    steps: ["Prepare agent", "Send request", "Receive response"].map((label, index) => ({
      label, state: index < current ? "complete" : index === current ? "current" : "pending",
    })),
  };
}

export function renderAgentResponse(root, { state, phase, slow, text, buttons, onLogs, pendingIndicator, illustrations }) {
  const presentation = getAgentResponsePresentation({ state, phase, slow });
  const focused = root.contains(document.activeElement);
  const actionKey = focused ? document.activeElement.dataset.actionKey : "";
  const scrollTop = root.scrollTop;
  buttons.clear(root);
  root.replaceChildren();
  root.dataset.state = state;
  root.dataset.phase = phase;
  root.setAttribute("aria-busy", String(state === "invoking"));
  function append(parent, tag, content, className = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = content;
    parent.append(node);
    return node;
  }
  if (!presentation) {
    root.textContent = text;
  } else {
    const summary = append(root, "div", "", "agent-result-summary");
    if (presentation.illustration) {
      const template = document.createElement("template");
      template.innerHTML = illustrations[presentation.illustration];
      const illustration = template.content.querySelector("svg");
      illustration.setAttribute("class", "agent-result-illustration");
      illustration.removeAttribute("role");
      illustration.removeAttribute("aria-labelledby");
      illustration.setAttribute("aria-hidden", "true");
      illustration.setAttribute("focusable", "false");
      illustration.setAttribute("width", "80");
      illustration.setAttribute("height", "80");
      summary.append(illustration);
    }
    const copy = append(summary, "div", "", "agent-result-copy");
    append(copy, "strong", presentation.title, "agent-result-title");
    if (state === "failed") append(copy, "p", text, "agent-result-error");
    append(copy, "p", presentation.description);
    if (presentation.steps.length) {
      const steps = append(root, "ol", "", "agent-result-steps");
      steps.setAttribute("aria-label", "Run progress");
      for (const step of presentation.steps) {
        const row = append(steps, "li", "", "agent-result-step");
        row.dataset.state = step.state;
        if (step.state === "current") row.setAttribute("aria-current", "step");
        const status = { complete: "Complete", current: "Current", pending: "Not started" }[step.state];
        row.setAttribute("aria-label", step.label + ": " + status);
        if (step.state === "current") row.append(pendingIndicator);
        else append(row, "span", "", "agent-result-step-icon").setAttribute("aria-hidden", "true");
        append(row, "span", step.label);
      }
    }
    if (presentation.showLogs) {
      const footer = append(root, "div", "", "agent-result-footer");
      if (presentation.note) append(footer, "span", presentation.note);
      buttons.append(footer, buttons.create({
        children: "View logs", appearance: "secondary", size: "small",
        "data-action-key": "agent-result-logs", onClick: onLogs,
      }));
    }
  }
  root.scrollTop = scrollTop;
  if (focused) {
    const replacement = actionKey && [...root.querySelectorAll("[data-action-key]")]
      .find(node => node.dataset.actionKey === actionKey);
    (replacement || root).focus({ preventScroll: true });
  }
  return presentation;
}
