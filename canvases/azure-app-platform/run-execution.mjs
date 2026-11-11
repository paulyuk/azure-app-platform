import { octiconMask } from "./studio-icons.mjs";

export function getRunExecutionLayers({
  state, phase, slow, tools = [], blockedResponse, text = "",
  assessment, submission, hasDocuments = false, runtimeLabel = "Local runtime",
  agentPort = 8088, gatewayName = "", modelName = "", readyServices = "",
}) {
  const sent = phase === "waiting";
  const terminal = state !== "invoking";
  const runtimeReady = phase === "endpoint" || sent;
  const stateLabels = {
    active: "In progress", succeeded: "Verified", failed: "Execution error", blocked: "Policy halt",
    pending: "Queued", "not-run": "Skipped", "not-applicable": "Bypassed", unverified: "Reported only",
  };
  const docs = Array.isArray(submission?.documents) ? submission.documents
    : submission?.document ? [submission.document] : [];
  const docCount = docs.length || (hasDocuments ? 1 : 0);
  const docName = docs[0]?.name || docs[0]?.title || docs[0]?.id || "";
  const prompt = typeof submission?.message === "string" && submission.message.trim()
    ? submission.message.trim() : sent ? "Event / task payload dispatched" : "Staged event / task payload";
  const hostKind = runtimeLabel === "ACA session" ? "ACA session host" : "Local runtime host";
  const layers = [{
    id: "runtime", label: "Local runtime",
    state: runtimeReady ? "succeeded" : terminal ? "failed" : "active",
    detail: runtimeReady ? "Agent endpoint available."
      : terminal ? text : phase === "starting" ? "Starting services and waiting for the agent endpoint."
        : "Checking the local agent.",
    category: "Runtime",
    metadata: [
      { label: "Host", value: hostKind },
      { label: "Endpoint", value: agentPort ? ":" + agentPort : "Agent endpoint" },
      {
        label: "Readiness",
        value: readyServices || (runtimeReady ? "Ready" : terminal ? "Unavailable" : "Starting"),
      },
      { label: "Gateway", value: gatewayName || "AI Gateway route" },
      { label: "Model", value: modelName || "Configured model" },
      {
        label: "Probe",
        value: phase === "waiting" ? "Dispatched" : phase === "endpoint" ? "Verified" : "Preflight",
      },
    ],
  }];
  const stages = Array.isArray(blockedResponse?.stages) ? blockedResponse.stages : [];
  if (!stages.length) {
    const executionState = !sent ? terminal ? "not-run" : "pending"
      : state === "invoking" ? "active" : state === "blocked" ? "blocked"
        : state === "failed" ? "failed" : "succeeded";
    layers.push({
      id: "execution", label: "Agent execution",
      state: executionState,
      detail: !sent ? terminal ? "Task was not sent." : "Waiting for the local runtime."
        : state === "invoking" ? slow ? "Still waiting. Inspect logs for more detail."
          : "Request in flight. Model and tool steps are not streamed."
          : state === "blocked" ? blockedResponse?.operatorMessage || "Request stopped by policy."
            : state === "failed" ? text : "Agent response received.",
      category: "Harness",
      metadata: [
        { label: "Harness", value: modelName || hostKind },
        { label: "Request", value: prompt },
        {
          label: "Attachments",
          value: docName || (docCount > 0 ? docCount + " attached" : "No attachment"),
        },
        {
          label: "Policy",
          value: state === "blocked" ? blockedResponse?.mode || "Enforced"
            : assessment?.state === "approved" ? "Sanitized policy passed" : "Execution boundary",
        },
        {
          label: "Tool reports",
          value: tools.length ? tools.length + " reported" : "No tools reported",
        },
        { label: "Outcome", value: stateLabels[executionState] || executionState },
      ],
    });
  }
  for (const [index, stage] of stages.entries()) {
    const stageLabel = ({
      "agent-harness": "Agent harness", "document-tool": "Document tool / sandbox",
      model: "Model", "approval-disclosure": "Approval / disclosure",
    })[stage.id] || stage.id;
    const stageState = ({
      succeeded: "succeeded", rejected: "blocked", blocked: "blocked",
      failed: "failed", "not-run": "not-run", "not-attempted": "not-run",
      "not-applicable": "not-applicable",
    })[stage.state] || "unverified";
    layers.push({
      id: "policy-" + index,
      label: stageLabel,
      state: stageState,
      detail: stage.detail + (stage.reasonCode ? " · " + stage.reasonCode : ""),
      category: "Policy gate",
      metadata: [
        { label: "Stage", value: stage.id },
        { label: "Result", value: stateLabels[stageState] || stage.state },
        { label: "Reason code", value: stage.reasonCode || "None reported" },
        { label: "Enforcement", value: blockedResponse?.mode || "Boundary check" },
        {
          label: "HTTP status",
          value: blockedResponse?.upstreamHttpStatus ? String(blockedResponse.upstreamHttpStatus) : "Not reported",
        },
        {
          label: "Trace",
          value: stageState === "blocked" ? "Halted at this boundary"
            : stageState === "succeeded" ? "Boundary check passed" : "Stage not executed",
        },
      ],
    });
  }
  for (const [index, tool] of (stages.length ? [] : tools).entries()) {
    const toolState = tool.status === "Failed" ? "failed"
      : ["Completed", "Result returned"].includes(tool.status) ? "succeeded" : "unverified";
    layers.push({
      id: "tool-" + index, label: tool.name,
      state: toolState,
      detail: tool.status === "Call reported"
        ? "Call reported. Successful execution was not confirmed." : tool.status,
      category: "MCP tool",
      metadata: [
        { label: "Tool", value: tool.name },
        { label: "Status", value: tool.status },
        {
          label: "Evidence",
          value: toolState === "succeeded" ? "Completed result confirmed"
            : toolState === "failed" ? "Invocation failed" : "Summary report only",
        },
        { label: "Sequence", value: index + 1 + " of " + tools.length },
        { label: "Runtime", value: hostKind },
        { label: "Verification", value: stateLabels[toolState] || toolState },
      ],
    });
  }
  const total = layers.length;
  for (const [index, layer] of layers.entries()) {
    layer.metadata = [
      { label: "Layer", value: index + 1 + " of " + total + " · " + layer.category },
      ...layer.metadata,
    ];
  }
  return layers;
}

export function createRunExecutionView({
  container, buttons, backIcon, checkIcon = "", alertIcon = "", icons = {}, getLayers, renderResults, onReturn,
}) {
  let view, heading, summary, list, result, latest, resultSignature, previousState;
  const layers = new Map();
  const expandedLayerIds = new Set();
  function append(parent, tag, content, className = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = content;
    parent.append(node);
    return node;
  }
  function update(snapshot) {
    latest = snapshot;
    if (!view) return;
    const items = getLayers(snapshot);
    const busy = snapshot.state === "invoking";
    const issues = items.some(item => ["failed", "blocked"].includes(item.state));
    const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    if (busy && previousState !== "invoking") {
      expandedLayerIds.clear();
    }
    previousState = snapshot.state;
    setText(heading, busy ? "Run in progress" : snapshot.state === "blocked"
      ? "Run blocked" : issues ? "Run needs review" : "Run complete");
    setText(summary, busy
      ? "Follow each execution layer. Returning to Run does not stop the execution."
      : snapshot.state === "failed" && snapshot.phase === "waiting"
        ? "The request failed. Backend execution may still be running."
        : "Statuses reflect reported evidence, not inferred execution.");
    view.dataset.state = snapshot.state;
    list.dataset.mode = busy ? "active" : "compact";
    for (const [index, item] of items.entries()) {
      let row = layers.get(item.id);
      if (!row) {
        row = append(list, "li", "", "run-execution-layer");
        row.dataset.layer = item.id;
        const trail = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        trail.setAttribute("class", "run-execution-trail");
        trail.setAttribute("aria-hidden", "true");
        const rect = document.createElementNS(trail.namespaceURI, "rect");
        for (const [name, value] of Object.entries({ width: "100%", height: "100%", rx: "8", pathLength: "100" })) {
          rect.setAttribute(name, value);
        }
        trail.append(rect);
        row.append(trail);
        const trigger = append(row, "button", "", "run-execution-trigger");
        trigger.type = "button";
        trigger.dataset.appearance = "transparent";
        trigger.id = "run-execution-" + item.id + "-trigger";
        trigger.setAttribute("aria-controls", "run-execution-" + item.id + "-details");
        append(trigger, "span", "", "run-execution-mark").setAttribute("aria-hidden", "true");
        const copy = append(trigger, "span", "", "run-execution-copy");
        append(copy, "strong", "", "run-execution-label");
        append(copy, "span", "", "run-execution-detail");
        append(trigger, "span", "", "run-execution-state");
        append(trigger, "span", "", "run-execution-chevron").setAttribute("aria-hidden", "true");
        const details = append(row, "div", "", "run-execution-details");
        details.id = "run-execution-" + item.id + "-details";
        details.setAttribute("role", "region");
        details.setAttribute("aria-labelledby", trigger.id);
        details.hidden = true;
        append(details, "dl", "", "run-execution-metadata");
        trigger.addEventListener("click", () => {
          if (expandedLayerIds.has(item.id)) expandedLayerIds.delete(item.id);
          else expandedLayerIds.add(item.id);
          const expanded = expandedLayerIds.has(item.id);
          trigger.setAttribute("aria-expanded", String(expanded));
          details.hidden = !expanded;
        });
        layers.set(item.id, row);
      }
      row.dataset.state = item.state;
      const trigger = row.querySelector(".run-execution-trigger");
      const details = row.querySelector(".run-execution-details");
      const expanded = expandedLayerIds.has(item.id);
      trigger.setAttribute("aria-expanded", String(expanded));
      details.hidden = !expanded;
      const mark = row.querySelector(".run-execution-mark");
      const iconName = item.state === "succeeded" ? "check" : ["failed", "blocked"].includes(item.state) ? "alert" : "";
      const iconMarkup = iconName === "check" ? (checkIcon || icons.check || "")
        : iconName === "alert" ? (alertIcon || icons.alert || "") : "";
      const markKey = iconName || String(index + 1).padStart(2, "0");
      if (mark.dataset.markKey !== markKey) {
        mark.dataset.markKey = markKey;
        if (iconName) {
          mark.dataset.icon = iconName;
          if (iconMarkup) mark.innerHTML = iconMarkup;
          else mark.textContent = "";
        } else {
          delete mark.dataset.icon;
          mark.textContent = markKey;
        }
      }
      setText(row.querySelector(".run-execution-label"), item.label);
      setText(row.querySelector(".run-execution-detail"), item.detail);
      const stateText = ({
        active: "Active", succeeded: "Succeeded", failed: "Failed", blocked: "Blocked",
        pending: "Pending", "not-run": "Not run", "not-applicable": "Not applicable", unverified: "Unverified",
      })[item.state];
      setText(row.querySelector(".run-execution-state"), stateText);
      trigger.setAttribute("aria-label", item.label + ". " + stateText + ". " + item.detail);
      trigger.setAttribute("aria-current", item.state === "active" ? "step" : "false");
      const metadata = row.querySelector(".run-execution-metadata");
      const metadataSignature = JSON.stringify(item.metadata || []);
      if (metadata.dataset.signature !== metadataSignature) {
        metadata.replaceChildren();
        for (const entry of (item.metadata || [])) {
          const pair = append(metadata, "div", "", "run-execution-metadata-item");
          append(pair, "dt", entry.label);
          append(pair, "dd", entry.value);
        }
        metadata.dataset.signature = metadataSignature;
      }
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
    }
    for (const [id, row] of layers) {
      if (!items.some(item => item.id === id)) {
        row.remove();
        layers.delete(id);
        expandedLayerIds.delete(id);
      }
    }
    const hideResult = busy || snapshot.state === "idle";
    result.hidden = hideResult;
    const signature = JSON.stringify(snapshot);
    if (signature !== resultSignature) {
      renderResults(result);
      resultSignature = signature;
    }
  }
  function open(snapshot = latest) {
    if (!view) {
      view = append(container, "div", "", "run-execution-view");
      const actions = append(view, "div", "", "run-execution-actions");
      const actionContent = append(actions, "div", "", "run-execution-actions-inner");
      buttons.append(actionContent, buttons.create({
        children: "Back to input", appearance: "subtle", icon: buttons.icon(backIcon), onClick: onReturn,
      }));
      const body = append(view, "div", "", "run-execution-body");
      const content = append(body, "div", "", "run-execution-content");
      const header = append(content, "header", "", "run-execution-header");
      append(header, "span", "EXECUTION", "run-execution-eyebrow");
      const status = append(header, "div", "", "run-execution-status");
      status.setAttribute("role", "status");
      status.setAttribute("aria-atomic", "true");
      heading = append(status, "h2", "", "");
      heading.id = "run-execution-title";
      heading.tabIndex = -1;
      summary = append(status, "p", "");
      list = append(content, "ol", "", "run-execution-layers");
      list.id = "run-execution-layers";
      list.setAttribute("aria-label", "Execution layers");
      result = append(content, "section", "", "run-execution-result");
      result.setAttribute("aria-label", "Run results");
    }
    update(snapshot);
    heading.focus({ preventScroll: true });
  }
  return {
    open, update,
    dispose() {
      if (!view) return;
      buttons.clear(view);
      view.remove();
      view = null;
      resultSignature = undefined;
      previousState = undefined;
      expandedLayerIds.clear();
      layers.clear();
    },
  };
}

export const RUN_EXECUTION_CSS = `
#run-execution-workspace { display:flex; min-width:0; min-height:0; }
#workspace > #run-execution-workspace[hidden] { display:none; }
.run-execution-view { box-sizing:border-box; display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; overflow:hidden; background:var(--studio-raised); color:var(--studio-ink); font:13px/1.5 var(--font-sans,system-ui,sans-serif); }
.run-execution-actions { flex:none; padding:8px 12px; border-bottom:1px solid var(--studio-line); }
.run-execution-actions-inner { display:flex; align-items:center; justify-content:space-between; gap:8px; max-width:960px; margin:0 auto; }
.run-execution-header { min-width:0; }
.run-execution-eyebrow { font-size:10px; font-weight:600; letter-spacing:.12em; color:var(--studio-muted); }
.run-execution-header h2 { margin:4px 0; font-size:20px; letter-spacing:-.3px; }
.run-execution-header h2:focus { outline:none; }
.run-execution-header p { margin:0; color:var(--studio-muted); font-size:12px; }
.run-execution-body { flex:1; min-height:0; min-width:0; padding:16px 12px; overflow:auto; scrollbar-gutter:stable; }
.run-execution-content { display:flex; flex-direction:column; gap:14px; max-width:960px; min-width:0; margin:0 auto; }
.run-execution-content > * { flex-shrink:0; }
.run-execution-layers { display:grid; gap:5px; list-style:none; margin:0; padding:0; }
.run-execution-layer { position:relative; isolation:isolate; box-sizing:border-box; min-width:0; overflow:hidden; border:1px solid var(--studio-line); border-radius:7px; background:var(--studio-panel); }
.run-execution-trigger { appearance:none; box-sizing:border-box; position:relative; z-index:1; display:grid !important; grid-template-columns:20px minmax(0,1fr) auto 14px; align-items:center; justify-content:stretch; justify-items:stretch; gap:7px; width:100%; max-width:none; min-height:32px; padding:3px 7px; border:0; color:inherit; background:transparent; font:inherit; text-align:start; cursor:pointer; }
.run-execution-trigger:hover { background:color-mix(in srgb,var(--studio-ink) 4%,transparent); }
.run-execution-trigger:focus-visible { outline:2px solid var(--studio-focus); outline-offset:-2px; }
.run-execution-mark { display:grid; place-items:center; box-sizing:border-box; width:20px; height:20px; border:1px solid color-mix(in srgb,var(--studio-ink) 28%,var(--studio-line)); border-radius:50%; background:var(--studio-raised); color:var(--studio-ink); font:700 9px/1 var(--font-mono,monospace); }
.run-execution-mark svg { width:16px; height:16px; fill:currentColor; stroke:none; display:block; }
.run-execution-mark[data-icon]:empty::before { content:""; width:16px; height:16px; background:currentColor; mask:${octiconMask("check")} center/contain no-repeat; }
.run-execution-mark[data-icon="alert"]:empty::before { mask:${octiconMask("alert")} center/contain no-repeat; }
.run-execution-copy { display:grid; grid-template-columns:minmax(96px,180px) minmax(0,1fr); align-items:center; gap:7px; min-width:0; }
.run-execution-label { min-width:0; font-size:12px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.run-execution-detail { min-width:0; color:var(--studio-muted); font-size:11px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.run-execution-state { box-sizing:border-box; display:inline-flex; align-items:center; min-height:16px; padding:0 5px; border:1px solid var(--studio-line); border-radius:999px; background:var(--studio-raised); color:var(--studio-muted); font-size:9px; line-height:1.2; white-space:nowrap; }
.run-execution-chevron { width:14px; height:14px; background:currentColor; color:var(--studio-muted); mask:${octiconMask("chevron-down")} center/contain no-repeat; transition:transform .16s ease; }
.run-execution-trigger[aria-expanded="true"] .run-execution-chevron { transform:rotate(180deg); }
.run-execution-details { position:relative; z-index:1; padding:8px 10px 9px 36px; border-top:1px solid var(--studio-line); background:color-mix(in srgb,var(--studio-raised) 58%,var(--studio-panel)); }
.run-execution-details[hidden] { display:none; }
.run-execution-metadata { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px 14px; margin:0; }
.run-execution-metadata-item { min-width:0; }
.run-execution-metadata dt { color:var(--studio-muted); font-size:9px; font-weight:700; line-height:1.25; letter-spacing:.045em; text-transform:uppercase; }
.run-execution-metadata dd { margin:2px 0 0; color:var(--studio-ink); font-size:11px; line-height:1.35; overflow-wrap:anywhere; }
.run-execution-layer[data-state="active"] { border-color:var(--studio-accent); background:color-mix(in srgb,var(--studio-accent) 6%,var(--studio-panel)); }
.run-execution-layer[data-state="active"] :is(.run-execution-mark,.run-execution-state) { color:var(--studio-accent); }
.run-execution-layer[data-state="active"] .run-execution-mark { border-color:var(--studio-accent); background:color-mix(in srgb,var(--studio-accent) 20%,var(--studio-raised)); }
.run-execution-layer[data-state="succeeded"] .run-execution-mark { color:var(--studio-ok); border-color:color-mix(in srgb,var(--studio-ok) 65%,var(--studio-line)); background:var(--studio-raised); }
.run-execution-layer[data-state="succeeded"] .run-execution-state { color:var(--studio-ok); border-color:var(--studio-line); background:var(--studio-raised); }
.run-execution-layer[data-state="unverified"] .run-execution-state { color:var(--studio-warn); border-color:color-mix(in srgb,var(--studio-warn) 45%,var(--studio-line)); background:color-mix(in srgb,var(--studio-warn) 8%,var(--studio-raised)); }
.run-execution-layer:is([data-state="failed"],[data-state="blocked"]) { border-color:color-mix(in srgb,var(--studio-danger) 45%,var(--studio-line)); }
.run-execution-layer:is([data-state="failed"],[data-state="blocked"]) :is(.run-execution-mark,.run-execution-state) { color:var(--studio-danger); }
.run-execution-layer:is([data-state="failed"],[data-state="blocked"]) .run-execution-mark { border-color:var(--studio-danger); background:color-mix(in srgb,var(--studio-danger) 20%,var(--studio-raised)); }
.run-execution-layer:is([data-state="failed"],[data-state="blocked"]) { background:color-mix(in srgb,var(--studio-danger) 4%,var(--studio-panel)); }
.run-execution-trail { display:none; position:absolute; pointer-events:none; inset:0; width:100%; height:100%; overflow:visible; }
.run-execution-layer[data-state="active"] .run-execution-trail { display:block; }
.run-execution-trail rect { fill:none; stroke:var(--studio-accent); stroke-width:2; stroke-linecap:round; stroke-dasharray:12 88; filter:drop-shadow(0 0 3px var(--studio-accent)); animation:run-layer-clockwise 2.4s linear infinite; }
@keyframes run-layer-clockwise { to { stroke-dashoffset:-100; } }
.run-execution-result { min-width:0; overflow-wrap:anywhere; }
.run-execution-result h3 { margin:0 0 10px; font-size:14px; }
.run-execution-result .agent-response { max-height:none; overflow:visible; }
.run-execution-result .command-output { max-width:100%; box-sizing:border-box; white-space:pre-wrap; overflow-wrap:anywhere; }
@media (max-width:430px) {
  .run-execution-body { padding:12px; }
  .run-execution-metadata { grid-template-columns:minmax(0,1fr); }
}
@media (max-width:360px) {
  .run-execution-copy { grid-template-columns:minmax(0,1fr); }
  .run-execution-detail { display:none; }
}
@media (min-width:431px) and (max-width:620px) {
  .run-execution-metadata { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
@media (prefers-reduced-motion:reduce) {
  .run-execution-trail rect { animation:none; stroke-dasharray:none; }
  .run-execution-summary-toggle::before, .run-execution-chevron { transition:none; }
}
`;
