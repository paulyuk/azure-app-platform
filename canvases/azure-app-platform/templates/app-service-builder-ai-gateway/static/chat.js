const form = document.querySelector("#chat-form");
const input = document.querySelector("#prompt-input");
const transcript = document.querySelector("#transcript");
const emptyState = document.querySelector("#empty-state");
const statusText = document.querySelector("#status-text");
const sendButton = document.querySelector("#send-button");
const stopButton = document.querySelector("#stop-button");
const clearButton = document.querySelector("#clear-button");
const promptButtons = Array.from(document.querySelectorAll("[data-prompt]"));
const fileInput = document.querySelector("#document-file-input");
const uploadDocButton = document.querySelector("#upload-doc-button");
const sampleDocButton = document.querySelector("#sample-doc-button");
const pasteDocButton = document.querySelector("#paste-doc-button");
const documentChip = document.querySelector("#document-chip");
const documentChipName = document.querySelector("#document-chip-name");
const removeDocButton = document.querySelector("#remove-doc-button");
const documentPastePanel = document.querySelector("#document-paste-panel");
const documentPasteInput = document.querySelector("#document-paste-input");

const idleHint = "Enter to send · Shift + Enter for a new line";
const maxMessages = 12;
const maxDocumentChars = 12000;
let messages = [];
let attachedDocument = null;
let activeController = null;

function hasMessages() {
  return Boolean(transcript.querySelector(".message"));
}

function setStatus(message, tone = "neutral") {
  statusText.textContent = message;
  if (tone === "neutral") {
    statusText.removeAttribute("data-tone");
  } else {
    statusText.dataset.tone = tone;
  }
}

function updateClearButton() {
  clearButton.disabled = Boolean(activeController) || !hasMessages();
}

function setBusy(isBusy) {
  input.disabled = isBusy;
  sendButton.disabled = isBusy;
  stopButton.hidden = !isBusy;
  if (uploadDocButton) uploadDocButton.disabled = isBusy;
  if (sampleDocButton) sampleDocButton.disabled = isBusy;
  if (pasteDocButton) pasteDocButton.disabled = isBusy;
  if (removeDocButton) removeDocButton.disabled = isBusy;
  if (documentPasteInput) documentPasteInput.disabled = isBusy;
  transcript.setAttribute("aria-busy", String(isBusy));
  promptButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  updateClearButton();
}

function setAttachedDocument(doc) {
  if (!doc || !doc.content || !doc.content.trim()) {
    attachedDocument = null;
    if (documentChip) documentChip.hidden = true;
    if (documentChipName) documentChipName.textContent = "";
    return;
  }
  const trimmed = doc.content.trim().slice(0, maxDocumentChars);
  const name = (doc.name || "document.txt").trim().slice(0, 120) || "document.txt";
  attachedDocument = { name, content: trimmed };
  if (documentChipName) {
    documentChipName.textContent = `${name} (${trimmed.length.toLocaleString()} chars)`;
  }
  if (documentChip) {
    documentChip.hidden = false;
  }
}

async function ensureSampleDocumentAttached() {
  if (attachedDocument) {
    return attachedDocument;
  }
  try {
    const response = await fetch("/api/sample-document");
    if (response.ok) {
      const payload = await response.json();
      if (payload && typeof payload.content === "string" && payload.content.trim()) {
        setAttachedDocument({
          name: typeof payload.name === "string" ? payload.name : "sample-document.md",
          content: payload.content,
        });
        return attachedDocument;
      }
    }
  } catch {
    // Fall back to inline sample below if endpoint is unreachable
  }
  setAttachedDocument({
    name: "sample-document.md",
    content:
      "# Service Architecture & Launch Checklist\n\n" +
      "- **Service**: Northwind Customer Portal (`northwind-portal-prod`)\n" +
      "- **Frontend**: Azure App Service Builder (`builder.yaml`, Python 3.12 + FastAPI)\n" +
      "- **Model Governance**: Azure AI Gateway (`gw-northwind-prod`)\n" +
      "- **Open Risk**: Regional failover alias `chat-fallback` is not yet bound in `eastus2`.\n",
  });
  return attachedDocument;
}

function appendInlineContent(parent, text) {
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) {
      parent.append(document.createTextNode(text.slice(cursor, match.index)));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      parent.append(strong);
    } else {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.append(code);
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    parent.append(document.createTextNode(text.slice(cursor)));
  }
}

function isBlockStart(line) {
  return /^(#{2,3}\s+|```|[-*]\s+|\d+\.\s+)/.test(line.trim());
}

function appendList(fragment, lines, startIndex) {
  const firstLine = lines[startIndex].trim();
  const isOrdered = /^\d+\.\s+/.test(firstLine);
  const isTaskList = /^[-*]\s+\[[ xX]\]\s+/.test(firstLine);
  const list = document.createElement(isOrdered ? "ol" : "ul");
  let index = startIndex;

  if (isTaskList) {
    list.className = "task-list";
  }

  while (index < lines.length) {
    const line = lines[index].trim();
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);

    if (
      (isOrdered && !orderedMatch) ||
      (isTaskList && !taskMatch) ||
      (!isOrdered && !isTaskList && (!unorderedMatch || taskMatch))
    ) {
      break;
    }

    const item = document.createElement("li");
    if (taskMatch) {
      item.className = "task-item";
      const checkbox = document.createElement("span");
      const checked = taskMatch[1].toLowerCase() === "x";
      checkbox.className = "task-box";
      checkbox.dataset.checked = String(checked);
      checkbox.setAttribute("aria-hidden", "true");
      checkbox.textContent = checked ? "✓" : "";
      item.append(checkbox);

      const label = document.createElement("span");
      appendInlineContent(label, taskMatch[2]);
      item.append(label);
    } else {
      appendInlineContent(item, orderedMatch?.[1] ?? unorderedMatch[1]);
    }

    list.append(item);
    index += 1;
  }

  fragment.append(list);
  return index;
}

function renderMarkdown(container, markdown) {
  const fragment = document.createDocumentFragment();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      const pre = document.createElement("pre");
      const code = document.createElement("code");
      if (language) {
        code.dataset.language = language;
      }
      code.textContent = codeLines.join("\n");
      pre.append(code);
      fragment.append(pre);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      const heading = document.createElement(headingMatch[1].length === 2 ? "h2" : "h3");
      appendInlineContent(heading, headingMatch[2]);
      fragment.append(heading);
      index += 1;
      continue;
    }

    if (/^([-*]\s+|\d+\.\s+)/.test(trimmed)) {
      index = appendList(fragment, lines, index);
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    const paragraph = document.createElement("p");
    appendInlineContent(paragraph, paragraphLines.join(" "));
    fragment.append(paragraph);
  }

  container.replaceChildren(fragment);
}

function appendMessage(role, text) {
  emptyState.hidden = true;

  const message = document.createElement("article");
  message.className = `message message-${role}`;

  const roleLabel = document.createElement("div");
  roleLabel.className = "message-role";
  roleLabel.textContent = role === "user" ? "You" : "Agent";

  const body = document.createElement("div");
  body.className = "message-body";
  if (role === "assistant") {
    renderMarkdown(body, text);
  } else {
    body.textContent = text;
  }

  message.append(roleLabel, body);
  transcript.append(message);
  transcript.scrollTop = transcript.scrollHeight;
  updateClearButton();
  return body;
}

function parseEventBlock(block) {
  let eventName = "message";
  const dataLines = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return {
    eventName,
    data: dataLines.join("\n"),
  };
}

async function submitPrompt(prompt) {
  if (documentPastePanel && !documentPastePanel.hidden && documentPasteInput) {
    const pasted = documentPasteInput.value.trim();
    if (pasted) {
      setAttachedDocument({ name: "pasted-document.txt", content: pasted });
    }
  }
  const activeDoc = attachedDocument;
  const userDisplay = activeDoc ? `[Attached: ${activeDoc.name}]\n${prompt}` : prompt;
  appendMessage("user", userDisplay);
  messages.push({ role: "user", content: prompt });
  messages = messages.slice(-maxMessages);
  const assistantBody = appendMessage("assistant", "Thinking…");

  activeController = new AbortController();
  setBusy(true);
  setStatus("Working…");

  let assistantText = "";
  let buffer = "";

  try {
    const requestPayload = activeDoc
      ? { messages, document: activeDoc }
      : { messages };
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
      signal: activeController.signal,
    });

    if (!response.ok || !response.body) {
      const errorCode = await readErrorCode(response);
      throw new Error(mapErrorCode(response.status, errorCode));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let streamFinished = false;

    while (!streamFinished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf("\n\n");

        if (!block.trim()) {
          continue;
        }

        const event = parseEventBlock(block);
        const payload = event.data ? JSON.parse(event.data) : {};

        if (event.eventName === "delta") {
          assistantText += payload.text || "";
          renderMarkdown(assistantBody, assistantText);
          transcript.scrollTop = transcript.scrollHeight;
        } else if (event.eventName === "error") {
          throw new Error(mapErrorCode(502, payload.code || ""));
        } else if (event.eventName === "done") {
          streamFinished = true;
          break;
        }
      }

      if (done) {
        break;
      }
    }

    if (!assistantText) {
      renderMarkdown(assistantBody, "No response was returned. Try the request again.");
    } else {
      messages.push({ role: "assistant", content: assistantText });
      messages = messages.slice(-maxMessages);
    }
    setStatus(idleHint);
  } catch (error) {
    if (error.name === "AbortError") {
      if (!assistantText) {
        renderMarkdown(assistantBody, "Request stopped.");
      }
      setStatus("Request stopped.");
    } else {
      const message = error instanceof Error ? error.message : "The request failed.";
      renderMarkdown(assistantBody, `I couldn't complete that request.\n\n${message}`);
      setStatus(message, "danger");
    }
  } finally {
    activeController = null;
    setBusy(false);
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || activeController) {
    return;
  }

  input.value = "";
  void submitPrompt(prompt);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

promptButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.dataset.attachSample === "true" && !attachedDocument) {
      await ensureSampleDocumentAttached();
    }
    input.value = button.dataset.prompt || "";
    form.requestSubmit();
  });
});

if (uploadDocButton && fileInput) {
  uploadDocButton.addEventListener("click", () => {
    fileInput.click();
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setAttachedDocument({ name: file.name, content });
      if (documentPastePanel) {
        documentPastePanel.hidden = true;
        pasteDocButton?.setAttribute("aria-expanded", "false");
      }
      setStatus(`Attached ${file.name}. Ask a question or click Send.`);
      if (!input.value.trim()) {
        input.value = "Summarize this document, highlight key risks, and list recommended next steps.";
      }
    } catch {
      setStatus("Could not read that file. Try a plain-text or Markdown document.", "danger");
    } finally {
      fileInput.value = "";
    }
  });
}

if (sampleDocButton) {
  sampleDocButton.addEventListener("click", async () => {
    const doc = await ensureSampleDocumentAttached();
    if (doc) {
      setStatus(`Attached ${doc.name}. Ask a question or click Send.`);
      if (!input.value.trim()) {
        input.value = "Summarize this document, highlight key risks, and list recommended next steps.";
      }
      input.focus();
    }
  });
}

if (pasteDocButton && documentPastePanel && documentPasteInput) {
  pasteDocButton.addEventListener("click", () => {
    const nextHidden = !documentPastePanel.hidden;
    documentPastePanel.hidden = nextHidden;
    pasteDocButton.setAttribute("aria-expanded", String(!nextHidden));
    if (!nextHidden) {
      documentPasteInput.focus();
    }
  });
  documentPasteInput.addEventListener("input", () => {
    const text = documentPasteInput.value.trim();
    if (text) {
      setAttachedDocument({ name: "pasted-document.txt", content: text });
    } else if (attachedDocument?.name === "pasted-document.txt") {
      setAttachedDocument(null);
    }
  });
}

if (removeDocButton) {
  removeDocButton.addEventListener("click", () => {
    setAttachedDocument(null);
    if (documentPasteInput) documentPasteInput.value = "";
    if (documentPastePanel) {
      documentPastePanel.hidden = true;
      pasteDocButton?.setAttribute("aria-expanded", "false");
    }
    setStatus(idleHint);
  });
}

stopButton.addEventListener("click", () => {
  activeController?.abort();
});

clearButton.addEventListener("click", () => {
  messages = [];
  transcript.replaceChildren(emptyState);
  emptyState.hidden = false;
  setStatus(idleHint);
  updateClearButton();
  input.focus();
});

async function readErrorCode(response) {
  try {
    const payload = await response.json();
    return typeof payload.error === "string" ? payload.error : "";
  } catch {
    return "";
  }
}

function mapErrorCode(status, code) {
  if (status === 410 || code === "sample_expired") {
    return "This temporary sample deployment has expired.";
  }
  if (status === 429 || code === "sample_busy") {
    return "The app is handling the maximum number of active requests. Try again in a moment.";
  }
  if (status === 403 || code === "same_origin_required") {
    return "Requests must originate from this app.";
  }
  if (status === 413 || code === "payload_too_large" || code === "messages_too_long" || code === "document_too_long") {
    return "The conversation or attached document is too large. Try a shorter document or clear the chat.";
  }
  if (code === "upstream_unavailable") {
    return "The model connection is unavailable. Check your gateway settings and try again.";
  }
  return "The request could not be completed.";
}
