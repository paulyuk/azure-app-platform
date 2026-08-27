import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import { createCanvas, CanvasError, joinSession } from "@github/copilot-sdk/extension";

import { resolveDiscoveryRoot } from "./discovery.mjs";
import {
  PLATFORM_TIERS,
  activateTier,
  buildImplementationInventory,
  discoverUnityPlatform,
  getPlatformOverview,
  openWorkspaceInVsCode,
  requestAppWorkspace,
  requestCapabilityWork,
  runDoctor,
  traceUnityApp,
  WORKSPACE_TIER_IDS,
} from "./studio-commands.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";

const servers = new Map();
let session;

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new Error("Request body exceeds 64 KiB.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function validateSourceProjectPath(input, workspaceRoot) {
  const requestedPath = input?.sourceProjectPath ?? input?.candidatePath;
  if (!requestedPath) {
    return input;
  }
  const resolved = await resolveDiscoveryRoot(requestedPath, workspaceRoot);
  return {
    ...input,
    sourceProjectPath: relative(workspaceRoot, resolved) || ".",
  };
}

function implementationInventoryResult(discovery) {
  return {
    generatedAt: discovery.generatedAt,
    root: discovery.root,
    diagnostics: discovery.diagnostics,
    repository: {
      scannedFiles: discovery.repository.scannedFiles,
      projectCount: discovery.repository.candidateCount,
    },
    azure: {
      available: discovery.azure.available,
      subscription: discovery.azure.subscription,
      resourceCount: discovery.azure.candidateCount,
    },
    inventory: buildImplementationInventory(discovery),
  };
}

async function discoveryWithCatalog(workspaceRoot, includeAzure) {
  return implementationInventoryResult(
    await discoverUnityPlatform({ root: workspaceRoot, includeAzure }),
  );
}

function authorizeApiRequest(request, url, apiToken, trustedHost) {
  if (!url.pathname.startsWith("/api/")) {
    return;
  }
  const origin = request.headers.origin;
  if (
    request.headers.host !== trustedHost
    || request.headers["x-unity-studio-token"] !== apiToken
    || (origin && origin !== `http://${trustedHost}`)
  ) {
    const error = new Error("Unauthorized loopback request.");
    error.statusCode = 403;
    throw error;
  }
  if (
    request.method === "POST"
    && !String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")
  ) {
    const error = new Error("POST actions require application/json.");
    error.statusCode = 415;
    throw error;
  }
}

async function handleRequest(request, response, instanceId, workspaceRoot, apiToken, trustedHost) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  try {
    authorizeApiRequest(request, url, apiToken, trustedHost);
    if (request.method === "GET" && url.pathname === "/api/overview") {
      sendJson(response, 200, getPlatformOverview());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/discovery") {
      const includeAzure = url.searchParams.get("azure") !== "false";
      sendJson(response, 200, await discoveryWithCatalog(workspaceRoot, includeAzure));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/app-map") {
      sendJson(response, 200, await traceUnityApp({ root: workspaceRoot }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/tier-action") {
      const input = await readJsonBody(request);
      sendJson(response, 200, await activateTier({
        tierId: input.tierId,
        root: workspaceRoot,
        includeAzure: input.includeAzure !== false,
        session,
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/workspace-request") {
      const input = await validateSourceProjectPath(await readJsonBody(request), workspaceRoot);
      sendJson(response, 202, await requestAppWorkspace({
        session,
        workspaceRoot,
        input,
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/capability-request") {
      const input = await validateSourceProjectPath(await readJsonBody(request), workspaceRoot);
      sendJson(response, 202, await requestCapabilityWork({ session, input }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/open-vscode") {
      const input = await readJsonBody(request);
      const root = await resolveDiscoveryRoot(input.root, workspaceRoot);
      sendJson(response, 200, await openWorkspaceInVsCode({ root }));
      return;
    }
    if (request.method !== "GET" || url.pathname !== "/") {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(renderStudioHtml(instanceId, apiToken));
  } catch (error) {
    sendJson(response, error?.statusCode ?? 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function startServer(instanceId, workspaceRoot) {
  const apiToken = randomUUID();
  let trustedHost;
  const server = createServer((request, response) => {
    void handleRequest(request, response, instanceId, workspaceRoot, apiToken, trustedHost);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  trustedHost = `127.0.0.1:${port}`;
  return { server, url: `http://${trustedHost}/`, workspaceRoot };
}

function canvasError(error) {
  if (error instanceof CanvasError) {
    return error;
  }
  return new CanvasError(
    error?.code ?? "unity-studio-error",
    error instanceof Error ? error.message : String(error),
  );
}

function actionWorkspaceRoot(ctx) {
  return ctx.session?.workingDirectory ?? process.cwd();
}

async function actionRoot(ctx) {
  return resolveDiscoveryRoot(ctx.input?.root, actionWorkspaceRoot(ctx));
}

const rootInputProperties = {
  root: {
    type: "string",
    description: "Workspace-relative application root. It must stay within the current workspace.",
  },
};

const workspaceInputSchema = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["create", "extend"], default: "create" },
    appName: { type: "string", minLength: 1, maxLength: 80 },
    purpose: { type: "string", minLength: 1, maxLength: 500 },
    tierIds: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", enum: WORKSPACE_TIER_IDS },
    },
    sourceProjectPath: { type: "string" },
    azureResourceId: { type: "string", maxLength: 512 },
    openInVsCode: { type: "boolean", default: true },
  },
  required: ["appName", "purpose", "tierIds"],
  additionalProperties: false,
};

const canvas = createCanvas({
  id: "unity-studio",
  displayName: "Unity Studio",
  description: "Create or extend a Unity-pattern app in a worktree, inventory implementations, open tier studios, and trace its App Map.",
  inputSchema: {
    type: "object",
    properties: {
      view: { type: "string", enum: ["overview", "app-map"] },
    },
    additionalProperties: false,
  },
  actions: [
    {
      name: "get_platform_overview",
      description: "Return the generic nine-tier Unity role and job-to-be-done map.",
      inputSchema: { type: "object", additionalProperties: false },
      handler: async () => getPlatformOverview(),
    },
    {
      name: "discover_platform",
      description: "Inventory source projects and, optionally, active-subscription Azure resources that can implement Unity tiers.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          includeAzure: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          const discovery = await discoverUnityPlatform({
            root: await actionRoot(ctx),
            includeAzure: ctx.input?.includeAzure !== false,
          });
          return implementationInventoryResult(discovery);
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "request_app_workspace",
      description: "Request a child project session with an isolated worktree, selected Unity capabilities, preloaded studios, and optional VS Code launch.",
      inputSchema: workspaceInputSchema,
      handler: async (ctx) => {
        try {
          const workspaceRoot = actionWorkspaceRoot(ctx);
          const input = await validateSourceProjectPath(ctx.input, workspaceRoot);
          return await requestAppWorkspace({ session, workspaceRoot, input });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "build_capability",
      description: "Build or improve one Unity capability in the current app worktree, update its inventory, wire adjacent tiers, and test it.",
      inputSchema: {
        type: "object",
        properties: {
          tierId: { type: "string", enum: WORKSPACE_TIER_IDS },
          intent: { type: "string", enum: ["add", "improve"], default: "add" },
          sourceProjectPath: { type: "string" },
          azureResourceId: { type: "string", maxLength: 512 },
        },
        required: ["tierId"],
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          const workspaceRoot = actionWorkspaceRoot(ctx);
          const input = await validateSourceProjectPath(ctx.input, workspaceRoot);
          return await requestCapabilityWork({ session, input });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "open_in_vscode",
      description: "Open a workspace-confined discovered repository path in a new Visual Studio Code window.",
      inputSchema: {
        type: "object",
        properties: rootInputProperties,
        required: ["root"],
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await openWorkspaceInVsCode({ root: await actionRoot(ctx) });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "activate_tier",
      description: "Open a registered specialist studio for a tier; use request_app_workspace to add the tier to an app.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          tierId: { type: "string", enum: PLATFORM_TIERS.map((tier) => tier.id) },
          includeAzure: { type: "boolean", default: true },
        },
        required: ["tierId"],
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await activateTier({
            tierId: ctx.input.tierId,
            root: await actionRoot(ctx),
            includeAzure: ctx.input?.includeAzure !== false,
            session,
          });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "trace_app",
      description: "Derive an application graph across Unity tiers from matched source files.",
      inputSchema: {
        type: "object",
        properties: rootInputProperties,
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await traceUnityApp({ root: await actionRoot(ctx) });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "run_doctor",
      description: "Report repository and optional Azure discovery health.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          includeAzureProbe: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await runDoctor({
            root: await actionRoot(ctx),
            includeAzureProbe: ctx.input?.includeAzureProbe !== false,
          });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
  ],
  open: async (ctx) => {
    const workspaceRoot = ctx.session?.workingDirectory ?? process.cwd();
    let entry = servers.get(ctx.instanceId);
    if (!entry || entry.workspaceRoot !== workspaceRoot) {
      if (entry) {
        await new Promise((resolve) => entry.server.close(resolve));
      }
      entry = await startServer(ctx.instanceId, workspaceRoot);
      servers.set(ctx.instanceId, entry);
    }
    return {
      title: "Unity Studio",
      status: "App workspace",
      url: entry.url,
    };
  },
  onClose: async ({ instanceId }) => {
    const entry = servers.get(instanceId);
    if (entry) {
      servers.delete(instanceId);
      await new Promise((resolve) => entry.server.close(resolve));
    }
  },
});

session = await joinSession({ canvases: [canvas] });
