import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture, returnToRun } from "./run-settings-test-fixture.mjs";
import { createSandboxBoundaryTools } from "./sandbox-boundary-test.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}
const cdpUrl = process.env.EDGE_CDP_URL;
const skip = !chromium ? "Playwright is unavailable. No browser was launched."
  : !cdpUrl ? "An already-authenticated Microsoft Edge CDP connection was not provided. No browser was launched." : false;

async function chooseTest(page, mode) {
  await page.getByRole("button", { name: "Choose test", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Try a boundary test", exact: true });
  await dialog.getByRole("button", { name: mode === "egress" ? "Test unsafe egress" : "Test unsafe override", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}

function blockedResponse(reasonCode, attempted, enforcement = "python-audit-hook") {
  const aca = enforcement === "aca-egress-proxy";
  return {
    error: "Sandbox input rejected before any model call.",
    blockedResponse: {
      contractVersion: "agent-blocked-response/1.0", kind: "blocked-agent-response",
      responseOrigin: "agent-harness", upstreamHttpStatus: 422, executionKind: "agent-invocation",
      testKind: "sandbox-boundary", mode: aca ? "aca-document-session" : "local-simulation", reasonCode,
      operatorMessage: "Sandbox input rejected before any model call.",
      summary: "The sandbox rejected the staged input.",
      stages: [
        { id: "agent-harness", state: "succeeded", detail: "Request received" },
        { id: "sandbox-tool", state: "rejected", detail: "Rejected", reasonCode },
        { id: "model", state: "not-attempted", detail: "Not attempted" },
        { id: "approval-disclosure", state: "not-applicable", detail: "Not part of this test" },
      ],
      limitations: ["no-model-call", aca ? "cloud-isolation-not-verified" : "local-process-not-isolation-boundary", ...(!attempted ? ["no-hostile-outbound-probe"] : [])],
      evidence: {
        modelAuthoredTextShown: false, outboundDenialProbeAttempted: attempted,
        runtime: {
          agentRuntime: "local", agentIsolation: "local-process", documentToolRuntime: aca ? "aca-custom-container-session" : "local-process-simulation",
          agentSessionDispatched: false, documentSessionDispatched: aca,
          gatewayConfigured: true, gatewayConfigurationScope: "control-plane",
          rawDocumentSentToAgent: false, cloudIsolationVerified: false,
        },
        ...(attempted ? { sandboxProbe: {
          credentialLikeVariableCount: 0, credentialValuesReturned: false, outboundAttempted: true,
          envKeys: ["HOME", "LANG", "PATH"], envKeyCount: 3, secretFilesPresent: false, secretFileCount: 0,
          outboundOutcome: "denied", enforcement, httpStatus: null,
          ...(aca ? { acaDecisionCount: 1, acaDeniedCount: 1, acaDeniedDecision: {
            action: "Denied", method: "HEAD", scheme: "https", host: "exfil-collector.attacker.example",
            path: "/", matchedRule: "deny-external",
          } } : {}),
        } } : {}),
      },
    },
  };
}

for (const scenario of ["default-document", "custom-document", "code-interpreter", "sandbox-node-only"]) {
  test(`Canvas boundary tests stage ${scenario} input and invoke only on explicit action in existing Edge`, { skip }, async t => {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];
    if (!context) { await browser.close(); t.skip("No existing Edge browser context."); return; }
    const page = await context.newPage();
    let fixture;
    try {
      if (!/Edg\//.test(await page.evaluate(() => navigator.userAgent))) {
        t.skip("The connected browser is not Microsoft Edge.");
        return;
      }
      fixture = await createRunSettingsFixture({ sandbox: true });
      const sampleDocument = scenario === "default-document" ? createSandboxBoundaryTools().sampleDocument
        : { name: "field-observations.md", content: "# Field observations\n\nPreserve scientific terminology and citations." };
      const documents = scenario.endsWith("document");
      fixture.state.documentInput = documents ? {
        extensions: [".md", ".txt"], maxBytes: 65536,
        ...(scenario === "custom-document" ? { sampleDocument } : { legacyDocumentTemplate: true }),
      } : false;
      fixture.state.starterPrompt = documents ? "Review the attached record" : "Calculate 21 * 2 in the sandbox";
      fixture.state.sandboxBoundaryTest = scenario === "sandbox-node-only" ? null
        : { available: true, mode: documents ? "document" : "prompt-or-code" };
      const requests = [], outbound = [], errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => { if (!request.url().startsWith(fixture.origin)) outbound.push(request.url()); });
      await page.route("**/api/agent-invoke", async route => {
        const body = route.request().postDataJSON();
        requests.push(body);
        const egress = (body.document?.content || body.message).includes("exfil-collector.attacker.example");
        await route.fulfill({ status: 422, json: blockedResponse(
          egress ? "unauthorized-egress" : "instruction-override", egress,
          egress && scenario === "code-interpreter" ? "aca-egress-proxy" : "python-audit-hook",
        ) });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      if (documents) {
        await page.getByRole("button", { name: "Add document", exact: true }).click();
        await page.getByRole("menuitem", { name: "Add sample", exact: true }).click();
        assert.equal(await page.locator(".document-name").textContent(), sampleDocument.name);
      } else {
        assert.equal(await page.getByRole("button", { name: "Add document", exact: true }).count(), 0);
        assert.equal(await page.getByLabel("Document file", { exact: true }).count(), 0);
      }
      for (const mode of ["override", "egress"]) {
        const previous = requests.length;
        await chooseTest(page, mode);
        assert.equal(requests.length, previous);
        assert.equal(outbound.length, 0, "Canvas never sends the staged hostile probe");
        if (documents) {
          assert.equal(await page.locator(".document-name").textContent(), sampleDocument.name);
          const content = await page.locator(".document-preview").textContent();
          assert.ok(content.startsWith(sampleDocument.content));
          if (scenario === "custom-document") assert.doesNotMatch(content, /loan|borrower|APR|Jordan Alvarez/i);
        } else {
          const content = await prompt.inputValue();
          assert.match(content, mode === "override" ? /ignore policy/i : /os\.environ/);
          assert.doesNotMatch(content, /borrower|APR|Jordan Alvarez/i);
        }
        await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
        await page.locator("[data-blocked-response]").waitFor();
        assert.equal(requests.length, previous + 1);
        assert.equal(Boolean(requests.at(-1).document), documents);
        if (!documents) {
          assert.equal(Object.hasOwn(requests.at(-1), "documents"), false);
          assert.ok(await page.getByRole("region", { name: "Prompt infractions in Agent prompt", exact: true }).isVisible());
        }
        const limitsDisclosure = page.locator(".blocked-agent-disclosure").filter({ hasText: "Limits" });
        await limitsDisclosure.locator("summary").click();
        const limits = await limitsDisclosure.textContent();
        if (mode === "egress") {
          assert.match(limits, /Outbound denial was observed by (python-audit-hook|aca-egress-proxy)/);
          assert.match(limits, /does not verify whole-cloud isolation/);
          assert.doesNotMatch(limits, /No hostile-target|No model call or hostile/);
          assert.match(limits, /Observed sandbox env keys: HOME, LANG, PATH/);
          assert.match(limits, /0 common credential locations present/);
          assert.match(limits, /Verify in code: config\/egress-policy\.yaml/);
          const probeBanner = page.locator("[data-sandbox-probe]");
          await probeBanner.waitFor();
          assert.deepEqual(
            await probeBanner.locator('.blocked-sandbox-msi .run-execution-env-chip[data-tone="amber"]').allTextContents(),
            ["IDENTITY_ENDPOINT", "IDENTITY_HEADER"],
          );
          const layer = page.locator('.run-execution-layer[data-layer="policy-1"]');
          await layer.locator(".run-execution-trigger").click();
          const details = await layer.locator(".run-execution-details").innerText();
          assert.match(details, /keys: HOME, LANG, PATH/);
          assert.match(details, /0 credential locations present/);
          assert.match(details, /src\/tools\/document-validation\/main\.py/);
          if (scenario === "code-interpreter") {
            assert.match(details, /HEAD https:\/\/exfil-collector\.attacker\.example\/ -> Denied/);
            assert.match(details, /deny-external/);
          }
        } else assert.match(limits, /No model call or hostile outbound-target probe was attempted/);
        await returnToRun(page);
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(outbound, []);
    } finally {
      await page.close();
      await browser.close();
      if (fixture) await fixture.close();
    }
  });
}
