import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage for the driveline-web chat UI, run against
 * `next dev` in forced mock mode (see playwright.config.ts) so results are
 * deterministic and independent of the real deal-finder agent.
 *
 * The multi-turn test below is a regression test for the conversation-
 * memory bug: the web app previously only forwarded the latest message to
 * `/api/chat`, so the agent had no memory of prior turns. The fix sends the
 * full message history on every request; this test exercises that by
 * asserting the full transcript (both prior turns) is still present in the
 * DOM after a second turn, and that mock-agent stage transitions still
 * behave correctly across turns.
 */

test.describe("deal-finder chat", () => {
  test("renders the initial assistant greeting", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("chat-message-assistant").first()).toContainText(
      "Hi Maya"
    );
  });

  test("shortlists vehicles for a car-shopping prompt", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("chat-input").fill(
      "Find me an EV under $40,000 with at least 250 miles of range"
    );
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
      "three EVs",
      { timeout: 10_000 }
    );

    // Vehicle shortlist grid should render from the "vehicles" stream event.
    await expect(page.getByText("IONIQ 5")).toBeVisible();
  });

  test("shows a mock-agent badge when the mock scenario generator answers", async ({
    page
  }) => {
    await page.goto("/");

    await page.getByTestId("chat-input").fill(
      "Find me an EV under $40,000 with at least 250 miles of range"
    );
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
      "three EVs",
      { timeout: 10_000 }
    );

    // NEXT_PUBLIC_MOCK=1 in this test run forces every reply through the
    // mock scenario generator — the badge must say so plainly, never
    // silently look like a live-agent reply.
    await expect(page.getByTestId("reply-source-badge")).toContainText("Mock agent");
  });

  test("keeps the conversation running across multiple turns", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("chat-input").fill(
      "Find me an EV under $40,000 with at least 250 miles of range"
    );
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
      "three EVs",
      { timeout: 10_000 }
    );

    // Second turn: ask about payment — a distinct mock-agent intent, not a
    // repeat of turn one. A correct reply here proves /api/chat processed
    // this turn's request correctly.
    await page.getByTestId("chat-input").fill("what would the monthly payment be?");
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
      "$589/month",
      { timeout: 10_000 }
    );

    // Both prior turns must still be present in the transcript — this is
    // what a client that discards history (the pre-fix bug) would still
    // render correctly client-side, but which /api/chat would fail to
    // receive server-side. Combined with the network assertion below,
    // this confirms the whole path works end-to-end.
    const userMessages = page.getByTestId("chat-message-user");
    await expect(userMessages).toHaveCount(2);
    await expect(userMessages.first()).toContainText("under $40,000");
    await expect(userMessages.last()).toContainText("monthly payment");
  });

  test("sends the full message history to /api/chat on every turn", async ({
    page
  }) => {
    // Regression test for the exact bug: assert the request body's
    // `messages` array grows to include every prior turn, not just the
    // latest one.
    const requestBodies: unknown[] = [];
    await page.route("**/api/chat", async (route) => {
      const request = route.request();
      requestBodies.push(request.postDataJSON());
      await route.continue();
    });

    await page.goto("/");

    await page.getByTestId("chat-input").fill("first message");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-input")).toBeEnabled({ timeout: 10_000 });

    await page.getByTestId("chat-input").fill("second message");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-input")).toBeEnabled({ timeout: 10_000 });

    expect(requestBodies).toHaveLength(2);

    const firstRequest = requestBodies[0] as { messages: Array<{ content: string }> };
    const secondRequest = requestBodies[1] as { messages: Array<{ content: string }> };

    // First request: greeting + the user's first message.
    expect(firstRequest.messages.map((m) => m.content)).toEqual(
      expect.arrayContaining(["first message"])
    );

    // Second request must include BOTH prior user turns, not just the
    // latest — this is the assertion that would have failed before the fix.
    const secondContents = secondRequest.messages.map((m) => m.content);
    expect(secondContents).toEqual(expect.arrayContaining(["first message", "second message"]));
    expect(secondRequest.messages.length).toBeGreaterThan(firstRequest.messages.length);
  });

  test("submits an application and reflects the pending-approval stage", async ({
    page
  }) => {
    await page.goto("/");

    await page.getByTestId("chat-input").fill(
      "Find me an EV under $40,000 with at least 250 miles of range"
    );
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
      "three EVs",
      { timeout: 10_000 }
    );
    // Wait for the streaming turn to fully finish (isStreaming -> false)
    // before interacting with Apply — the "done" event and the disabling
    // state update happen after the last "token" event.
    await expect(page.getByTestId("chat-input")).toBeEnabled();

    await page.getByLabel("Customer email").fill("maya@example.com");
    const applyButton = page.getByRole("button", { name: "Apply" });
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
      "Application submitted",
      { timeout: 10_000 }
    );
  });
});
