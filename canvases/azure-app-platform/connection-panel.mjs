export const CONNECTION_PANEL_CSS = `
  #details[data-mode="connections"] { display:flex; flex-direction:column; padding:0; overflow:hidden; }
  .gateway-connection-page { display:flex; flex-direction:column; flex:1; min-height:0; min-width:0; }
  .connection-page-heading { flex:none; padding:16px 24px 0; }
  .connections-mount { display:flex; flex:1; flex-direction:column; min-height:0; min-width:0; }
  .connections-root { display:flex; flex-direction:column; min-width:0; }
  .connections-root[data-page="true"] { flex:1; min-height:0; }
  .connections-body { min-width:0; }
  .connections-root[data-page="true"] .connections-body { overflow:auto; flex:1; min-height:0; padding:12px 24px 20px; scrollbar-gutter:stable; }
  .connections-current { padding:4px 10px; border-left:2px solid var(--studio-line); margin-bottom:16px; overflow-wrap:anywhere; }
  .connections-current small { color:var(--studio-muted); }
  .connections-current[data-dirty="true"] small { color:var(--studio-warn); }
  .connections-current p { margin:4px 0 0 !important; }
  .connection-section { min-width:0; padding:16px; margin-bottom:12px; border:1px solid var(--studio-line); border-radius:var(--studio-surface-radius, 6px); }
  .connection-section-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:14px; }
  #details .connection-section-heading h3, .studio-settings .connection-section-heading h3 { margin:0; font-size:14px; }
  .connection-fields { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; min-width:0; }
  .connection-fields > .connection-model { grid-column:1 / -1; }
  .connection-inline { display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:end; gap:8px; min-width:0; }
  #details .connections-root .studio-field, .studio-settings .connections-root .studio-field { display:grid; gap:6px; min-width:0; font:inherit; font-weight:400; }
  #details .connections-root .studio-field > span, .studio-settings .connections-root .studio-field > span { font:inherit; font-weight:400; }
  #details .connections-root select, .studio-settings .connections-root select { width:100%; min-width:0; max-width:100%; padding-block:0; }
  .connections-feedback { margin-bottom:12px; }
  .connections-feedback[data-quiet="true"] { margin-bottom:0; }
  .connections-feedback-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
  .connections-footer { flex:none; position:sticky; bottom:0; z-index:1; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 12px; padding:12px 0; border-top:1px solid var(--studio-line); background:var(--studio-raised); }
  .connections-root[data-page="true"] .connections-footer { position:static; padding:12px 24px; }
  .connections-footer small { color:var(--studio-muted); flex:1 1 200px; overflow-wrap:anywhere; }
  .connections-footer-actions { display:flex; flex-wrap:wrap; gap:8px; margin-left:auto; }
  .connections-skeleton { display:grid; gap:14px; }
  .connections-skeleton .connection-section { display:grid; gap:12px; }
  .connections-skeleton h3 { margin:0; }
  .connections-skeleton span { display:block; height:34px; border:1px solid var(--studio-line); border-radius:var(--studio-control-radius, 6px); background:var(--studio-panel); }
  .connections-explanation { margin-top:12px; }
  .connections-explanation summary { cursor:pointer; color:var(--studio-muted); }
  .connections-root [hidden] { display:none !important; }
  @media (max-width:620px) {
    .connection-page-heading { padding:16px 16px 0; }
    .connections-root[data-page="true"] .connections-body { padding:12px 16px 16px; }
    .connections-root[data-page="true"] .connections-footer { padding:10px 16px; }
    .connection-fields { grid-template-columns:minmax(0, 1fr); }
    .connection-section { padding:12px; }
  }
`;

export function createConnectionPanel({ buttons, notices, toolkitComponents, request, tracker, getRuntime, applySelection,
  createGateway, createSandbox, configureModel, openSetup, selectModel }) {
  const views = new Map();
  let options = null;
  let phase = "idle";
  let feedback = "";
  let feedbackIntent = "info";
  let persisted = null;
  let expectedSaved = "";
  let initialized = false;
  let modelContext = "";
  let applying = false;
  let activeRequest = null;
  let draft = { subscriptionId: "", sandboxSubscriptionId: "", gateway: null, model: "", sandbox: null, suggestGateway: true };
  const identity = item => item?.name
    ? [item.subscriptionId || "", item.resourceGroup || "", item.name].map(value => value.toLowerCase()).join("|") : "";
  const selectionKey = value => JSON.stringify([identity(value), value?.model || "", identity(value?.sandboxGroup)]);
  const selection = () => draft.gateway ? { ...draft.gateway, model: draft.model, sandboxGroup: draft.sandbox } : null;
  const dirty = () => initialized && selectionKey(selection()) !== selectionKey(persisted);
  const transient = state => getRuntime().activeStates.includes(state);
  const runtimeBusy = () => {
    const runtime = getRuntime();
    return !runtime.app || Boolean(runtime.lifecycleOperation) || transient(runtime.app.state) ||
      runtime.readiness?.activeGateway?.configurationStatus === "configuring";
  };
  const busy = () => applying || ["loading", "models-loading"].includes(phase);
  const gateways = () => (options?.gateways || []).filter(item =>
    !draft.subscriptionId || draft.subscriptionId === "*" || !item.subscriptionId ||
    item.subscriptionId.toLowerCase() === draft.subscriptionId.toLowerCase());
  const sandboxes = () => (options?.sandboxGroups || []).filter(item =>
    !draft.sandboxSubscriptionId || draft.sandboxSubscriptionId === "*" || !item.subscriptionId ||
    item.subscriptionId.toLowerCase() === draft.sandboxSubscriptionId.toLowerCase());
  const models = () => draft.gateway && modelContext === identity(draft.gateway) ? options?.models || [] : [];
  function canApply() {
    return phase === "ready" && !applying && !runtimeBusy() &&
      gateways().some(item => identity(item) === identity(draft.gateway)) &&
      models().some(item => item.id === draft.model) &&
      sandboxes().some(item => identity(item) === identity(draft.sandbox));
  }
  function text(parent, tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.append(node);
    return node;
  }
  function control(parent, label, onChange) {
    const subscription = label === "Azure subscription" || label === "Sandbox subscription";
    const field = text(parent, subscription ? "div" : "label", "", "studio-field");
    text(field, "span", label === "AI model" ? "Model" : label);
    if (subscription) {
      const node = toolkitComponents.createFilterableDropdown({
        ariaLabel: label, title: label,
        searchPlaceholder: label === "Azure subscription"
          ? "Filter Azure subscriptions by name or ID" : "Filter sandbox subscriptions by name or ID",
        placeholder: label === "Azure subscription" ? "Choose an Azure subscription" : "Choose a sandbox subscription",
        onChange,
      });
      field.append(node);
      return node;
    }
    const node = document.createElement("select");
    node.setAttribute("aria-label", label);
    node.addEventListener("change", () => onChange(node.value));
    field.append(node);
    return node;
  }
  function button(parent, label, onClick, primary = false, accessibleName = label) {
    const node = buttons.create({ children: label, appearance: primary ? "primary" : "secondary",
      "aria-label": accessibleName, onClick });
    buttons.append(parent, node);
    return node;
  }
  function updateOptions(node, items, selected, disabled, placeholder = "") {
    const choices = placeholder ? [{ value: "", label: placeholder }, ...items] : items;
    const fingerprint = JSON.stringify(choices);
    if (node.dataset.filterableDropdown !== undefined) {
      if (node.dataset.options !== fingerprint || node.value !== selected || node.disabled !== disabled) {
        node.update({ options: choices, value: selected, disabled });
        node.dataset.options = fingerprint;
      }
      return;
    }
    if (node.dataset.options !== fingerprint) {
      node.replaceChildren(...choices.map(item => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        return option;
      }));
      node.dataset.options = fingerprint;
    }
    node.value = selected;
    node.disabled = disabled;
  }
  function prune(retain) {
    for (const [container, view] of views) {
      if (container === retain) continue;
      if (container.isConnected && view.root.isConnected) continue;
      notices.clearNotice(view.notice);
      view.subscription.dispose();
      view.sandboxSubscription.dispose();
      buttons.clear(view.root);
      views.delete(container);
    }
  }
  function restoreFocus(previous, key) {
    if (!previous || (document.activeElement !== previous && document.activeElement !== document.body)) return;
    for (const view of views.values()) {
      if (view.root.contains(previous) || !previous.isConnected) {
        const next = key !== "retry" && previous.isConnected && !previous.disabled && previous.checkVisibility()
          ? previous : view[key] || view.refresh;
        if (next && !next.disabled && !next.hidden) next.focus({ preventScroll: true });
        return;
      }
    }
  }
  function syncSaved(source = getRuntime().readiness?.activeGateway) {
    const active = source ? { ...source, sandboxGroup: Object.hasOwn(source, "sandboxGroup")
      ? source.sandboxGroup : getRuntime().readiness?.sandboxGroup || null } : null;
    if (active && (!expectedSaved || selectionKey(active) === expectedSaved)) {
      persisted = active;
      if (expectedSaved && active.configurationStatus !== "configuring") expectedSaved = "";
    }
  }
  function update(retain) {
    prune(retain);
    const runtime = getRuntime();
    const locked = busy() || runtimeBusy();
    const loading = ["loading", "models-loading"].includes(phase);
    const checking = !runtime.app && !runtime.error;
    let message = feedback;
    let intent = feedbackIntent;
    if (applying) message = "Saving connection selection...";
    else if (!runtime.app) { message = runtime.error || "Loading connections..."; intent = runtime.error ? "error" : "info"; }
    else if (runtime.app.state === "failed" && runtime.app.operation === "configuring") { message = runtime.app.error; intent = "error"; }
    else if (transient(runtime.app.state) || runtime.readiness?.activeGateway?.configurationStatus === "configuring") message =
      runtime.app.state === "configuring" || runtime.readiness?.activeGateway?.configurationStatus === "configuring"
      ? "Validating the saved gateway endpoint, API key, and model in the background."
      : "An app operation is in progress. Connections can be changed when it finishes.";
    else if (loading) message = phase === "models-loading" ? "Loading models for the selected gateway..." : "Finding available connections...";
    else if (phase === "ready" && !gateways().length) message = "No AI Gateways found. Choose another subscription or create a gateway.";
    else if (phase === "ready" && !draft.gateway) message = "Choose an AI Gateway to load its models.";
    else if (phase === "ready" && !gateways().some(item => identity(item) === identity(draft.gateway))) message = "The selected gateway is no longer available. Choose a gateway or refresh discovery.";
    else if (phase === "ready" && !models().length) message = "This gateway has no models. Choose another gateway or configure a model.";
    else if (phase === "ready" && !sandboxes().some(item => identity(item) === identity(draft.sandbox))) message =
      "Choose an available sandbox group or create one.";
    for (const view of views.values()) {
      view.form.setAttribute("aria-busy", String(checking || loading || applying));
      view.root.dataset.phase = checking ? "checking" : phase;
      view.summary.hidden = !options && !persisted;
      view.summary.dataset.dirty = String(dirty());
      view.currentLabel.textContent = dirty() ? "Saved connection / Unsaved changes" : "Saved connection";
      view.currentText.textContent = persisted?.name
        ? [persisted.model || "Model not selected", persisted.name,
          persisted.sandboxGroup?.name || "Sandbox not selected"].join(" / ")
        : "No connection has been saved for this app.";
      view.currentState.hidden = !persisted;
      view.currentState.textContent = runtime.readiness?.activeGateway?.configurationStatus === "configuring" || runtime.app?.state === "configuring"
        ? "Validation in progress"
        : runtime.app?.state === "failed" && runtime.app.operation === "configuring" ? "Validation failed"
          : runtime.readiness?.gatewayConfigured && selectionKey(runtime.readiness.activeGateway) === selectionKey(persisted)
            ? "Connection validated" : "Connection not validated";
      view.notice.hidden = !message;
      const quiet = phase === "ready" && message === "Available connections loaded.";
      view.feedbackArea.dataset.quiet = String(quiet);
      view.notice.classList.toggle("visually-hidden", quiet);
      view.feedbackActions.hidden = !loading && !["error", "cancelled"].includes(phase);
      if (message) notices.renderNotice(view.notice, { children: message, intent,
        role: intent === "error" ? "alert" : "status", "aria-live": intent === "error" ? "assertive" : "polite", "aria-atomic": true });
      else notices.clearNotice(view.notice);
      buttons.update(view.cancel, { hidden: !loading, disabled: applying });
      buttons.update(view.retry, { hidden: !["error", "cancelled"].includes(phase), disabled: locked });
      buttons.update(view.setup, { hidden: phase !== "error", disabled: applying });
      view.skeleton.hidden = Boolean(options) || !(checking || loading);
      view.form.hidden = !options;
      const subscriptions = (options?.subscriptions || []).map(item => ({
        value: item.id, label: item.name + (item.isDefault ? " (default)" : "") + " · " + item.id,
      }));
      const scopes = [{ value: "*", label: "All enabled subscriptions",
        description: "Search gateways or sandbox groups across enabled subscriptions." }, ...subscriptions];
      updateOptions(view.subscription, scopes, draft.subscriptionId, locked);
      updateOptions(view.sandboxSubscription, scopes, draft.sandboxSubscriptionId, locked);
      const availableGateways = gateways();
      updateOptions(view.gateway, availableGateways.map(item => ({ value: String(options.gateways.indexOf(item)),
        label: [item.name, item.resourceGroup, draft.subscriptionId === "*" ? subscriptions.find(sub => sub.value === item.subscriptionId)?.label || item.subscriptionId : ""].filter(Boolean).join(" / ") })),
      draft.gateway ? String(options?.gateways.indexOf(draft.gateway)) : "", locked || !availableGateways.length,
      availableGateways.length ? "Choose an AI Gateway" : "No AI Gateways found");
      updateOptions(view.model, models().map(item => ({ value: item.id, label: item.label })), draft.model,
        locked || !models().length, phase === "models-loading" ? "Loading models..." : !models().length ? "No models configured" : "");
      updateOptions(view.sandbox, sandboxes().map(item => ({ value: String(options.sandboxGroups.indexOf(item)),
        label: [item.name, item.resourceGroup, draft.sandboxSubscriptionId === "*" ? subscriptions.find(sub => sub.value === item.subscriptionId)?.label || item.subscriptionId : ""].filter(Boolean).join(" / ") })),
      draft.sandbox ? String(options?.sandboxGroups.indexOf(draft.sandbox)) : "", locked || !sandboxes().length, "Choose a sandbox group");
      view.discoveryWarnings.textContent = (options?.warnings || []).join(" ");
      view.discoveryWarnings.hidden = !view.discoveryWarnings.textContent;
      buttons.setDisabled(view.refresh, locked);
      buttons.setDisabled(view.refreshSandbox, locked);
      buttons.setDisabled(view.createGateway, locked);
      buttons.setDisabled(view.createSandbox, locked);
      buttons.update(view.configure, { hidden: !availableGateways.some(item => identity(item) === identity(draft.gateway)) || Boolean(models().length), disabled: locked });
      buttons.update(view.apply, { disabled: !canApply(), children: applying ? "Applying..." : "Apply connections" });
      buttons.update(view.discard, { hidden: !dirty(), disabled: locked });
      view.footerText.textContent = applying ? "Saving selection; validation may continue in the background."
        : checking ? "Wait for connections to load." : loading ? "Wait for discovery before applying."
          : dirty() ? "Unsaved changes. Apply saves this app's selection." : "No pending changes.";
      if (view.scrollToRestore !== null && !loading) requestAnimationFrame(() => {
        // Shared controls mount asynchronously and can change the scroll range.
        if (view.scrollToRestore === null || !view.root.isConnected || busy()) return;
        view.body.scrollTop = view.scrollToRestore;
        view.scrollToRestore = null;
      });
    }
  }
  async function load(refresh = false, focusKey = "refresh", previous = document.activeElement) {
    if (applying || runtimeBusy()) return;
    const requested = { ...draft };
    const params = new URLSearchParams();
    if (draft.subscriptionId) params.set("subscriptionId", draft.subscriptionId);
    if (draft.sandboxSubscriptionId) params.set("sandboxSubscriptionId", draft.sandboxSubscriptionId);
    if (draft.gateway) { params.set("gatewayName", draft.gateway.name); params.set("resourceGroup", draft.gateway.resourceGroup); }
    if (refresh) params.set("refresh", "1");
    const modelLoad = options && identity(draft.gateway) !== modelContext;
    phase = modelLoad ? "models-loading" : "loading";
    feedback = "";
    feedbackIntent = "info";
    update();
    const discovery = tracker.begin(params.toString(), ({ signal }) => request(params, signal), refresh);
    activeRequest = discovery;
    try {
      const next = await discovery.promise;
      if (!discovery.isCurrent()) return;
      options = next;
      if (next.active) syncSaved(next.active);
      else if (!persisted) syncSaved();
      draft.subscriptionId = next.subscription?.id || requested.subscriptionId;
      draft.sandboxSubscriptionId = next.sandboxSubscriptionId || requested.sandboxSubscriptionId || draft.subscriptionId;
      const retained = next.gateways.find(item => identity(item) === identity(requested.gateway));
      const suggested = next.gateways.find(item => identity(item) === identity(next.suggested));
      draft.gateway = retained || requested.gateway || (requested.suggestGateway ? suggested : null) || null;
      modelContext = next.gateways.some(item => identity(item) === identity(draft.gateway)) ? identity(draft.gateway) : "";
      draft.model = selectModel(next.models || [], identity(requested.gateway) === modelContext ? requested.model : "");
      if (!requested.model && identity(persisted) === modelContext) draft.model = selectModel(next.models || [], persisted?.model);
      if (!initialized) {
        const desired = next.active && Object.hasOwn(next.active, "sandboxGroup")
          ? next.active.sandboxGroup : getRuntime().readiness?.sandboxGroup || next.suggestedSandboxGroup;
        draft.sandbox = (next.sandboxGroups || []).find(item => identity(item) === identity(desired)) || null;
        initialized = true;
      } else {
        draft.sandbox = (next.sandboxGroups || []).find(item => identity(item) === identity(requested.sandbox)) || null;
      }
      phase = "ready";
      feedback = "Available connections loaded.";
      update();
      restoreFocus(previous, focusKey);
    } catch (error) {
      if (!discovery.isCurrent() || error?.name === "AbortError") return;
      phase = "error";
      feedback = error.message;
      feedbackIntent = "error";
      update();
      restoreFocus(previous, "retry");
    } finally { if (activeRequest === discovery) activeRequest = null; }
  }
  function cancel() {
    activeRequest?.abort();
    activeRequest = null;
    phase = "cancelled";
    feedback = "Discovery cancelled. No connection changes were applied.";
    feedbackIntent = "info";
    const previous = document.activeElement;
    update();
    restoreFocus(previous, "retry");
  }
  async function apply() {
    if (!canApply()) return;
    applying = true;
    tracker.invalidate();
    feedback = "";
    update();
    try {
      const result = await applySelection(selection());
      persisted = result.active;
      expectedSaved = selectionKey(persisted);
      feedback = "Connection selection saved. Runtime readiness reports validation progress.";
      feedbackIntent = "info";
    } catch (error) {
      feedback = error.message;
      feedbackIntent = "error";
    } finally {
      applying = false;
      update();
    }
  }
  function render(container, { page = false, scrollTop = null } = {}) {
    prune();
    if (views.has(container)) { update(); return; }
    const root = text(container, "div", "", "connections-root");
    root.dataset.page = String(page);
    const body = text(root, "div", "", "connections-body");
    const summary = text(body, "div", "", "connections-current");
    const currentLabel = text(summary, "small", "Current connection");
    const currentText = text(summary, "p", "");
    const currentState = text(summary, "small", "");
    const feedbackArea = text(body, "div", "", "connections-feedback");
    const notice = text(feedbackArea, "div", "");
    const feedbackActions = text(feedbackArea, "div", "", "connections-feedback-actions");
    const cancelButton = button(feedbackActions, "Cancel scan", cancel, false, "Cancel Azure discovery scan");
    const retry = button(feedbackActions, "Retry scan", () => { void load(true); });
    const setup = button(feedbackActions, "Open guided gateway setup", openSetup);
    const discoveryWarnings = text(body, "p", "", "error");
    const skeleton = text(body, "div", "", "connections-skeleton");
    skeleton.setAttribute("aria-hidden", "true");
    for (const title of ["Model access", "Sandbox execution"]) {
      const section = text(skeleton, "section", "", "connection-section");
      text(section, "h3", title);
      text(section, "span", "");
      text(section, "span", "");
    }
    const form = text(body, "div", "");
    form.setAttribute("role", "group");
    form.setAttribute("aria-label", "Connection choices");
    function section(title) {
      const section = text(form, "section", "", "connection-section");
      section.setAttribute("aria-label", title);
      const heading = text(section, "div", "", "connection-section-heading");
      text(heading, "h3", title);
      const fields = text(section, "div", "", "connection-fields");
      return { section, heading, fields };
    }
    const modelSection = section("Model access");
    const refresh = button(modelSection.heading, "Refresh", () => { void load(true); }, false, "Refresh subscriptions & gateways");
    const subscription = control(modelSection.fields, "Azure subscription", value => {
      draft.subscriptionId = value; draft.gateway = null; draft.model = ""; draft.suggestGateway = true;
      modelContext = ""; void load(false, "subscription");
    });
    const gatewayInline = text(modelSection.fields, "div", "", "connection-inline");
    const gateway = control(gatewayInline, "AI Gateway", value => {
      draft.gateway = options.gateways[Number(value)] || null; draft.model = ""; void load(true, "gateway");
    });
    const createGatewayButton = button(gatewayInline, "Create", () => createGateway(draft.subscriptionId), false, "Create Gateway");
    const modelGroup = text(modelSection.fields, "div", "", "connection-model");
    const model = control(modelGroup, "AI model", value => { draft.model = value; update(); });
    const configure = button(modelGroup, "Configure Model", () => configureModel(draft.gateway));
    const execution = section("Sandbox execution");
    const refreshSandbox = button(execution.heading, "Refresh", () => { void load(true); }, false, "Refresh sandbox groups");
    const sandboxSubscription = control(execution.fields, "Sandbox subscription", value => {
      draft.sandboxSubscriptionId = value; draft.sandbox = null; void load(false, "sandboxSubscription");
    });
    const sandboxInline = text(execution.fields, "div", "", "connection-inline");
    const sandbox = control(sandboxInline, "ACA Sandbox Group", value => {
      draft.sandbox = value === "" ? null : options.sandboxGroups[Number(value)] || null; update();
    });
    const createSandboxButton = button(sandboxInline, "Create", () => createSandbox({
      subscriptionId: draft.sandboxSubscriptionId, gatewaySubscriptionId: draft.subscriptionId, gateway: draft.gateway,
    }), false, "Create Sandbox Group");
    const explanation = text(form, "details", "", "connections-explanation");
    text(explanation, "summary", "What Apply changes");
    text(explanation, "p", "Apply saves this app's gateway, model, and sandbox selection, then validates the connection. Create actions use a separate resource workflow.");
    const footer = text(root, "div", "", "connections-footer");
    const footerText = text(footer, "small", "");
    const actions = text(footer, "div", "", "connections-footer-actions");
    const discard = button(actions, "Discard", () => {
      if (busy()) return;
      draft = { subscriptionId: persisted?.subscriptionId || draft.subscriptionId,
        sandboxSubscriptionId: persisted?.sandboxGroup?.subscriptionId || persisted?.subscriptionId || draft.sandboxSubscriptionId,
        gateway: persisted, model: persisted?.model || "",
        sandbox: persisted?.sandboxGroup || null, suggestGateway: false };
      void load(false, "gateway");
    });
    const applyButton = button(actions, "Apply connections", () => { void apply(); }, true);
    applyButton.dataset.gatewayApply = "true";
    const view = { root, body, scrollToRestore: scrollTop, summary, currentLabel, currentText, currentState, notice, feedbackArea, feedbackActions,
      cancel: cancelButton, retry, setup,
      discoveryWarnings, skeleton, form, subscription, gateway, model, configure, sandboxSubscription, sandbox,
      refresh, refreshSandbox, createGateway: createGatewayButton,
      createSandbox: createSandboxButton, apply: applyButton, discard, footerText };
    views.set(container, view);
    for (const event of ["wheel", "pointerdown", "keydown"]) body.addEventListener(event, () => { view.scrollToRestore = null; }, { passive: true });
    syncSaved();
    update(container);
    queueMicrotask(() => {
      prune();
      if (root.checkVisibility() && phase === "idle" && !runtimeBusy()) void load();
    });
  }
  return {
    render,
    updateRuntime() {
      syncSaved();
      update();
      if ([...views.values()].some(view => view.root.checkVisibility()) && phase === "idle" && !runtimeBusy()) void load();
    },
    invalidate() {
      tracker.invalidate();
      activeRequest = null;
      if (!applying) phase = "idle";
    },
    dispose() {
      tracker.invalidate();
      for (const view of views.values()) {
        notices.clearNotice(view.notice); buttons.clear(view.root);
        view.subscription.dispose();
        view.sandboxSubscription.dispose();
      }
      views.clear();
    },
  };
}
