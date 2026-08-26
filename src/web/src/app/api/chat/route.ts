import { buildMockScenario } from "@/lib/mock-agent";
import { fetchAgentReply } from "@/lib/agent-client";
import type { ChatApiRequest, ChatStreamEvent, MockScenario, ReplySource } from "@/lib/types";

const encoder = new TextEncoder();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatApiRequest;
  const latestMessage = body.messages.at(-1)?.content ?? "";

  // NEXT_PUBLIC_MOCK unset (default): try the real agent first, silently
  // fall back to the mock scenario generator if it's not reachable (e.g.
  // `uv run main.py` isn't running locally). This makes `npm run dev` work
  // against a real agent with zero config when one happens to be up, while
  // still working standalone when it's not.
  // NEXT_PUBLIC_MOCK=1 forces mock (no agent call attempted).
  // NEXT_PUBLIC_MOCK=0 forces live (no fallback — errors surface as-is).
  const mockMode = process.env.NEXT_PUBLIC_MOCK;
  const forceMock = mockMode === "1";
  const forceLive = mockMode === "0";

  let scenario: MockScenario;
  let agentError: string | undefined;
  // Which path actually produced this reply — reported to the client via a
  // "source" stream event so the UI can show ground truth instead of
  // guessing from the client-side NEXT_PUBLIC_MOCK env var (which cannot
  // reflect a same-request fallback, e.g. the agent timing out mid-turn).
  let source: ReplySource;

  if (forceMock) {
    source = "mock";
    scenario = buildMockScenario({
      latestMessage,
      email: body.email,
      command: body.command,
      stage: body.stage
    });
  } else {
    // Live mode (default, or forced via NEXT_PUBLIC_MOCK=0): the agent
    // server (`src/agent`, ResponsesHostServer) has no CORS headers, so the
    // browser can't call it directly. Calling it here, server-side from the
    // Next.js route handler, sidesteps that — this request never touches
    // the browser.
    try {
      const assistantReply = await fetchAgentReply(body.messages);
      source = "agent";
      scenario = { assistantReply, stage: body.stage ?? "idle" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (forceLive) {
        source = "agent";
        agentError = message;
        scenario = { assistantReply: "", stage: body.stage ?? "idle" };
      } else {
        // Default mode: agent not reachable, fall back to mock.
        console.warn(`[api/chat] Agent unreachable, falling back to mock: ${message}`);
        source = "mock";
        scenario = buildMockScenario({
          latestMessage,
          email: body.email,
          command: body.command,
          stage: body.stage
        });
      }
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      // Emit before tokens so the UI can label the reply as it streams in,
      // not just after the fact.
      push({ type: "source", value: source });

      if (agentError) {
        push({ type: "error", value: agentError });
        push({ type: "done" });
        controller.close();
        return;
      }

      const tokens = scenario.assistantReply.split(" ");
      for (const token of tokens) {
        push({ type: "token", value: `${token} ` });
        await sleep(16);
      }

      if (scenario.vehicles) {
        push({ type: "vehicles", value: scenario.vehicles });
      }

      if (scenario.stage) {
        push({ type: "status", value: scenario.stage });
      }

      push({ type: "done" });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

