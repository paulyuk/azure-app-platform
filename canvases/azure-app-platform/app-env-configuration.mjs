import { access, readdir, readFile, writeFile } from "node:fs/promises";

export function parseEnvVariables(envContent) {
  const variables = {};
  for (const line of String(envContent || "").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1).trim();
    }
    variables[match[1]] = value;
  }
  return variables;
}

export async function syncHostedSkillGatewaySettings(root, envContent) {
  const parsed = parseEnvVariables(envContent);
  const endpoint = String(parsed.AZURE_AI_GATEWAY_ENDPOINT || parsed.AI_GATEWAY_BASE_URL || "").trim().replace(/\/default\/models\/openai\/v1\/?$/, "").replace(/\/+$/, "");
  const apiKey = String(parsed.AZURE_AI_GATEWAY_API_KEY || parsed.AI_GATEWAY_API_KEY || "").trim();
  const model = String(
    parsed.AZURE_AI_GATEWAY_MINI_MODEL
    || parsed.AZURE_AI_GATEWAY_MODEL
    || parsed.AI_GATEWAY_MODEL
    || parsed.OPENAI_MODEL
    || "",
  ).trim();
  if (!endpoint && !apiKey && !model) return;
  let skillEntries = [];
  try {
    skillEntries = await readdir(`${root}/src/skills`, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(skillEntries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const settingsPath = `${root}/src/skills/${entry.name}/local.settings.json`;
    try {
      const raw = await readFile(settingsPath, "utf8");
      const settings = JSON.parse(raw);
      settings.Values ||= {};
      if (settings.Values.AZURE_FUNCTIONS_AGENTS_PROVIDER !== "foundry") {
        if (endpoint) {
          settings.Values.OPENAI_BASE_URL = `${endpoint}/default/models/openai/v1/`;
        }
        if (apiKey) {
          settings.Values.OPENAI_CUSTOM_HEADERS = `Api-Key: ${apiKey}`;
        }
        if (model) {
          settings.Values.AZURE_FUNCTIONS_AGENTS_MODEL = model;
        }
      }
      await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch {}
  }));
}

export async function writeAppEnvConfiguration(root, envContent) {
  let wrote = false;
  try {
    await access(`${root}/src/agent`);
    await writeFile(`${root}/src/agent/.env`, envContent, { encoding: "utf8", mode: 0o600 });
    wrote = true;
  } catch {}
  let hasRootBuilder = false;
  for (const configName of ["builder.yaml", "embr.yaml"]) {
    try {
      await access(`${root}/${configName}`);
      hasRootBuilder = true;
      break;
    } catch {}
  }
  if (hasRootBuilder || !wrote) {
    await writeFile(`${root}/.env`, envContent, { encoding: "utf8", mode: 0o600 });
    wrote = true;
  }
  await syncHostedSkillGatewaySettings(root, envContent);
  return wrote;
}
