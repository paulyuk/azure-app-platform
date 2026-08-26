"use client";

import type { ChatMessage } from "@/lib/types";
import { FormEvent, useState } from "react";

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (message: string) => Promise<void>;
}

export function ChatPanel({ messages, isStreaming, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) {
      return;
    }
    setDraft("");
    await onSend(trimmed);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Deal finder chat</h2>
        <p className="text-sm text-slate-500">Persona: Maya</p>
      </header>

      <div className="h-[420px] space-y-3 overflow-y-auto px-5 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              message.role === "user"
                ? "ml-auto bg-slate-900 text-white"
                : "bg-slate-100 text-slate-900"
            }`}
          >
            {message.content || "…"}
          </div>
        ))}
      </div>

      <form className="border-t border-slate-100 p-4" onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            placeholder='Try: "EV under $38k, 250+ miles, room for a car seat"'
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isStreaming}
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={isStreaming || !draft.trim()}
          >
            {isStreaming ? "Streaming…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

