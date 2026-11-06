export function renderIdleAgentResponse(root) {
  const summary = document.createElement("div");
  summary.className = "agent-result-summary";
  const illustration = document.createElement("img");
  illustration.className = "agent-result-illustration";
  illustration.src = "/assets/run-ready-spot.svg";
  illustration.alt = "";
  illustration.setAttribute("aria-hidden", "true");
  illustration.width = 80;
  illustration.height = 80;
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
