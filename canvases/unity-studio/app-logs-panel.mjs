import { ACTION_BUTTON_STYLE, FORM_CONTROL_STYLE } from "./control-styles.mjs";
import { octiconMask } from "./studio-icons.mjs";

export const APP_LOGS_CSS = `
  #details[data-mode="logs"] { padding: 20px 16px; overflow: hidden; }
  .app-logs { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; color: var(--text); font: 13px/1.5 var(--font-sans, system-ui); }
  .app-logs-heading-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 16px; margin-bottom: 16px; }
  :is(#details, .app-logs) .app-logs-heading { margin: 0; font-size: 20px; }
  :is(#details, .app-logs) .app-logs-explanation { margin: 0; color: var(--muted); font-size: 12px; }
  .app-logs-controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .8fr) minmax(0, 1.2fr) auto; gap: 10px; align-items: end; }
  .app-logs-field { display: grid; gap: 5px; min-width: 0; color: var(--muted); font-size: 12px; font-weight: 600; }
  .app-logs-field select, .app-logs-field input { ${FORM_CONTROL_STYLE} width: 100%; min-width: 0; }
  .app-logs-controls button { ${ACTION_BUTTON_STYLE} border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  .app-logs-controls button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .app-logs-actions { display: flex; gap: 8px; }
  .app-logs-services { position: relative; min-width: 0; }
  .app-logs-services > summary { ${FORM_CONTROL_STYLE} display: block; padding-right: 24px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; list-style: none; cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border); }
  .app-logs-services > summary::-webkit-details-marker { display: none; }
  .app-logs-services > summary::after { position:absolute; right:9px; top:50%; transform:translateY(-50%); content:""; width:16px; height:16px; background:currentColor; mask:${octiconMask("chevron-down")} center/contain no-repeat; }
  .app-logs-services > summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .app-logs-service-options { position: absolute; z-index: 10; top: calc(100% + 4px); left: 0; box-sizing: border-box; width: 280px; max-width: calc(100vw - 96px); max-height: min(280px, 50vh); overflow: auto; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); box-shadow: 0 6px 18px rgb(0 0 0 / .12); }
  .app-logs-service-options label { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; font-weight: 400; color: var(--text); cursor: pointer; overflow-wrap: anywhere; }
  .app-logs-service-options input[type="checkbox"] { flex: none; width: 16px; min-width: 16px; min-height: 16px; height: 16px; margin: 0; padding: 0; accent-color: var(--accent); }
  .app-logs-service-options p { margin: 6px 0; color: var(--muted); font-size: 11px; font-weight: 400; }
  :is(#details, .app-logs) .app-logs-status { min-height: 18px; margin: 12px 0 8px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  :is(#details, .app-logs) .app-logs-status.error { color: var(--danger, #b42318); }
  :is(#details, .app-logs) .app-logs-notices { display: grid; gap: 4px; margin: 0 0 10px; padding: 0; list-style: none; color: var(--muted); font-size: 11px; }
  :is(#details, .app-logs) .app-logs-notices li { margin: 0; font-size: 11px; }
  .app-logs-content { flex: 1 1 240px; min-height: 0; min-width: 0; padding: 12px; overflow: auto; overscroll-behavior: contain; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-muted); }
  .app-logs-content:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .app-logs-entry { display: block; min-height: 1.6em; margin: 0; padding: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 var(--font-mono, ui-monospace, monospace); }
  .app-logs-origin { display: inline; color: var(--muted); }
  :is(#details, .app-logs) button.app-logs-source { display: inline; min-height: 0; max-width: 100%; min-width: 0; margin: 0; padding: 0; border: 0; border-radius: 2px; background: transparent; color: inherit; font: inherit; text-align: start; overflow-wrap: anywhere; cursor: pointer; vertical-align: baseline; }
  :is(#details, .app-logs) button.app-logs-source:hover { color: var(--accent); text-decoration: underline; }
  .app-logs-source:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .app-logs-stream-label { color: inherit; font: inherit; }
  :is(#details, .app-logs) .app-logs-output { display: inline; margin: 0; padding: 0; white-space: inherit; overflow-wrap: inherit; border: 0; background: transparent; color: var(--text); font: inherit; }
  :is(#details, .app-logs) .app-logs-empty { margin: 0; padding: 18px; color: var(--muted); font-size: 12px; }
  .app-logs-capture { flex: none; margin-top: 8px; }
  .app-logs-capture > summary { padding: 6px 0; color: var(--muted); font-size: 12px; cursor: pointer; }
  .app-logs-capture[data-attention="true"] > summary { color: var(--danger); }
  .app-logs-capture-list { max-height: 160px; overflow: auto; margin: 0; padding: 0 0 0 18px; }
  .app-logs-capture-list li { margin: 4px 0; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .app-logs-capture-list li[data-error="true"] { color: var(--danger); }
  @media (max-width: 760px) {
    .app-logs-controls { grid-template-columns: 1fr 1fr; }
    .app-logs-search { grid-column: 1 / -1; }
    .app-logs-actions { grid-column: 1 / -1; justify-content: flex-end; }
  }
  @media (max-width: 460px) {
    .app-logs-heading-row { margin-bottom: 12px; }
    .app-logs-content { padding: 10px; }
  }
`;

export function createAppLogsPanel({ parent, load, isActive, nodeId = null, buttons }) {
  const root = document.createElement("section");
  root.className = "app-logs";
  const heading = document.createElement("h2");
  heading.className = "app-logs-heading";
  heading.textContent = "Logs";
  const headingRow = document.createElement("div");
  headingRow.className = "app-logs-heading-row";
  const explanation = document.createElement("p");
  explanation.className = "app-logs-explanation";
  explanation.textContent = "Source order · Not a timeline";
  explanation.title = "Lines retain their original order within each service stream, including untimestamped output. Timestamps are not normalized across services; this is not a global chronological trace.";
  headingRow.append(heading, explanation);
  root.append(headingRow);

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
  const selectedServiceIds = new Set();
  const serviceField = document.createElement("div");
  serviceField.className = "app-logs-field";
  const serviceCaption = document.createElement("span");
  serviceCaption.textContent = "Services";
  const servicePicker = document.createElement("details");
  servicePicker.className = "app-logs-services";
  const serviceSummary = document.createElement("summary");
  serviceSummary.setAttribute("aria-label", "Services");
  serviceSummary.textContent = "All services";
  const serviceOptions = document.createElement("div");
  serviceOptions.className = "app-logs-service-options";
  serviceOptions.setAttribute("role", "group");
  serviceOptions.setAttribute("aria-label", "Included services");
  const allServices = buttons.create({ children: "All services" });
  const serviceHint = document.createElement("p");
  serviceHint.textContent = "Choose up to 24 services. No selection shows all services.";
  const serviceChoices = document.createElement("div");
  buttons.append(serviceOptions, allServices, serviceHint, serviceChoices);
  servicePicker.append(serviceSummary, serviceOptions);
  serviceField.append(serviceCaption, servicePicker);
  controls.append(serviceField);
  const streamSelect = document.createElement("select");
  streamSelect.setAttribute("aria-label", "Stream");
  streamSelect.disabled = true;
  controls.append(makeField("Stream", streamSelect));
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search displayed logs";
  search.setAttribute("aria-label", "Search logs");
  controls.append(makeField("Search", search, "app-logs-search"));
  const pause = buttons.create({ children: "Pause", "aria-pressed": false });
  const refresh = buttons.create({ children: "Refresh" });
  const actions = document.createElement("div");
  actions.className = "app-logs-actions";
  buttons.append(actions, pause, refresh);
  controls.append(actions);
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
  content.tabIndex = 0;
  content.setAttribute("role", "region");
  content.setAttribute("aria-label", "Application logs");
  content.setAttribute("aria-live", "off");
  root.append(content);
  const capture = document.createElement("details");
  capture.className = "app-logs-capture";
  capture.hidden = true;
  const captureSummary = document.createElement("summary");
  const captureList = document.createElement("ul");
  captureList.className = "app-logs-capture-list";
  capture.append(captureSummary, captureList);
  root.append(capture);
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
  let contentSignature = "";
  let displayedLines = 0;
  let captureScope = "";
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

  function validateResponse(value, requestedIds) {
    const requestedServiceId = requestedIds.length === 1 ? requestedIds[0] : null;
    if (!value
      || !value.scope
      || value.scope.serviceId !== requestedServiceId
      || (requestedIds.length > 1 && (!Array.isArray(value.scope.serviceIds)
        || JSON.stringify(value.scope.serviceIds) !== JSON.stringify(requestedIds)))
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
    const catalog = response?.catalog ?? [];
    const signature = JSON.stringify(catalog.map((service) => [service.id, service.label, service.aliases]));
    if (serviceChoices.dataset.signature !== signature) {
      serviceChoices.dataset.signature = signature;
      serviceChoices.replaceChildren(...catalog.map((service) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = service.id;
        input.setAttribute("aria-label", service.label);
        const name = document.createElement("span");
        name.textContent = service.aliases.length ? `${service.label} (${service.aliases.join(", ")})` : service.label;
        label.append(input, name);
        return label;
      }));
    }
    for (const input of serviceChoices.querySelectorAll("input")) {
      input.checked = selectedServiceIds.has(input.value);
      input.disabled = selectedServiceIds.size >= 24 && !input.checked;
    }
    serviceSummary.textContent = selectedServiceIds.size === 1
      ? catalog.find((service) => selectedServiceIds.has(service.id))?.label || "Selected service"
      : selectedServiceIds.size ? `${selectedServiceIds.size} services` : "All services";
    allServices.setAttribute("aria-pressed", String(!selectedServiceIds.size));

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
    const selectedServices = [...selectedServiceIds];
    const selectedStream = streamSelect.value;
    const query = search.value.trim().toLocaleLowerCase();
    const services = (response?.services ?? []).filter((service) =>
      !selectedServiceIds.size || selectedServiceIds.has(service.id));
    const signature = JSON.stringify([selectedServices, selectedStream, query, prefilterMissing, services, response == null, response ? "" : lastError]);
    if (signature === contentSignature) return displayedLines;
    contentSignature = signature;
    const scrollTop = content.scrollTop;
    const focusedSource = content.contains(document.activeElement) ? document.activeElement?.dataset.serviceId : null;
    const rows = document.createDocumentFragment();
    const emptyMessage = (text) => {
      const empty = document.createElement("p");
      empty.className = "app-logs-empty";
      empty.textContent = text;
      rows.append(empty);
    };
    if (prefilterMissing) {
      emptyMessage("The selected component has no matching application log service. No other component was substituted.");
      content.replaceChildren(rows);
      capture.hidden = true;
      displayedLines = 0;
      return 0;
    }
    const captureNotes = [];
    const withoutOutput = new Set();
    const readErrors = new Set();
    let matchingLines = 0;
    for (const service of services) {
      let firstSource = true;
      const addNote = (message, label = "", error = false) => {
        if (error) readErrors.add(service.id);
        captureNotes.push({ service, label, message, error });
      };
      if (service.reason || service.availability === "error") {
        addNote(service.reason || "Service logs could not be read.", "", service.availability === "error");
      }
      const streams = service.streams.filter((stream) => !selectedStream || stream.stream === selectedStream);
      if (!streams.some((stream) => stream.lines.length)) withoutOutput.add(service.id);
      for (const stream of streams) {
        const filtered = stream.lines.filter((line) => !query || line.toLocaleLowerCase().includes(query));
        matchingLines += filtered.length;
        for (const line of filtered) {
          const row = document.createElement("div");
          row.className = "app-logs-entry";
          row.dataset.serviceId = service.id;
          row.dataset.stream = stream.stream;
          const origin = document.createElement("span");
          origin.className = "app-logs-origin";
          const source = document.createElement("button");
          source.type = "button";
          source.className = "app-logs-source";
          source.dataset.serviceId = service.id;
          source.textContent = service.label;
          source.title = descriptorText(service);
          source.setAttribute("aria-label", `Show only ${service.label}`);
          // Repeated labels remain clickable without adding a tab stop for every log line.
          source.tabIndex = firstSource ? 0 : -1;
          firstSource = false;
          const streamLabel = document.createElement("span");
          streamLabel.className = "app-logs-stream-label";
          streamLabel.textContent = stream.stream;
          streamLabel.title = stream.label;
          origin.append("[", source, "/", streamLabel, "] ");
          const output = document.createElement("span");
          output.className = "app-logs-output";
          output.setAttribute("aria-label", `${service.label} ${stream.label}`);
          output.textContent = line;
          row.append(origin, output);
          rows.append(row);
        }
        if (stream.reason && stream.reason !== service.reason) addNote(stream.reason, stream.label);
        if (stream.notice && stream.notice !== stream.reason) addNote(stream.notice, stream.label);
        if (!stream.lines.length && !stream.reason && !service.reason) {
          addNote("No log output is available for this stream yet.", stream.label);
        }
      }
      if (!streams.length && !service.reason) {
        addNote("No output is available for the selected stream.");
      }
    }
    if (!matchingLines) {
      emptyMessage(!response ? lastError || "Loading application logs…"
        : query ? "No log lines match the current filters."
          : "No log output is available for the selected services and streams.");
    }
    content.replaceChildren(rows);
    if (focusedSource) {
      [...content.querySelectorAll(".app-logs-source")].find((source) => source.dataset.serviceId === focusedSource)?.focus({ preventScroll: true });
    }
    content.scrollTop = scrollTop;
    capture.hidden = !captureNotes.length;
    capture.dataset.attention = String(readErrors.size > 0);
    const details = [
      readErrors.size ? `${readErrors.size} ${readErrors.size === 1 ? "read error" : "read errors"}` : "",
      withoutOutput.size ? `${withoutOutput.size} without output` : "",
    ].filter(Boolean);
    captureSummary.textContent = `Capture details · ${details.join(" · ") || `${captureNotes.length} ${captureNotes.length === 1 ? "notice" : "notices"}`}`;
    captureList.replaceChildren(...captureNotes.map(({ service, label, message, error }) => {
      const item = document.createElement("li");
      item.dataset.error = String(error);
      item.textContent = `${service.label}${label ? ` · ${label}` : ""}: ${message}`;
      return item;
    }));
    const scopeKey = JSON.stringify(selectedServices);
    if (captureScope !== scopeKey) {
      captureScope = scopeKey;
      capture.open = Boolean(selectedServices.length && !matchingLines && !query);
    }
    displayedLines = matchingLines;
    return matchingLines;
  }

  function render() {
    renderControls();
    renderNotices();
    const matchingLines = renderContent();
    const mode = paused ? "Paused" : "Auto-refreshing";
    const scope = prefilterMissing ? "Selected component unavailable" : serviceSummary.textContent;
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
    buttons.setDisabled(refresh, false);
    root.removeAttribute("aria-busy");
  }

  async function refreshLogs() {
    if (!active() || controller) return;
    const request = new AbortController();
    const serial = ++requestSerial;
    const requestedIds = [...selectedServiceIds];
    controller = request;
    buttons.setDisabled(refresh, true);
    root.setAttribute("aria-busy", "true");
    if (!response) render();
    let followUp = false;
    let matchedServiceId = "";
    try {
      const next = await load({
        serviceId: requestedIds.length === 1 ? requestedIds[0] : null,
        serviceIds: requestedIds.length > 1 ? requestedIds : undefined,
        signal: request.signal,
      });
      if (!active() || request.signal.aborted || serial !== requestSerial) return;
      validateResponse(next, requestedIds);
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
        selectedServiceIds.clear();
        selectedServiceIds.add(matchedServiceId);
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
        buttons.setDisabled(refresh, false);
        root.removeAttribute("aria-busy");
        if (followUp) void refreshLogs();
        else schedule();
      }
    }
  }

  function selectService() {
    initialSelectionResolved = true;
    prefilterMissing = false;
    lastError = "";
    stopRequest();
    render();
    content.scrollTop = 0;
    void refreshLogs();
  }
  serviceChoices.addEventListener("change", (event) => {
    const input = event.target;
    if (input.type !== "checkbox") return;
    if (input.checked) selectedServiceIds.add(input.value);
    else selectedServiceIds.delete(input.value);
    selectService();
  });
  allServices.addEventListener("click", () => {
    selectedServiceIds.clear();
    servicePicker.open = false;
    serviceSummary.focus();
    selectService();
  });
  const closeServicePicker = (event) => {
    if (!servicePicker.contains(event.target)) servicePicker.open = false;
  };
  document.addEventListener("pointerdown", closeServicePicker);
  servicePicker.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    servicePicker.open = false;
    serviceSummary.focus();
  });
  servicePicker.addEventListener("focusout", (event) => {
    if (event.relatedTarget && !servicePicker.contains(event.relatedTarget)) servicePicker.open = false;
  });
  content.addEventListener("click", (event) => {
    const source = event.target.closest(".app-logs-source");
    if (!source || !content.contains(source)) return;
    selectedServiceIds.clear();
    selectedServiceIds.add(source.dataset.serviceId);
    serviceSummary.focus();
    selectService();
  });
  const filterLines = () => { render(); content.scrollTop = 0; };
  streamSelect.addEventListener("change", filterLines);
  search.addEventListener("input", filterLines);
  pause.addEventListener("click", () => {
    paused = !paused;
    buttons.update(pause, { children: paused ? "Resume" : "Pause", "aria-pressed": paused });
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
      document.removeEventListener("pointerdown", closeServicePicker);
      buttons.clear(root);
      root.remove();
    },
  };
}
