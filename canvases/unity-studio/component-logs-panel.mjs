export const COMPONENT_LOGS_CSS = `
  .component-logs { margin: 14px 0; border: 1px solid var(--border); border-radius: 8px; }
  .component-logs > summary { padding: 10px 12px; cursor: pointer; font-weight: 600; }
  .component-logs-body { padding: 0 12px 12px; min-width: 0; }
  .component-logs-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .component-logs-controls label { flex: 1 1 120px; min-width: 0; }
  .component-logs-controls select { width: 100%; min-width: 0; }
  .component-logs-output { display: block; margin-top: 10px; min-height: 130px; height: 240px; max-width: 100%; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.5 var(--font-mono, monospace); background: var(--surface-muted); color: var(--text); padding: 10px; border: 1px solid var(--border); border-radius: 6px; }
  .component-logs-status { font-size: 11px; overflow-wrap: anywhere; }
  .node-logs { cursor: pointer; }
  .node-logs rect { fill: var(--surface-muted); stroke: var(--border); }
  .node-logs text { fill: var(--accent); font-size: 10px; pointer-events: none; }
  .node-logs:hover rect, .node-logs:focus-visible rect { stroke: var(--focus); stroke-width: 2; }
`;

export function createComponentLogsPanel({ parent, node, load, isActive, initiallyOpen = false, buttons }) {
  const section = document.createElement("details");
  section.className = "component-logs";
  section.open = initiallyOpen;
  const summary = document.createElement("summary");
  summary.textContent = "Service logs";
  section.append(summary);
  const body = document.createElement("div");
  body.className = "component-logs-body";
  section.append(body);
  const controls = document.createElement("div");
  controls.className = "component-logs-controls";
  const label = document.createElement("label");
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Log stream");
  select.disabled = true;
  label.append(select);
  controls.append(label);
  const pause = buttons.create({ children: "Pause", "aria-pressed": false });
  const refresh = buttons.create({ children: "Refresh" });
  buttons.append(controls, pause, refresh);
  body.append(controls);
  const status = document.createElement("p");
  status.className = "component-logs-status";
  status.setAttribute("role", "status");
  body.append(status);
  const output = document.createElement("pre");
  output.className = "component-logs-output";
  output.setAttribute("aria-label", node.name + " service logs");
  output.setAttribute("aria-live", "off");
  output.tabIndex = 0;
  body.append(output);
  parent.append(section);
  let disposed = false;
  let paused = false;
  let timer;
  let controller;
  let result = null;
  const active = () => !disposed && section.isConnected && section.open && isActive();

  function render() {
    const streams = result?.streams ?? [];
    const previous = select.value;
    if (JSON.stringify([...select.options].map((option) => [option.value, option.textContent])) !==
        JSON.stringify(streams.map((stream) => [stream.id, stream.label]))) {
      select.replaceChildren(...streams.map((stream) => {
        const option = document.createElement("option");
        option.value = stream.id;
        option.textContent = stream.label;
        return option;
      }));
      if (streams.some((stream) => stream.id === previous)) select.value = previous;
    }
    select.disabled = !streams.length;
    const stream = streams.find((item) => item.id === select.value);
    const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 30;
    const nextText = stream?.text || stream?.message || result?.message || "No service log output yet.";
    if (output.textContent !== nextText) {
      output.textContent = nextText;
      if (nearBottom) output.scrollTop = output.scrollHeight;
    }
    status.textContent = [
      paused ? "Paused" : "Auto-refreshing",
      stream?.message || result?.message || "Recent output for " + node.name + " only.",
    ].join(" · ");
    status.classList.remove("error");
  }

  function schedule() {
    clearTimeout(timer);
    if (active() && !paused) timer = setTimeout(() => void refreshLogs(), 2000);
  }

  async function refreshLogs() {
    if (!active() || controller) return;
    const request = new AbortController();
    controller = request;
    buttons.setDisabled(refresh, true);
    section.setAttribute("aria-busy", "true");
    if (!result) status.textContent = "Loading service logs…";
    try {
      const response = await load({ nodeId: node.id, signal: request.signal });
      if (!active() || request.signal.aborted) return;
      if (response?.node?.id !== node.id ||
          !["available", "unavailable"].includes(response.availability) ||
          !Array.isArray(response.streams) || response.streams.some((stream) =>
            !["stdout", "stderr", "combined"].includes(stream.stream) ||
            typeof stream.label !== "string" || !Array.isArray(stream.lines) ||
            stream.lines.some((line) => typeof line !== "string"))) {
        throw new Error("Studio returned an invalid component log response.");
      }
      result = {
        message: response.reason,
        streams: response.streams.map((stream) => ({
          id: stream.stream, label: stream.label, text: stream.lines.join("\n"),
          message: stream.reason || stream.notice,
        })),
      };
      render();
    } catch (error) {
      if (!request.signal.aborted && active()) {
        status.textContent = "Could not load service logs: " + error.message;
        status.classList.add("error");
      }
    } finally {
      if (controller === request) {
        controller = null;
        buttons.setDisabled(refresh, false);
        section.removeAttribute("aria-busy");
        schedule();
      }
    }
  }

  function stop() {
    clearTimeout(timer);
    controller?.abort();
    controller = null;
    buttons.setDisabled(refresh, false);
    section.removeAttribute("aria-busy");
  }

  pause.addEventListener("click", () => {
    paused = !paused;
    buttons.update(pause, { children: paused ? "Resume" : "Pause", "aria-pressed": paused });
    if (paused) stop();
    if (result) render();
    if (!paused) void refreshLogs();
  });
  refresh.addEventListener("click", () => void refreshLogs());
  select.addEventListener("change", render);
  section.addEventListener("toggle", () => {
    if (section.open) void refreshLogs();
    else stop();
  });
  if (initiallyOpen) void refreshLogs();
  return {
    dispose() { disposed = true; stop(); buttons.clear(section); },
    open() { section.open = true; summary.focus({ preventScroll: true }); },
  };
}
