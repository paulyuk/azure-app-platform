/**
 * Server-side client for the deal-finder Foundry Hosted Agent
 * (`src/agent`, `ResponsesHostServer`). Only ever called from Next.js route
 * handlers (Node runtime) — never from the browser, since the agent server
 * does not send CORS headers.
 */

import type { ChatMessage } from "@/lib/types";

const DEFAULT_AGENT_URL = "http://127.0.0.1:8088";
const DEFAULT_TIMEOUT_MS = 120_000;

interface AgentResponseOutputItem {
  type: string;
  content?: Array<{ type: string; text?: string }>;
}

interface AgentResponsePayload {
  output?: AgentResponseOutputItem[];
  status?: string;
  error?: { code?: string; message?: string };
}

/**
 * Distinguishes *why* a live-agent call didn't produce a reply, so the UI can
 * show ground truth instead of a single generic "mock fallback" state:
 * - "unreachable": nothing is listening on the agent port at all (process not
 *   started, wrong port/URL, crashed).
 * - "timeout": the agent is reachable, but the turn exceeded the configured
 *   response deadline.
 * - "agent_failed": the agent process answered (HTTP 200), but the turn
 *   itself failed server-side — most commonly its MCP tool sources (Hosted
 *   Skills / Foundry Toolbox) didn't initialize. The agent is live; its tools
 *   are not.
 * - "http_error": the agent responded with a non-2xx HTTP status.
 * - "empty_reply": the agent responded successfully but had no readable
 *   message content to extract.
 */
export type AgentErrorKind =
  | "unreachable"
  | "timeout"
  | "agent_failed"
  | "http_error"
  | "empty_reply";

export class AgentClientError extends Error {
  readonly kind: AgentErrorKind;

  constructor(kind: AgentErrorKind, message: string) {
    super(message);
    this.name = "AgentClientError";
    this.kind = kind;
  }
}

function agentBaseUrl(): string {
  return (process.env.AGENT_URL ?? DEFAULT_AGENT_URL).replace(/\/+$/, "");
}

function agentTimeoutMs(): number {
  const configured = process.env.AGENT_TIMEOUT_MS;
  if (!configured) {
    return DEFAULT_TIMEOUT_MS;
  }

  const timeoutMs = Number(configured);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new AgentClientError(
      "timeout",
      `AGENT_TIMEOUT_MS must be a positive integer; received "${configured}".`
    );
  }
  return timeoutMs;
}

/**
 * Calls the agent's `/responses` endpoint with the full conversation history
 * (as Responses-protocol `input` message items, not just the latest turn —
 * the agent server is stateless per-request and has no memory of prior
 * turns unless the full history or a `previous_response_id` is resent) and
 * extracts the assistant's plain-text reply, discarding the encrypted
 * reasoning trace item.
 *
 * Closed ports fail immediately; the longer response timeout is for a live
 * agent completing reasoning and Hosted Skills/model calls. Throws
 * `AgentClientError` with a `kind` so callers
 * (and ultimately the UI) can tell "no agent process" apart from "agent is
 * live but a turn failed" (e.g. MCP tools not connected).
 */
export async function fetchAgentReply(
  messages: ChatMessage[],
  timeoutMs = agentTimeoutMs()
): Promise<string> {
  const input = messages.map((message) => ({
    role: message.role,
    content: message.content
  }));

  let response: Response;
  try {
    response = await fetch(`${agentBaseUrl()}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, stream: false }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AgentClientError(
        "timeout",
        `Agent at ${agentBaseUrl()} did not respond within ${timeoutMs}ms.`
      );
    }
    throw new AgentClientError("unreachable", `Could not reach agent at ${agentBaseUrl()}: ${reason}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AgentClientError(
      "http_error",
      `Agent request failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`
    );
  }

  const payload = (await response.json()) as AgentResponsePayload;

  // The agent server returns HTTP 200 even when the turn itself failed
  // (e.g. its MCP tool sources didn't initialize) — that's a live agent with
  // a broken dependency, not an unreachable agent, so it gets its own kind.
  if (payload.status === "failed") {
    const detail = payload.error?.message ?? "unknown error";
    throw new AgentClientError(
      "agent_failed",
      `Agent is live but the turn failed (likely MCP tool/toolbox not initialized): ${detail}`
    );
  }

  const messageItem = payload.output?.find((item) => item.type === "message");
  const text = messageItem?.content?.find((c) => c.type === "output_text")?.text;

  if (!text) {
    throw new AgentClientError("empty_reply", "Agent response did not include a readable message.");
  }

  return text;
}
