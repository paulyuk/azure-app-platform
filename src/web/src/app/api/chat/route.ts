import { buildMockScenario } from "@/lib/mock-agent";
import type { ChatApiRequest, ChatStreamEvent } from "@/lib/types";

const encoder = new TextEncoder();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatApiRequest;
  const latestMessage = body.messages.at(-1)?.content ?? "";
  const useMock = process.env.NEXT_PUBLIC_MOCK !== "0";

  const scenario = useMock
    ? buildMockScenario({
        latestMessage,
        email: body.email,
        command: body.command,
        stage: body.stage
      })
    : {
        assistantReply:
          "Live mode is not wired yet. TODO: call AI Gateway + Foundry hosted agent here.",
        stage: body.stage ?? "idle"
      };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

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

