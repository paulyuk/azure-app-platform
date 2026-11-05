import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  defaultSandboxGroupName,
  normalizeSandboxGroupCreateRequest,
} from "./sandbox-group-config.mjs";

test("sandbox group names are app-specific and bounded", () => {
  assert.equal(defaultSandboxGroupName("Loan Approval Demo"), "aca-sandboxes-loan-approval-demo");
  assert.equal(defaultSandboxGroupName(""), "aca-sandboxes-app");
  assert.ok(defaultSandboxGroupName("x".repeat(100)).length <= 63);
});

test("sandbox group creation requires an explicit valid name", () => {
  assert.throws(
    () => normalizeSandboxGroupCreateRequest({}, null),
    /Provide an ACA Sandbox Group name/,
  );
  assert.throws(
    () => normalizeSandboxGroupCreateRequest({ sandboxGroupName: "ACA Samples!" }, null),
    /must use 2-63 lowercase letters/,
  );
  assert.throws(
    () => normalizeSandboxGroupCreateRequest({ sandboxGroupName: "a" }, null),
    /must use 2-63 lowercase letters/,
  );
  assert.deepEqual(normalizeSandboxGroupCreateRequest({
    sandboxGroupName: "aca-sandboxes-loan-app",
    subscriptionId: "sandbox-subscription",
    resourceGroup: "sandbox-resource-group",
    location: "eastus2",
  }, {
    subscriptionId: "gateway-subscription",
    resourceGroup: "gateway-resource-group",
    location: "westus3",
  }), {
    groupName: "aca-sandboxes-loan-app",
    subscriptionId: "sandbox-subscription",
    resourceGroup: "sandbox-resource-group",
    location: "eastus2",
  });
});

test("Canvas creation flow has no shared sample sandbox fallback", async () => {
  const [renderer, extension] = await Promise.all([
    readFile(new URL("./interactive-app-map.mjs", import.meta.url), "utf8"),
    readFile(new URL("./extension.mjs", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(renderer, /aca-sandboxes-samples/);
  assert.doesNotMatch(extension, /aca-sandboxes-samples/);
  assert.match(renderer, /defaultSandboxGroupName\(appName\)/);
  assert.match(extension, /normalizeSandboxGroupCreateRequest\(input, active\)/);
});
