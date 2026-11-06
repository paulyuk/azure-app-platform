import { readFileSync } from "node:fs";

export const RUN_READY_ILLUSTRATION_MARKUP = readFileSync(new URL("./assets/run-ready-spot.svg", import.meta.url), "utf8")
  .replaceAll("#294482", "var(--studio-muted)")
  .replaceAll("#F5F5F5", "var(--studio-raised)")
  .replaceAll("#CEDEFF", "var(--studio-accent-soft)")
  .replaceAll("#FFE4B4", "var(--studio-accent-soft)")
  .replaceAll("#5C8DF8", "var(--studio-accent)")
  .replaceAll("#FFFFFF", "var(--studio-on-accent)");

export function renderIdleAgentResponse(root, illustrationMarkup) {
  const summary = document.createElement("div");
  summary.className = "agent-result-summary";
  const template = document.createElement("template");
  // Only the shipped, theme-mapped artwork is parsed, never response or user text.
  template.innerHTML = illustrationMarkup;
  const illustration = template.content.firstElementChild;
  illustration.classList.add("agent-result-illustration");
  illustration.removeAttribute("role");
  illustration.removeAttribute("aria-labelledby");
  illustration.setAttribute("aria-hidden", "true");
  illustration.setAttribute("focusable", "false");
  illustration.setAttribute("width", "80");
  illustration.setAttribute("height", "80");
  summary.append(illustration);
  const copy = document.createElement("div");
  copy.className = "agent-result-copy";
  const title = document.createElement("strong");
  title.className = "agent-result-title";
  title.textContent = "Your next run starts here";
  const description = document.createElement("p");
  description.textContent = "Choose an event or enter a task above, then invoke the agent.";
  copy.append(title, description);
  summary.append(copy);
  root.replaceChildren(summary);
}
