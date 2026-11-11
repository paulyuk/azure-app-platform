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
    const renderInline = (parent, source) => {
      const pattern = /`([^`\n]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\*\*\*([^\n]+?)\*\*\*|___([^\n]+?)___|\*\*([^\n]+?)\*\*|__([^\n]+?)__|~~([^\n]+?)~~|\*([^*\n]+)\*|(?<![\w*])_([^_\n]+)_(?![\w*])/g;
      let lastIndex = 0;
      let match;
      while ((match = pattern.exec(source)) !== null) {
        if (match.index > lastIndex) {
          parent.append(document.createTextNode(source.slice(lastIndex, match.index)));
        }
        if (match[1] !== undefined) {
          append(parent, "code", match[1]);
        } else if (match[2] !== undefined) {
          const link = append(parent, "a", "");
          link.href = match[3];
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          renderInline(link, match[2]);
        } else if (match[4] !== undefined || match[5] !== undefined) {
          const strong = append(parent, "strong", "");
          const em = append(strong, "em", "");
          renderInline(em, match[4] ?? match[5]);
        } else if (match[6] !== undefined || match[7] !== undefined) {
          const strong = append(parent, "strong", "");
          renderInline(strong, match[6] ?? match[7]);
        } else if (match[8] !== undefined) {
          const del = append(parent, "del", "");
          renderInline(del, match[8]);
        } else if (match[9] !== undefined || match[10] !== undefined) {
          const em = append(parent, "em", "");
          renderInline(em, match[9] ?? match[10]);
        }
        lastIndex = pattern.lastIndex;
      }
      if (lastIndex < source.length) {
        parent.append(document.createTextNode(source.slice(lastIndex)));
      }
    };
    const splitTableRow = (rowText) =>
      rowText.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
    const isTableDelimiter = (line) =>
      /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line || "");
    const rawText = String(text ?? "");
    const normalizedText = rawText.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
    if (!normalizedText) {
      root.textContent = rawText;
    } else {
      const lines = normalizedText.split("\n");
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
          i++;
          continue;
        }
        const fenceMatch = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`~]*)\s*$/);
        if (fenceMatch) {
          const fence = fenceMatch[1];
          const lang = fenceMatch[2] || "";
          const codeLines = [];
          i++;
          while (i < lines.length && !new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(lines[i])) {
            codeLines.push(lines[i]);
            i++;
          }
          if (i < lines.length) i++;
          const pre = append(root, "pre", "", "agent-md-pre");
          const code = append(pre, "code", codeLines.join("\n"), "agent-md-code");
          if (lang) code.dataset.lang = lang;
          continue;
        }
        const headingMatch = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*$/);
        if (headingMatch) {
          const tag = `h${headingMatch[1].length}`;
          const heading = append(root, tag, "", "agent-md-heading");
          renderInline(heading, headingMatch[2]);
          i++;
          continue;
        }
        if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
          append(root, "hr", "");
          i++;
          continue;
        }
        if (/^\s*>\s?/.test(line)) {
          const quoteLines = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
            i++;
          }
          const blockquote = append(root, "blockquote", "");
          const p = append(blockquote, "p", "");
          renderInline(p, quoteLines.join("\n"));
          continue;
        }
        if (line.includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
          const headers = splitTableRow(line);
          const alignments = splitTableRow(lines[i + 1]).map(cell =>
            cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left");
          i += 2;
          const wrap = append(root, "div", "", "agent-md-table-wrap");
          const table = append(wrap, "table", "");
          const thead = append(table, "thead", "");
          const headRow = append(thead, "tr", "");
          headers.forEach((cell, idx) => {
            const th = append(headRow, "th", "");
            if (alignments[idx]) th.style.textAlign = alignments[idx];
            renderInline(th, cell);
          });
          const tbody = append(table, "tbody", "");
          while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
            const cells = splitTableRow(lines[i]);
            const tr = append(tbody, "tr", "");
            headers.forEach((_, idx) => {
              const td = append(tr, "td", "");
              if (alignments[idx]) td.style.textAlign = alignments[idx];
              renderInline(td, cells[idx] ?? "");
            });
            i++;
          }
          continue;
        }
        const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (listMatch) {
          const ordered = /\d/.test(listMatch[2]);
          const list = append(root, ordered ? "ol" : "ul", "");
          while (i < lines.length) {
            const itemMatch = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
            if (!itemMatch || (/\d/.test(itemMatch[2]) !== ordered)) break;
            const li = append(list, "li", "");
            renderInline(li, itemMatch[3]);
            i++;
          }
          continue;
        }
        const paragraphLines = [];
        while (
          i < lines.length &&
          lines[i].trim() &&
          !/^\s*(`{3,}|~{3,})/.test(lines[i]) &&
          !/^\s*#{1,6}\s+/.test(lines[i]) &&
          !/^\s*(?:[-*_]\s*){3,}$/.test(lines[i]) &&
          !/^\s*>\s?/.test(lines[i]) &&
          !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]) &&
          !(lines[i].includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1]))
        ) {
          paragraphLines.push(lines[i]);
          i++;
        }
        const p = append(root, "p", "");
        renderInline(p, paragraphLines.join("\n"));
      }
    }
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
