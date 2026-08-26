/**
 * Server-side client for the deal-finder Foundry Hosted Agent
 * (`src/agent`, `ResponsesHostServer`). Only ever called from Next.js route
 * handlers (Node runtime) — never from the browser, since the agent server
 * does not send CORS headers.
 */

const DEFAULT_AGENT_URL = "http://127.0.0.1:8088";
const DEFAULT_TIMEOUT_MS = 5_000;

interface AgentResponseOutputItem {
  type: string;
  content?: Array<{ type: string; text?: string }>;
}

interface AgentResponsePayload {
  output?: AgentResponseOutputItem[];
}

function agentBaseUrl(): string {
  return (process.env.AGENT_URL ?? DEFAULT_AGENT_URL).replace(/\/+$/, "");
}

/**
 * Calls the agent's `/responses` endpoint and extracts the assistant's
 * plain-text reply, discarding the encrypted reasoning trace item.
 *
 * Uses a short timeout so callers that fall back to mock mode when the
 * agent isn't running (the default dev experience) fail fast instead of
 * hanging the request.
 */
export async function fetchAgentReply(
  input: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
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
    throw new Error(`Could not reach agent at ${agentBaseUrl()}: ${reason}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Agent request failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`
    );
  }

  const payload = (await response.json()) as AgentResponsePayload;
  const messageItem = payload.output?.find((item) => item.type === "message");
  const text = messageItem?.content?.find((c) => c.type === "output_text")?.text;

  if (!text) {
    throw new Error("Agent response did not include a readable message.");
  }

  return text;
}
