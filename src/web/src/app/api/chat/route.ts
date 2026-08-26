import { buildMockScenario } from "@/lib/mock-agent";
import { fetchAgentReply } from "@/lib/agent-client";
import type { ChatApiRequest, ChatStreamEvent, MockScenario } from "@/lib/types";

const encoder = new TextEncoder();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatApiRequest;
  const latestMessage = body.messages.at(-1)?.content ?? "";
  const useMock = process.env.NEXT_PUBLIC_MOCK !== "0";

  let scenario: MockScenario;
  let agentError: string | undefined;

  if (useMock) {
    scenario = buildMockScenario({
      latestMessage,
      email: body.email,
      command: body.command,
      stage: body.stage
    });
  } else {
    // Live mode: the agent server (`src/agent`, ResponsesHostServer) has no
    // CORS headers, so the browser can't call it directly. Calling it here,
    // server-side from the Next.js route handler, sidesteps that — this
    // request never touches the browser.
    try {
      const assistantReply = await fetchAgentReply(latestMessage);
      scenario = { assistantReply, stage: body.stage ?? "idle" };
    } catch (error) {
      agentError = error instanceof Error ? error.message : String(error);
      scenario = { assistantReply: "", stage: body.stage ?? "idle" };
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

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

