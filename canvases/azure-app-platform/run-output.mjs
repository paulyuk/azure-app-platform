export function parseRuntimeOutputLine(line) {
  const leading = line.match(/^\[([^\]\r\n]{1,100})\]\s*/);
  const candidate = leading?.[1] || "";
  const prefix = /^[a-z][a-z0-9._/ -]*$/i.test(candidate)
    && !/^(?:trace|debug|info|information|warn|warning|error|err|fatal|critical|fail|failed)$/i.test(candidate)
    ? candidate : "";
  let message = prefix ? line.slice(leading[0].length) : line;
  message = message.replace(/^(?:\[\d{4}-\d\d-\d\d[T ][^\]]+\]|\d{4}-\d\d-\d\d(?:[T ][\d:.,+-]+Z?)?)\s*/, "");
  const severity = message.match(/^(?:\[(error|err|fatal|critical|fail|failed|warn|warning)\]|(error|err|fatal|critical|fail|failed|warn|warning))(?=\s|[:|!-]|$)/i);
  const level = severity
    ? /^(?:warn|warning)$/i.test(severity[1] || severity[2]) ? "warning" : "error"
    : /^Traceback\b/i.test(message)
      || (["http", "egress"].includes(prefix.toLowerCase())
        && /\b(?:status=|HTTP(?:\/\d(?:\.\d)?)?\s+)(?:4\d\d|5\d\d)\b/i.test(message))
      || /^HTTP(?:\/\d(?:\.\d)?)?\s+(?:4\d\d|5\d\d)\b/i.test(message)
      ? "error" : "";
  return { prefix, level };
}

export function hasNewOutputLines(previous, next) {
  const remaining = new Map();
  for (const line of previous) remaining.set(line, (remaining.get(line) || 0) + 1);
  for (const line of next) {
    const count = remaining.get(line) || 0;
    if (!count) return true;
    remaining.set(line, count - 1);
  }
  return false;
}

export function createRunOutput({
  buttons,
  appendText,
  actionButton,
  renderFormattedOutput,
  parseLine,
  hasNewLines,
  onClear,
  onOpenAll,
  onRetry,
  onSummaryChange,
}) {
  let latestLines = null;
  let displayedLines = null;
  let loadError = "";
  let actionError = "";
  let source = "all";
  let level = "all";
  let paused = false;
  let visible = false;
  let unseen = false;
  let emptyMessage = "";
  let elements;
  let renderedContent = "";
  let renderedPrefixes = "";

  function summary() {
    const result = {
      status: loadError ? "unavailable" : latestLines === null ? "loading" : latestLines.length ? "available" : "empty",
      errors: 0,
      warnings: 0,
      paused,
      unseen,
    };
    if (result.status === "available") {
      for (const line of latestLines) {
        const severity = parseLine(line).level;
        if (severity === "error") result.errors++;
        if (severity === "warning") result.warnings++;
      }
    }
    return result;
  }

  function prefixOptions() {
    const prefixes = new Set();
    for (const line of [...(latestLines || []), ...(displayedLines || [])]) {
      const prefix = parseLine(line).prefix;
      if (prefix) prefixes.add(prefix);
    }
    if (source.startsWith("prefix:")) prefixes.add(source.slice(7));
    return [
      { value: "all", label: "All prefixes" },
      { value: "unlabeled", label: "Unlabeled" },
      ...[...prefixes].sort((a, b) => a.localeCompare(b))
        .map(prefix => ({ value: "prefix:" + prefix, label: "[" + prefix + "]" })),
    ];
  }

  function filteredLines() {
    return (displayedLines || []).filter(line => {
      const parsed = parseLine(line);
      const sourceMatches = source === "all" || (source === "unlabeled"
        ? !parsed.prefix : source === "prefix:" + parsed.prefix);
      const levelMatches = level === "all" || (level === "issues"
        ? parsed.level === "error" || parsed.level === "warning" : parsed.level === level);
      return sourceMatches && levelMatches;
    });
  }

  function displayLatest() {
    displayedLines = latestLines?.slice() ?? null;
    if (displayedLines?.length) emptyMessage = "";
  }

  function paint() {
    const current = summary();
    onSummaryChange(current);
    if (!elements?.output.isConnected) return;
    const { output, prefixControl, levelControl, pauseButton, retryButton, status } = elements;
    const options = prefixOptions();
    const prefixesKey = JSON.stringify(options);
    if (prefixesKey !== renderedPrefixes) {
      buttons.update(prefixControl, { options });
      renderedPrefixes = prefixesKey;
    }
    prefixControl.value = source;
    levelControl.value = level;
    buttons.update(pauseButton, {
      children: paused ? "Resume" : "Pause",
      "aria-pressed": paused,
      title: paused ? "Resume displaying output" : "Pause the displayed output; polling continues",
    });
    const retryVisible = Boolean(loadError);
    if (!retryVisible && document.activeElement === retryButton) output.focus({ preventScroll: true });
    buttons.host(retryButton).hidden = !retryVisible;

    const statusText = [
      loadError ? "Output unavailable: " + loadError + (displayedLines ? ". Showing the last loaded output." : ".")
        : latestLines === null ? "Loading runtime output."
          : paused ? "Display paused. Counts still use the latest loaded output."
            : "Counts reflect recognized lines in shared output; other issues may be missed. Source order is not a timeline.",
      paused && unseen ? "New output available." : "",
      actionError,
    ].filter(Boolean).join(" ");
    if (status.textContent !== statusText) status.textContent = statusText;
    status.dataset.error = String(Boolean(loadError || actionError));

    const filtered = filteredLines();
    const text = displayedLines === null
      ? loadError ? "Unable to load output. Retry or wait for the next refresh." : "Loading runtime output…"
      : filtered.length ? filtered.join("\n")
        : displayedLines.length ? "No output matches these filters."
        : emptyMessage || "No command output yet. Logs will appear when available.";
    const contentKey = JSON.stringify([text, source, level]);
    if (contentKey !== renderedContent) {
      const following = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
      const scrollTop = output.scrollTop;
      renderFormattedOutput(output, text);
      if (following) output.scrollTop = output.scrollHeight;
      else output.scrollTop = scrollTop;
      renderedContent = contentKey;
    }
    output.setAttribute("aria-busy", String(current.status === "loading"));
  }

  return {
    render(container) {
      const controls = appendText(container, "div", "", "run-output-controls");
      const prefixControl = buttons.field({
        kind: "Select", label: "Prefix", "aria-label": "Output prefix",
        options: prefixOptions(), defaultValue: source,
      });
      prefixControl.dataset.outputPrefix = "true";
      prefixControl.dataset.actionKey = "output-prefix";
      prefixControl.addEventListener("change", () => { source = prefixControl.value; paint(); });
      const levelControl = buttons.field({
        kind: "Select", label: "Level", "aria-label": "Output level",
        options: [
          { value: "all", label: "All logs" },
          { value: "issues", label: "Errors and warnings" },
          { value: "error", label: "Errors" },
          { value: "warning", label: "Warnings" },
        ],
        defaultValue: level,
      });
      levelControl.dataset.outputLevel = "true";
      levelControl.dataset.actionKey = "output-level";
      levelControl.addEventListener("change", () => { level = levelControl.value; paint(); });
      const pauseButton = buttons.create({
        children: paused ? "Resume" : "Pause",
        appearance: "secondary",
        size: "small",
        "aria-pressed": paused,
        onClick: () => {
          paused = !paused;
          if (!paused) {
            displayLatest();
            if (visible) unseen = false;
          }
          paint();
        },
      });
      pauseButton.dataset.outputPause = "true";
      pauseButton.dataset.actionKey = "output-pause";
      buttons.append(controls, prefixControl, levelControl);
      const actions = appendText(controls, "div", "", "run-output-actions");
      const clearButton = buttons.create({
        children: "Clear",
        size: "small",
        appearance: "secondary",
        className: "studio-action command-output-clear",
        onClick: onClear,
      });
      clearButton.dataset.clearOutput = "true";
      clearButton.title = "Clear command output";
      buttons.append(actions, pauseButton, clearButton, actionButton("Open all logs", onOpenAll));

      const statusRow = appendText(container, "div", "", "run-output-status-row");
      const status = appendText(statusRow, "p", "", "run-output-status");
      status.dataset.outputStatus = "true";
      status.setAttribute("role", "status");
      const retryButton = buttons.create({
        children: "Retry output", appearance: "secondary", size: "small", onClick: onRetry,
      });
      retryButton.dataset.outputRetry = "true";
      retryButton.dataset.actionKey = "output-retry";
      buttons.append(statusRow, retryButton);

      const output = appendText(container, "pre", "", "command-output live-output");
      output.dataset.runtimeOutput = "true";
      output.dataset.runScrollKey = "output";
      output.tabIndex = 0;
      output.setAttribute("aria-label", "Runtime output");
      elements = { output, prefixControl, levelControl, pauseButton, retryButton, status };
      renderedContent = "";
      renderedPrefixes = "";
      paint();
    },
    receive(lines) {
      if (hasNewLines(latestLines || [], lines) && (paused || !visible)) unseen = true;
      latestLines = lines.slice();
      if (!paused) displayLatest();
      loadError = "";
      paint();
    },
    unavailable(message) {
      loadError = message;
      paint();
    },
    actionFailed(message) {
      actionError = message;
      paint();
    },
    cleared() {
      latestLines = [];
      displayedLines = [];
      emptyMessage = "Command output cleared. Waiting for new output.";
      loadError = "";
      actionError = "";
      unseen = false;
      paint();
    },
    setVisible(value) {
      if (visible === value) return;
      visible = value;
      if (visible && !paused) unseen = false;
      paint();
    },
    startInvocation() {
      source = "all";
      level = "all";
      paused = false;
      displayLatest();
      if (visible) unseen = false;
      actionError = "";
      paint();
    },
    showIssues() {
      const current = summary();
      source = "all";
      level = current.errors || current.warnings ? "issues" : "all";
      paused = false;
      displayLatest();
      unseen = false;
      paint();
    },
    focus() {
      if (!elements?.output.isConnected) return;
      elements.output.scrollTop = 0;
      elements.output.focus({ preventScroll: true });
    },
  };
}
