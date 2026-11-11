import { readFileSync } from "node:fs";

export const RUN_ILLUSTRATION_MARKUP = {
  ready: readFileSync(new URL("./assets/run-ready-spot.svg", import.meta.url), "utf8"),
};

export function getAgentResponsePresentation({ state = "idle", phase = "preparing", slow = false } = {}) {
  if (state === "succeeded") return null;
  if (state === "failed") {
    const sent = phase === "waiting";
    return {
      title: sent ? "This invocation had a problem" : "The task was not sent",
      description: sent
        ? "Your task is retained in Run. A failed request does not confirm that backend execution stopped."
        : "Your task is retained in Run. Review startup output before trying again.",
      illustration: null, showLogs: true,
    };
  }
  if (state === "idle") {
    return {
      title: "Your result will appear here",
      description: "Choose an event or enter a task above, then select Invoke agent.",
      illustration: "ready", showLogs: false,
    };
  }
  const [title, description] = phase === "waiting"
    ? [
      slow ? "Still waiting for a response" : "Waiting for the agent response",
      slow ? "No response yet. You can inspect logs while the request continues."
        : "Tool reports will appear with the result.",
    ]
    : phase === "endpoint"
      ? ["Sending the task", "The agent endpoint is available. Your task has not been sent yet."]
      : phase === "starting"
        ? ["Waiting for the agent endpoint", "Starting local services (up to 90 seconds). Your task has not been sent yet."]
        : ["Preparing the agent", "Checking availability. Your task has not been sent yet."];
  return { title, description, illustration: null, showLogs: true };
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
    if (state === "invoking") summary.append(pendingIndicator);
    if (presentation.illustration) {
      const template = document.createElement("template");
      template.innerHTML = illustrations[presentation.illustration];
      const illustration = template.content.querySelector("svg");
      illustration.setAttribute("class", "agent-result-illustration");
      illustration.removeAttribute("role");
      illustration.removeAttribute("aria-labelledby");
      illustration.setAttribute("aria-hidden", "true");
      illustration.setAttribute("focusable", "false");
      illustration.setAttribute("width", "64");
      illustration.setAttribute("height", "64");
      summary.append(illustration);
    } else if (state === "failed") {
      append(summary, "span", "", "agent-result-error-icon").setAttribute("aria-hidden", "true");
    }
    const copy = append(summary, "div", "", "agent-result-copy");
    const title = append(copy, "strong", "", "agent-result-title");
    append(title, "span", presentation.title);
    if (state === "failed") append(copy, "p", text, "agent-result-error");
    append(copy, "p", presentation.description);
    if (presentation.showLogs && onLogs) {
      const footer = append(root, "div", "", "agent-result-footer");
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
