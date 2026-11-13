(() => {
  const MAX_MESSAGES = 12;
  const THEME_STORAGE_KEY = "asb-ai-gw-theme";
  const form = document.getElementById("chat-form");
  const input = document.getElementById("prompt-input");
  const transcript = document.getElementById("transcript");
  const emptyState = document.getElementById("empty-state");
  const statusText = document.getElementById("status-text");
  const sendButton = document.getElementById("send-button");
  const stopButton = document.getElementById("stop-button");
  const clearButton = document.getElementById("clear-button");
  const themeToggle = document.getElementById("theme-toggle");
  const chips = document.querySelectorAll(".chip");
  const root = document.documentElement;
  const systemThemeQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: light)")
      : null;

  /** @type {{ role: "user" | "assistant", content: string }[]} */
  let messages = [];
  /** @type {AbortController | null} */
  let activeController = null;

  syncThemeToggle();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const nextTheme = effectiveTheme() === "dark" ? "light" : "dark";
      setThemePreference(nextTheme);
    });
  }

  if (systemThemeQuery) {
    const handleSystemThemeChange = () => {
      if (!readThemePreference()) {
        syncThemeToggle();
      }
    };
    if (typeof systemThemeQuery.addEventListener === "function") {
      systemThemeQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof systemThemeQuery.addListener === "function") {
      systemThemeQuery.addListener(handleSystemThemeChange);
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (activeController) {
        return;
      }
      input.value = chip.dataset.prompt || "";
      input.focus();
    });
  });

  clearButton.addEventListener("click", () => {
    if (activeController) {
      activeController.abort();
    }
    messages = [];
    transcript.replaceChildren(emptyState);
    emptyState.hidden = false;
    setStatus("Conversation cleared.");
    input.focus();
  });

  stopButton.addEventListener("click", () => {
    if (activeController) {
      activeController.abort();
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (activeController) {
      return;
    }

    const prompt = input.value.trim();
    if (!prompt) {
      setStatus("Enter a message before sending.");
      input.focus();
      return;
    }

    input.value = "";
    appendMessage("user", prompt);
    messages.push({ role: "user", content: prompt });
    messages = messages.slice(-MAX_MESSAGES);

    const assistantBody = appendMessage("assistant", "");
    const controller = new AbortController();
    activeController = controller;
    setBusy(true);
    setStatus("Streaming response from Azure AI Gateway...");

    let assistantText = "";
    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorCode = await readErrorCode(response);
        throw new Error(mapErrorCode(response.status, errorCode));
      }

      if (!response.body) {
        throw new Error("The browser did not receive a readable response stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseSseEvent(rawEvent);
          if (parsed) {
            if (parsed.event === "delta" && typeof parsed.data.text === "string") {
              assistantText += parsed.data.text;
              assistantBody.textContent = assistantText;
              transcript.scrollTop = transcript.scrollHeight;
            } else if (parsed.event === "error") {
              throw new Error(parsed.data.message || "The gateway request failed.");
            }
          }
          boundary = buffer.indexOf("\n\n");
        }

        if (done) {
          break;
        }
      }

      if (!assistantText.trim()) {
        assistantText = "No response text was returned.";
        assistantBody.textContent = assistantText;
      }

      messages.push({ role: "assistant", content: assistantText });
      messages = messages.slice(-MAX_MESSAGES);
      setStatus("Ready.");
    } catch (error) {
      if (controller.signal.aborted) {
        if (!assistantText) {
          assistantBody.textContent = "Stopped.";
        }
        setStatus("Generation stopped.");
      } else {
        const message = error instanceof Error ? error.message : "The request failed.";
        assistantBody.textContent = message;
        setStatus(message);
      }
    } finally {
      activeController = null;
      setBusy(false);
      input.focus();
    }
  });

  function appendMessage(role, text) {
    emptyState.hidden = true;
    const wrapper = document.createElement("article");
    wrapper.className = `message message-${role}`;

    const label = document.createElement("div");
    label.className = "message-role";
    label.textContent = role === "user" ? "You" : "Agent";

    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = text;

    wrapper.append(label, body);
    transcript.append(wrapper);
    transcript.scrollTop = transcript.scrollHeight;
    return body;
  }

  function setBusy(isBusy) {
    sendButton.disabled = isBusy;
    input.disabled = isBusy;
    stopButton.hidden = !isBusy;
    chips.forEach((chip) => {
      chip.disabled = isBusy;
    });
  }

  function setStatus(message) {
    statusText.textContent = message;
  }

  function readThemePreference() {
    const attr = root.dataset.theme;
    if (attr === "light" || attr === "dark") {
      return attr;
    }
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        return saved;
      }
    } catch {
      // Ignore storage failures.
    }
    return null;
  }

  function effectiveTheme() {
    const preference = readThemePreference();
    if (preference) {
      return preference;
    }
    return systemThemeQuery && systemThemeQuery.matches ? "light" : "dark";
  }

  function setThemePreference(theme) {
    root.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures.
    }
    syncThemeToggle();
  }

  function syncThemeToggle() {
    if (!themeToggle) {
      return;
    }
    const current = effectiveTheme();
    const next = current === "dark" ? "light" : "dark";
    themeToggle.textContent = `${capitalize(next)} theme`;
    themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
    themeToggle.setAttribute("aria-pressed", String(current === "light"));
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function parseSseEvent(rawEvent) {
    let eventName = "message";
    const dataLines = [];

    for (const line of rawEvent.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    try {
      return {
        event: eventName,
        data: JSON.parse(dataLines.join("\n")),
      };
    } catch {
      return null;
    }
  }

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
      return "The sample is handling the maximum number of active streams. Try again in a moment.";
    }
    if (status === 403 || code === "same_origin_required") {
      return "Requests must originate from this app's public URL.";
    }
    if (status === 413 || code === "payload_too_large" || code === "messages_too_long") {
      return "The conversation is too large. Clear the chat and try a shorter prompt.";
    }
    return "The request could not be completed.";
  }
})();
