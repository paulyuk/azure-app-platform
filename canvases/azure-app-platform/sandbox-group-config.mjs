const SANDBOX_GROUP_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function defaultSandboxGroupName(appName) {
  const slug = text(appName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 49)
    .replace(/-+$/g, "");
  return `aca-sandboxes-${slug || "app"}`;
}

export function normalizeSandboxGroupCreateRequest(input, active = null) {
  const groupName = text(input?.sandboxGroupName);
  if (!groupName) throw new Error("Provide an ACA Sandbox Group name.");
  if (!SANDBOX_GROUP_NAME_PATTERN.test(groupName)) {
    throw new Error(
      "ACA Sandbox Group names must use 2-63 lowercase letters, numbers, or hyphens and start and end with a letter or number.",
    );
  }
  return {
    subscriptionId: text(input?.subscriptionId || active?.subscriptionId),
    resourceGroup: text(input?.resourceGroup || active?.resourceGroup || "rg-app-platform-aigateway"),
    location: text(input?.location || active?.location || "eastus2"),
    groupName,
  };
}
