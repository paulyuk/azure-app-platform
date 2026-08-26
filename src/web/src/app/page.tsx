"use client";

import { ChatPanel } from "@/components/chat-panel";
import { DealStatusPanel } from "@/components/deal-status-panel";
import { ResultsGrid } from "@/components/results-grid";
import type { ChatMessage, ChatStreamEvent, DealStage, ReplySource, Vehicle } from "@/lib/types";
import { useState } from "react";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      content:
        "Hi Maya 👋 I can help you find the right EV, estimate payments, and submit your application."
    }
  ]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stage, setStage] = useState<DealStage>("idle");
  const [email, setEmail] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  // Ground truth for whether the most recent reply actually came from the
  // real agent or the mock scenario generator — reported by the server on
  // every response (see the "source" stream event in route.ts), since a
  // client-side guess based on NEXT_PUBLIC_MOCK can't reflect a same-request
  // fallback (e.g. the agent being unreachable or timing out mid-turn).
  const [lastSource, setLastSource] = useState<ReplySource | null>(null);

  async function runTurn(userText: string, command?: "apply") {
    if (isStreaming) {
      return;
    }

    const userMessage: ChatMessage = { id: makeId(), role: "user", content: userText };
    const assistantId = makeId();
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, { id: assistantId, role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          email,
          command,
          stage
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const event = JSON.parse(line) as ChatStreamEvent;

          if (event.type === "token") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${event.value}` }
                  : message
              )
            );
          }

          if (event.type === "source") {
            setLastSource(event.value);
          }

          if (event.type === "vehicles") {
            setVehicles(event.value);
          }

          if (event.type === "status") {
            setStage(event.value);
          }

          if (event.type === "error") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `Error: ${event.value}` }
                  : message
              )
            );
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: "Sorry, I hit an error. Please try again." }
            : message
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleApply() {
    if (isApplying || isStreaming || !/\S+@\S+\.\S+/.test(email)) {
      return;
    }

    setIsApplying(true);
    await runTurn(`Apply now. My email is ${email}.`, "apply");

    window.setTimeout(() => setStage("approved"), 3500);
    window.setTimeout(() => setStage("offer_emailed"), 7000);
    setIsApplying(false);
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 md:px-6">
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Unity Demo #1 · driveline-web
            </p>
            <h1 className="text-2xl font-bold text-slate-900">Car-buying chat experience</h1>
          </div>
          <span
            data-testid="reply-source-badge"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              lastSource === "mock"
                ? "bg-amber-500 text-white"
                : lastSource === "agent"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-900 text-white"
            }`}
          >
            {lastSource === "mock"
              ? "⚠ Mock agent (no live agent reachable)"
              : lastSource === "agent"
                ? "● Live agent"
                : "Waiting for first reply…"}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.3fr,0.7fr]">
        <ChatPanel messages={messages} isStreaming={isStreaming} onSend={runTurn} />
        <DealStatusPanel
          stage={stage}
          email={email}
          onEmailChange={setEmail}
          onApply={handleApply}
          isApplying={isApplying}
        />
      </div>

      <div className="mt-6">
        <ResultsGrid vehicles={vehicles} />
      </div>
    </main>
  );
}

