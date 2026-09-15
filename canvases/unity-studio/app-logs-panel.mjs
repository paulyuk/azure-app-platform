import { ACTION_BUTTON_STYLE, FORM_CONTROL_STYLE } from "./control-styles.mjs";

export const APP_LOGS_CSS = `
  #details[data-mode="logs"] { padding: 20px 16px; }
  .app-logs { min-width: 0; color: var(--text); font: 13px/1.5 var(--font-sans, system-ui); }
  :is(#details, .app-logs) .app-logs-heading { margin: 0 0 8px; font-size: 20px; }
  :is(#details, .app-logs) .app-logs-explanation { margin: 0 0 16px; color: var(--muted); font-size: 12px; }
  .app-logs-controls { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(140px, .8fr) minmax(180px, 1.2fr) auto auto; gap: 10px; align-items: end; }
  .app-logs-field { display: grid; gap: 5px; min-width: 0; color: var(--muted); font-size: 12px; font-weight: 600; }
  .app-logs-field select, .app-logs-field input { ${FORM_CONTROL_STYLE} width: 100%; min-width: 0; }
  .app-logs-controls button { ${ACTION_BUTTON_STYLE} border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  .app-logs-controls button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  :is(#details, .app-logs) .app-logs-status { min-height: 18px; margin: 12px 0 8px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  :is(#details, .app-logs) .app-logs-status.error { color: var(--danger, #b42318); }
  :is(#details, .app-logs) .app-logs-notices { display: grid; gap: 4px; margin: 0 0 10px; padding: 0; list-style: none; color: var(--muted); font-size: 11px; }
  :is(#details, .app-logs) .app-logs-notices li { margin: 0; font-size: 11px; }
  .app-logs-service { min-width: 0; margin: 0 0 14px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: color-mix(in srgb, var(--accent) 4%, var(--surface)); }
  :is(#details, .app-logs) .app-logs-service h3 { margin: 0 0 8px; font-size: 14px; }
  :is(#details, .app-logs) :is(.app-logs-service-meta, .app-logs-message, .app-logs-stream-note) { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  :is(#details, .app-logs) .app-logs-service-meta { margin: -4px 0 10px; }
  :is(#details, .app-logs) .app-logs-message { margin: 8px 0 0; }
  .app-logs-stream { min-width: 0; margin-top: 10px; }
  .app-logs-stream h4 { margin: 0 0 5px; font-size: 11px; }
  .app-logs-output { display: block; box-sizing: border-box; width: 100%; max-width: 100%; max-height: 300px; margin: 0; padding: 10px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-muted); color: var(--text); font: 12px/1.5 var(--font-mono, monospace); }
  .app-logs-empty { padding: 18px; border: 1px dashed var(--border); border-radius: 8px; color: var(--muted); font-size: 12px; }
  @media (max-width: 760px) {
    .app-logs-controls { grid-template-columns: 1fr 1fr; }
    .app-logs-search { grid-column: 1 / -1; }
  }
  @media (max-width: 460px) {
    .app-logs-controls { grid-template-columns: 1fr; }
    .app-logs-search { grid-column: auto; }
    .app-logs-controls button { width: 100%; }
  }
`;

export function createAppLogsPanel({ parent, load, isActive, nodeId = null }) {
  const root = document.createElement("section");
  root.className = "app-logs";
  const heading = document.createElement("h2");
  heading.className = "app-logs-heading";
  heading.textContent = "Logs";
  root.append(heading);
  const explanation = document.createElement("p");
  explanation.className = "app-logs-explanation";
  explanation.textContent = "Logs are grouped by service and retain source order within each stream. They are not a global chronological trace.";
  root.append(explanation);

  const controls = document.createElement("div");
  controls.className = "app-logs-controls";
  const makeField = (text, control, className = "") => {
    const label = document.createElement("label");
    label.className = `app-logs-field ${className}`.trim();
    const caption = document.createElement("span");
    caption.textContent = text;
    label.append(caption, control);
    return label;
  };
  const serviceSelect = document.createElement("select");
  serviceSelect.setAttribute("aria-label", "Service");
  serviceSelect.disabled = true;
  controls.append(makeField("Service", serviceSelect));
  const streamSelect = document.createElement("select");
  streamSelect.setAttribute("aria-label", "Stream");
  streamSelect.disabled = true;
  controls.append(makeField("Stream", streamSelect));
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search displayed logs";
  search.setAttribute("aria-label", "Search logs");
  controls.append(makeField("Search", search, "app-logs-search"));
  const pause = document.createElement("button");
  pause.type = "button";
  pause.textContent = "Pause";
  pause.setAttribute("aria-pressed", "false");
  controls.append(pause);
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Refresh";
  controls.append(refresh);
  root.append(controls);

  const status = document.createElement("p");
  status.className = "app-logs-status";
  status.setAttribute("role", "status");
  root.append(status);
  const notices = document.createElement("ul");
  notices.className = "app-logs-notices";
  root.append(notices);
  const content = document.createElement("div");
  content.className = "app-logs-content";
  content.setAttribute("aria-label", "Application logs");
  root.append(content);
  parent.append(root);

  let disposed = false;
  let paused = false;
  let timer = null;
  let controller = null;
  let response = null;
  let lastError = "";
  let initialSelectionResolved = nodeId == null;
  let prefilterMissing = false;
  let requestSerial = 0;
  const active = () => !disposed && root.isConnected && Boolean(isActive());

  function descriptorText(service) {
    const parts = [];
    if (service.kind === "supporting") parts.push("Supporting service");
    else if (service.tierId) parts.push(service.tierId);
    if (service.projectPath) parts.push(service.projectPath);
    if (service.aliases.length) parts.push(`also ${service.aliases.join(", ")}`);
    return parts.join(" · ");
  }

  function validateDescriptor(service) {
    return service
      && typeof service.id === "string"
      && typeof service.label === "string"
      && ["component", "supporting"].includes(service.kind)
      && (service.componentId == null || typeof service.componentId === "string")
      && (service.tierId == null || typeof service.tierId === "string")
      && (service.projectPath == null || typeof service.projectPath === "string")
      && Array.isArray(service.aliases)
      && service.aliases.every((alias) => typeof alias === "string");
  }

  function validateResponse(value, requestedServiceId) {
    if (!value
      || !value.scope
      || value.scope.serviceId !== requestedServiceId
      || value.scope.groupedByService !== true
      || typeof value.scope.description !== "string"
      || !Array.isArray(value.catalog)
      || !value.catalog.every(validateDescriptor)
      || !Array.isArray(value.services)
      || !value.services.every((service) =>
        validateDescriptor(service)
        && ["available", "unavailable", "error"].includes(service.availability)
        && typeof service.reason === "string"
        && Array.isArray(service.streams)
        && service.streams.every((stream) =>
          ["stdout", "stderr", "combined"].includes(stream.stream)
          && typeof stream.label === "string"
          && typeof stream.available === "boolean"
          && typeof stream.reason === "string"
          && typeof stream.notice === "string"
          && Array.isArray(stream.lines)
          && stream.lines.every((line) => typeof line === "string")))
      || !value.clipping
      || typeof value.clipping.clipped !== "boolean"
      || !Array.isArray(value.clipping.notices)
      || !value.clipping.notices.every((notice) => typeof notice === "string")) {
      throw new Error("Studio returned an invalid application log response.");
    }
  }

  function replaceOptions(select, entries, selected) {
    const signature = JSON.stringify(entries);
    const current = JSON.stringify([...select.options].map((option) => [option.value, option.textContent]));
    if (signature !== current) {
      select.replaceChildren(...entries.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }));
    }
    if (entries.some(([value]) => value === selected)) select.value = selected;
  }

  function renderControls() {
    const selectedService = serviceSelect.value;
    const serviceEntries = [
      ["", "All services"],
      ...(response?.catalog ?? []).map((service) => [
        service.id,
        service.aliases.length ? `${service.label} (${service.aliases.join(", ")})` : service.label,
      ]),
    ];
    replaceOptions(serviceSelect, serviceEntries, selectedService);
    serviceSelect.disabled = !response?.catalog?.length;

    const visibleServices = response?.services ?? [];
    const streamLabels = new Map();
    for (const service of visibleServices) {
      for (const stream of service.streams) {
        if (!streamLabels.has(stream.stream)) streamLabels.set(stream.stream, new Set());
        streamLabels.get(stream.stream).add(stream.label);
      }
    }
    const selectedStream = streamSelect.value;
    const generic = { stdout: "Standard output streams", stderr: "Standard error streams", combined: "Combined output streams" };
    const streamEntries = [["", "All streams"], ...[...streamLabels].map(([id, labels]) => [
      id,
      response?.scope?.serviceId && labels.size === 1 ? [...labels][0] : generic[id],
    ])];
    replaceOptions(streamSelect, streamEntries, selectedStream);
    streamSelect.disabled = streamEntries.length === 1;
  }

  function renderNotices() {
    const items = response?.clipping?.notices ?? [];
    notices.replaceChildren(...items.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }));
  }

  function renderContent() {
    content.replaceChildren();
    if (prefilterMissing) {
      const empty = document.createElement("p");
      empty.className = "app-logs-empty";
      empty.textContent = "The selected component has no matching application log service. No other component was substituted.";
      content.append(empty);
      return 0;
    }
    const selectedService = serviceSelect.value;
    const selectedStream = streamSelect.value;
    const query = search.value.trim().toLocaleLowerCase();
    const services = (response?.services ?? []).filter((service) =>
      !selectedService || service.id === selectedService);
    let matchingLines = 0;
    for (const service of services) {
      const section = document.createElement("section");
      section.className = "app-logs-service";
      section.dataset.serviceId = service.id;
      const title = document.createElement("h3");
      title.textContent = service.label;
      section.append(title);
      const metaText = descriptorText(service);
      if (metaText) {
        const meta = document.createElement("p");
        meta.className = "app-logs-service-meta";
        meta.textContent = metaText;
        section.append(meta);
      }
      const streams = service.streams.filter((stream) => !selectedStream || stream.stream === selectedStream);
      for (const stream of streams) {
        const filtered = stream.lines.filter((line) => !query || line.toLocaleLowerCase().includes(query));
        matchingLines += filtered.length;
        const streamSection = document.createElement("div");
        streamSection.className = "app-logs-stream";
        const streamTitle = document.createElement("h4");
        streamTitle.textContent = stream.label;
        streamSection.append(streamTitle);
        if (filtered.length) {
          const output = document.createElement("pre");
          output.className = "app-logs-output";
          output.tabIndex = 0;
          output.setAttribute("aria-label", `${service.label} ${stream.label}`);
          output.textContent = filtered.join("\n");
          streamSection.append(output);
        }
        const streamMessage = stream.reason || stream.notice
          || (query && stream.lines.length && !filtered.length
            ? "No lines in this stream match the search."
            : !stream.lines.length
              ? "No log output is available for this stream yet."
              : "");
        if (streamMessage) {
          const note = document.createElement("p");
          note.className = "app-logs-stream-note";
          note.textContent = streamMessage;
          streamSection.append(note);
        }
        section.append(streamSection);
      }
      if (!streams.length || (service.availability !== "available" && !section.querySelector(".app-logs-output"))) {
        const message = document.createElement("p");
        message.className = "app-logs-message";
        message.textContent = service.reason || "No output is available for the selected stream.";
        section.append(message);
      }
      content.append(section);
    }
    if (!services.length) {
      const empty = document.createElement("p");
      empty.className = "app-logs-empty";
      empty.textContent = response
        ? "No service output was included in this response."
        : lastError || "Loading application logs…";
      content.append(empty);
    }
    return matchingLines;
  }

  function render() {
    renderControls();
    renderNotices();
    const matchingLines = renderContent();
    const mode = paused ? "Paused" : "Auto-refreshing";
    const scope = response?.scope?.label || (nodeId ? "Selected component" : "All services");
    status.classList.toggle("error", Boolean(lastError));
    status.textContent = lastError
      ? `Could not load application logs: ${lastError}`
      : response
        ? `${mode} · ${scope} · ${matchingLines} displayed ${matchingLines === 1 ? "line" : "lines"}`
        : "Loading application logs…";
  }

  function schedule(delay = 2000) {
    clearTimeout(timer);
    timer = null;
    if (disposed || paused) return;
    if (active()) timer = setTimeout(() => void refreshLogs(), delay);
    else timer = setTimeout(() => schedule(0), 250);
  }

  function stopRequest() {
    controller?.abort();
    controller = null;
    refresh.disabled = false;
    root.removeAttribute("aria-busy");
  }

  async function refreshLogs() {
    if (!active() || controller) return;
    const request = new AbortController();
    const serial = ++requestSerial;
    const requestedServiceId = serviceSelect.value || null;
    controller = request;
    refresh.disabled = true;
    root.setAttribute("aria-busy", "true");
    if (!response) render();
    let followUp = false;
    let matchedServiceId = "";
    try {
      const next = await load({ serviceId: requestedServiceId, signal: request.signal });
      if (!active() || request.signal.aborted || serial !== requestSerial) return;
      validateResponse(next, requestedServiceId);
      response = next;
      lastError = "";
      if (!initialSelectionResolved) {
        initialSelectionResolved = true;
        const match = next.catalog.find((service) => service.componentId === nodeId || service.id === nodeId);
        if (match) {
          matchedServiceId = match.id;
          followUp = true;
        } else {
          prefilterMissing = true;
        }
      }
      render();
      if (matchedServiceId) {
        serviceSelect.value = matchedServiceId;
        render();
      }
    } catch (error) {
      if (!request.signal.aborted && active() && serial === requestSerial) {
        lastError = error instanceof Error ? error.message : String(error);
        render();
      }
    } finally {
      if (controller === request) {
        controller = null;
        refresh.disabled = false;
        root.removeAttribute("aria-busy");
        if (followUp) void refreshLogs();
        else schedule();
      }
    }
  }

  serviceSelect.addEventListener("change", () => {
    initialSelectionResolved = true;
    prefilterMissing = false;
    lastError = "";
    stopRequest();
    render();
    void refreshLogs();
  });
  streamSelect.addEventListener("change", render);
  search.addEventListener("input", render);
  pause.addEventListener("click", () => {
    paused = !paused;
    pause.textContent = paused ? "Resume" : "Pause";
    pause.setAttribute("aria-pressed", String(paused));
    if (paused) {
      clearTimeout(timer);
      stopRequest();
      render();
    } else {
      void refreshLogs();
    }
  });
  refresh.addEventListener("click", () => void refreshLogs());

  render();
  if (active()) void refreshLogs();
  else schedule(0);
  return {
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = null;
      stopRequest();
      root.remove();
    },
  };
}
