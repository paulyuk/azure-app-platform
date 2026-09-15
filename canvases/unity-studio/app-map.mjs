import { basename, dirname } from "node:path";

import {
  discoverRepository,
  filesInAppScope,
  loadRepositoryFiles,
  scanRepository,
} from "./discovery.mjs";

function toLines(content) {
  return content.split(/\r?\n/);
}

function lineNumberFor(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function candidateFiles(candidate, files) {
  if (candidate.projectPath === ".") {
    return files;
  }
  return files.filter((file) =>
    file.path === candidate.projectPath || file.path.startsWith(`${candidate.projectPath}/`));
}

function sourceEvidence(path, line, rule, detail, confidence = "high") {
  return { path, line, rule, detail, confidence };
}

function addEdge(edges, seen, from, to, kind, evidence, confidence = "medium") {
  const key = `${from}|${to}|${kind}|${evidence.path}|${evidence.line}`;
  if (!seen.has(key)) {
    seen.add(key);
    edges.push({
      id: `edge:${edges.length + 1}`,
      from,
      to,
      kind,
      confidence,
      evidence: [evidence],
    });
  }
}

function findProjectNode(nodes, tierId, projectPath) {
  return nodes.find((node) => node.tierId === tierId && node.projectPath === projectPath) ?? null;
}

function findNodes(nodes, tierId) {
  return nodes.filter((node) => node.tierId === tierId && node.kind === "project");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveTargets(source, targets) {
  const colocated = targets.filter((target) =>
    source.projectPath !== "." && target.projectPath === source.projectPath);
  if (colocated.length === 1) {
    return colocated;
  }
  return targets.length === 1 ? targets : [];
}

function structuredNameReference(files, name) {
  if (!name || name === ".") {
    return null;
  }
  const escaped = escapeRegExp(name);
  const expressions = [
    new RegExp(`["']${escaped}["']\\s*:`),
    new RegExp(`name\\s*=\\s*["']${escaped}["']`),
    new RegExp(`(?:TOOLS|SKILLS|LOCAL_SKILL_PORTS)\\s*(?::[^=]+)?=\\s*\\[[\\s\\S]{0,512}["']${escaped}["']`, "i"),
    new RegExp(`(?:https?://|/)[^"'\\s]*${escaped}(?:[/:"']|$)`, "i"),
  ];
  for (const file of files) {
    for (const expression of expressions) {
      const found = firstMatch(file, expression);
      if (found) {
        return { file, found };
      }
    }
  }
  return null;
}

function structuredDataReference(files, candidate) {
  const names = candidate.evidence
    .map((item) => basename(item.path))
    .filter((name) => name && name !== ".");
  for (const name of names) {
    const escaped = escapeRegExp(name);
    for (const file of files) {
      const found = firstMatch(file, new RegExp(`["'][^"'\\n]*${escaped}["']`, "i"));
      if (found) {
        return { file, found, name };
      }
    }
  }
  return null;
}

function firstMatch(file, expression) {
  const match = expression.exec(file.content);
  if (!match) {
    return null;
  }
  return {
    match,
    line: lineNumberFor(file.content, match.index),
  };
}

function addCrossTierEdges(nodes, files, edges, seen, unresolved) {
  const webNodes = findNodes(nodes, "web");
  const agentNodes = findNodes(nodes, "agent");
  const gatewayNodes = findNodes(nodes, "gateway");
  const skillNodes = findNodes(nodes, "skills");
  const workflowNodes = findNodes(nodes, "workflows");
  const connectorNodes = findNodes(nodes, "connectors");
  const sandboxNodes = findNodes(nodes, "sandbox");
  const dataNodes = findNodes(nodes, "data");

  for (const web of webNodes) {
    const owned = candidateFiles(web, files);
    const reference = owned.map((file) => ({ file, found: firstMatch(file, /\bAGENT_(?:URL|ENDPOINT)\b|\/responses\b/) }))
      .find((entry) => entry.found);
    if (!reference) {
      continue;
    }
    const targets = resolveTargets(web, agentNodes);
    if (targets.length === 0) {
      unresolved.push({
        from: web.id,
        reference: agentNodes.length > 1 ? "ambiguous agent endpoint" : "agent endpoint",
        candidates: agentNodes.map((node) => node.id),
        evidence: sourceEvidence(reference.file.path, reference.found.line, "agent-http-reference", reference.found.match[0]),
      });
    }
    for (const agent of targets) {
      addEdge(
        edges,
        seen,
        web.id,
        agent.id,
        "http-request",
        sourceEvidence(reference.file.path, reference.found.line, "agent-http-reference", reference.found.match[0]),
        "high",
      );
    }
  }

  for (const agent of agentNodes) {
    const owned = candidateFiles(agent, files);
    const gatewayReference = owned.map((file) => ({
      file,
      found: firstMatch(file, /AZURE_AI_GATEWAY_ENDPOINT|\/models\/openai\/v1|Api-Key/),
    })).find((entry) => entry.found);
    if (gatewayReference) {
      const targets = resolveTargets(agent, gatewayNodes);
      if (targets.length === 0) {
        unresolved.push({
          from: agent.id,
          reference: gatewayNodes.length > 1 ? "ambiguous AI Gateway" : "AI Gateway",
          candidates: gatewayNodes.map((node) => node.id),
          evidence: sourceEvidence(gatewayReference.file.path, gatewayReference.found.line, "gateway-reference", gatewayReference.found.match[0]),
        });
      }
      for (const gateway of targets) {
        addEdge(
          edges,
          seen,
          agent.id,
          gateway.id,
          "model-request",
          sourceEvidence(gatewayReference.file.path, gatewayReference.found.line, "gateway-reference", gatewayReference.found.match[0]),
          "high",
        );
      }
    }

    for (const skill of skillNodes) {
      const skillName = skill.projectPath === "." ? null : skill.name;
      if (!skillName) {
        continue;
      }
      const reference = structuredNameReference(owned, skillName);
      if (reference) {
        addEdge(
          edges,
          seen,
          agent.id,
          skill.id,
          "tool-call",
          sourceEvidence(reference.file.path, reference.found.line, "named-tool-reference", reference.found.match[0]),
          "high",
        );
      }
    }
    const toolReference = owned.map((file) => ({
      file,
      found: firstMatch(file, /FoundryToolbox|MCPStreamableHTTPTool|\/runtime\/webhooks\/mcp/),
    })).find((entry) => entry.found);
    if (toolReference && skillNodes.length === 0) {
      unresolved.push({
        from: agent.id,
        reference: "MCP or hosted skill",
        evidence: sourceEvidence(toolReference.file.path, toolReference.found.line, "tool-transport-reference", toolReference.found.match[0]),
      });
    }
  }

  for (const workflow of workflowNodes) {
    const owned = candidateFiles(workflow, files);
    const connectorReference = owned.map((file) => ({
      file,
      found: firstMatch(file, /GraphServiceClient|Microsoft\.Web\/connections|teams|outlook/i),
    })).find((entry) => entry.found);
    if (connectorReference) {
      const targets = resolveTargets(workflow, connectorNodes);
      if (targets.length === 0) {
        unresolved.push({
          from: workflow.id,
          reference: connectorNodes.length > 1 ? "ambiguous connector" : "connector",
          candidates: connectorNodes.map((node) => node.id),
          evidence: sourceEvidence(connectorReference.file.path, connectorReference.found.line, "connector-reference", connectorReference.found.match[0]),
        });
      }
      for (const connector of targets) {
        addEdge(
          edges,
          seen,
          workflow.id,
          connector.id,
          "connector-call",
          sourceEvidence(connectorReference.file.path, connectorReference.found.line, "connector-reference", connectorReference.found.match[0]),
        );
      }
    }

    for (const sandbox of sandboxNodes) {
      const name = sandbox.projectPath === "." ? null : sandbox.name;
      if (!name) {
        continue;
      }
      const reference = structuredNameReference(owned, name);
      if (reference) {
        addEdge(
          edges,
          seen,
          workflow.id,
          sandbox.id,
          "isolated-job",
          sourceEvidence(reference.file.path, reference.found.line, "sandbox-reference", reference.found.match[0]),
        );
      }
    }
  }

  for (const source of [...webNodes, ...agentNodes, ...skillNodes, ...workflowNodes]) {
    const owned = candidateFiles(source, files);
    for (const data of dataNodes) {
      if (source.id === data.id || data.projectPath === ".") {
        continue;
      }
      const reference = structuredDataReference(owned, data);
      if (reference) {
        addEdge(
          edges,
          seen,
          source.id,
          data.id,
          "data-access",
          sourceEvidence(reference.file.path, reference.found.line, "data-reference", reference.found.match[0]),
          "low",
        );
      }
    }
  }
}

function addWorkflowOperations(nodes, files, edges, seen) {
  const workflowNodes = findNodes(nodes, "workflows");
  for (const workflow of workflowNodes) {
    const owned = candidateFiles(workflow, files);
    const operations = new Map();

    for (const file of owned) {
      const declaration = /@app\.function_name\s*\(\s*name\s*=\s*["']([^"']+)["']\s*\)/g;
      for (const match of file.content.matchAll(declaration)) {
        const name = match[1];
        const node = {
          id: `operation:${file.path}:${name}`,
          kind: "operation",
          tierId: "workflows",
          name,
          projectPath: workflow.projectPath,
          confidence: "high",
          evidence: [sourceEvidence(file.path, lineNumberFor(file.content, match.index), "function-name", match[0])],
        };
        operations.set(name, node);
        nodes.push(node);
        addEdge(edges, seen, workflow.id, node.id, "contains", node.evidence[0], "high");
      }
    }

    for (const file of owned) {
      const constants = new Map(
        [...file.content.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*["']([^"']+)["']/gm)]
          .map((match) => [match[1], match[2]]),
      );
      const calls = /context\.(call_activity|wait_for_external_event)\s*\(\s*(?:["']([^"']+)["']|([A-Z][A-Z0-9_]*))/g;
      for (const match of file.content.matchAll(calls)) {
        const [full, method, literalTarget, constantTarget] = match;
        const targetName = literalTarget ?? constants.get(constantTarget);
        if (!targetName) {
          continue;
        }
        const callLine = lineNumberFor(file.content, match.index);
        const caller = [...operations.values()]
          .filter((operation) =>
            operation.evidence[0].path === file.path && operation.evidence[0].line <= callLine)
          .sort((left, right) => right.evidence[0].line - left.evidence[0].line)[0];
        const from = caller?.id ?? workflow.id;
        const evidence = sourceEvidence(
          file.path,
          callLine,
          method === "call_activity" ? "durable-activity-call" : "durable-external-event",
          full,
        );
        let target = operations.get(targetName);
        if (!target) {
          target = {
            id: `external:${workflow.projectPath}:${targetName}`,
            kind: method === "call_activity" ? "external-operation" : "event",
            tierId: method === "call_activity" ? "workflows" : "connectors",
            name: targetName,
            projectPath: workflow.projectPath,
            confidence: "high",
            evidence: [evidence],
          };
          operations.set(targetName, target);
          nodes.push(target);
        }
        addEdge(
          edges,
          seen,
          from,
          target.id,
          method === "call_activity" ? "activity-call" : "wait-for-event",
          evidence,
          "high",
        );
      }
    }
  }
}

function projectNodeName(candidate, repositoryRoot) {
  if (candidate.tierId === "gateway") {
    return "AI Gateway binding";
  }
  return basename(candidate.projectPath) || basename(repositoryRoot);
}

function uniqueEvidence(items) {
  return [...new Map(items.map((item) => [
    `${item.path}:${item.line}:${item.rule}:${item.detail}`,
    item,
  ])).values()];
}

function consolidateGatewayNodes(nodes) {
  const gateways = findNodes(nodes, "gateway");
  if (gateways.length <= 1) return;

  const primary = gateways.find((node) =>
    node.evidence.some((item) => item.path === ".unity-studio/active-gateway.json")) ?? gateways[0];
  primary.evidence = uniqueEvidence(gateways.flatMap((node) => node.evidence));
  primary.confidence = gateways.some((node) =>
    node.evidence.some((item) => item.path === ".unity-studio/active-gateway.json"))
    ? "high"
    : primary.confidence;

  const duplicateIds = new Set(gateways.filter((node) => node !== primary).map((node) => node.id));
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (duplicateIds.has(nodes[index].id)) nodes.splice(index, 1);
  }
}

function namedManifestValue(files, fileName, key) {
  const expression = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:\\s*["']?([^"'\\n#]+)`, "m");
  for (const file of files.filter((item) => item.name === fileName)) {
    const found = firstMatch(file, expression);
    if (found) {
      return {
        value: found.match[1].trim(),
        evidence: sourceEvidence(file.path, found.line, `${fileName}-${key}`, found.match[0]),
      };
    }
  }
  return null;
}

function platformBadge(label, kind, evidence) {
  return { label, kind, evidence };
}

function addPlatformMetadata(nodes, files) {
  for (const node of findNodes(nodes, "agent")) {
    const owned = candidateFiles(node, files);
    const manifestName = namedManifestValue(owned, "agent.yaml", "name");
    if (manifestName) node.name = manifestName.value;

    const hostedManifest = owned.map((file) => ({
      file,
      found: file.name === "agent.yaml" ? firstMatch(file, /^\s*kind\s*:\s*hosted\s*$/m) : null,
    })).find((entry) => entry.found);
    const foundryTarget = owned.map((file) => ({
      file,
      found: file.name === "azure.yaml" ? firstMatch(file, /\bhost\s*:\s*azure\.ai\.agent\b/) : null,
    })).find((entry) => entry.found);
    const maf = owned.map((file) => ({
      file,
      found: firstMatch(file, /\b(?:from|import)\s+agent_framework\b|["']agent-framework(?:[<>=])/),
    })).find((entry) => entry.found);
    const foundrySdk = owned.map((file) => ({
      file,
      found: firstMatch(file, /\bagent_framework_foundry_hosting\b|["']agent-framework-foundry-hosting(?:[<>=])/),
    })).find((entry) => entry.found);

    node.badges = [
      hostedManifest && (foundrySdk || foundryTarget) && platformBadge(
        "Foundry Hosted Agent",
        "hosted-agent",
        sourceEvidence(hostedManifest.file.path, hostedManifest.found.line, "foundry-hosted-agent", hostedManifest.found.match[0]),
      ),
      maf && platformBadge(
        "MAF",
        "framework",
        sourceEvidence(maf.file.path, maf.found.line, "agent-framework", maf.found.match[0]),
      ),
      foundrySdk && platformBadge(
        "Foundry SDK",
        "sdk",
        sourceEvidence(foundrySdk.file.path, foundrySdk.found.line, "foundry-hosting-sdk", foundrySdk.found.match[0]),
      ),
      foundryTarget && platformBadge(
        "Foundry deploy target",
        "target",
        sourceEvidence(foundryTarget.file.path, foundryTarget.found.line, "foundry-deploy-target", foundryTarget.found.match[0]),
      ),
    ].filter(Boolean);
  }

  for (const node of findNodes(nodes, "web")) {
    const owned = candidateFiles(node, files);
    const manifestName = namedManifestValue(owned, "embr.yaml", "name");
    if (manifestName) node.name = manifestName.value;
    const manifest = owned.find((file) => file.name === "embr.yaml");
    if (manifest) {
      node.badges = [
        platformBadge("Embr target", "embr", sourceEvidence(
          manifest.path,
          1,
          "embr-target",
          "embr.yaml",
        )),
      ];
    }
  }
}

function addObservabilityMetadata(nodes, files) {
  const telemetryExpression = /configure_azure_monitor|useAzureMonitor|AzureMonitor(?:Trace|Metric|Log)Exporter|["']@opentelemetry\/sdk-node["']|\bfrom\s+opentelemetry\.(?:sdk|instrumentation)|["']applicationInsights["']\s*:|(?:os\.environ(?:\.get)?|os\.getenv)\s*[\[(]\s*["'](?:APPLICATIONINSIGHTS_CONNECTION_STRING|OTEL_[A-Z_]+)|process\.env\.(?:APPLICATIONINSIGHTS_CONNECTION_STRING|OTEL_[A-Z_]+)|(?:getenv|GetEnvironmentVariable)\(\s*["'](?:APPLICATIONINSIGHTS_CONNECTION_STRING|OTEL_[A-Z_]+)|["'](?:APPLICATIONINSIGHTS_CONNECTION_STRING|OTEL_[A-Z_]+)["']\s*:|(?:export\s+|\$env:)(?:APPLICATIONINSIGHTS_CONNECTION_STRING|OTEL_[A-Z_]+)\s*=/i;
  const isRuntimeConfiguration = (file) =>
    /\.(?:py|mjs|cjs|js|jsx|ts|tsx|cs|java|go|rs|sh|ps1|bicep|tf|ya?ml)$/i.test(file.name) ||
    /^(?:host|appsettings(?:\.[^.]+)?|local\.settings)\.json$/i.test(file.name);
  const nestedProjectRoots = nodes
    .filter((node) => node.kind === "project" && node.projectPath !== ".")
    .map((node) => `${node.projectPath}/`);
  for (const node of nodes.filter((candidate) =>
    candidate.kind === "project" &&
    !["gateway", "sre"].includes(candidate.tierId))) {
    const ownedFiles = node.projectPath === "."
      ? files.filter((file) => !nestedProjectRoots.some((root) => file.path.startsWith(root)))
      : candidateFiles(node, files);
    const match = ownedFiles
      .filter(isRuntimeConfiguration)
      .map((file) => ({ file, found: firstMatch(file, telemetryExpression) }))
      .find((entry) => entry.found);
    if (!match) continue;
    const evidence = sourceEvidence(
      match.file.path,
      match.found.line,
      "telemetry-configuration",
      match.found.match[0],
      "high",
    );
    node.badges ??= [];
    node.details ??= [];
    node.badges.push(platformBadge("Telemetry configured", "telemetry", evidence));
    node.details.push({
      kind: "telemetry",
      label: "Operations",
      value: "Telemetry configured",
      evidence,
    });
  }
}

function addGatewayDetails(nodes, files) {
  const gateways = findNodes(nodes, "gateway");
  if (gateways.length === 0) return;

  const agentFiles = findNodes(nodes, "agent").flatMap((agent) => candidateFiles(agent, files));
  const modelNames = new Map();
  const toolboxEvidence = [];
  for (const file of agentFiles) {
    for (const expression of [
      /\bDEFAULT_GATEWAY(?:_[A-Z0-9]+)*_MODEL\s*=\s*["']([^"']+)["']/g,
      /\bAZURE_AI_GATEWAY(?:_[A-Z0-9]+)?_MODEL\s*=\s*["']([^"'${}<>\s]+)["']/g,
    ]) {
      for (const match of file.content.matchAll(expression)) {
        modelNames.set(match[1], sourceEvidence(
          file.path,
          lineNumberFor(file.content, match.index),
          "gateway-model-reference",
          match[0],
        ));
      }
    }
    const toolbox = firstMatch(file, /\bFoundryToolbox\b|\/runtime\/webhooks\/mcp/);
    if (toolbox) {
      toolboxEvidence.push(sourceEvidence(
        file.path,
        toolbox.line,
        "gateway-tool-route-reference",
        toolbox.match[0],
      ));
    }
  }

  let activeGateway = null;
  const activeGatewayFile = files.find((file) => file.path === ".unity-studio/active-gateway.json");
  if (activeGatewayFile) {
    try {
      const parsed = JSON.parse(activeGatewayFile.content);
      if (typeof parsed?.name === "string" && parsed.name.trim()) activeGateway = parsed;
    } catch {
      // Discovery diagnostics own malformed source; App Map simply omits the binding metadata.
    }
  }

  for (const gateway of gateways) {
    gateway.badges = [];
    gateway.details = [];
    if (activeGateway) {
      const bindingEvidence = sourceEvidence(
        activeGatewayFile.path,
        1,
        "active-gateway-binding",
        activeGateway.name,
      );
      gateway.badges.push(platformBadge("Azure bound", "bound", bindingEvidence));
      gateway.details.push({
        kind: "azure-resource",
        label: "AI Gateway",
        value: activeGateway.name,
        evidence: bindingEvidence,
      });
      if (activeGateway.resourceGroup) {
        gateway.details.push({
          kind: "azure-resource-group",
          label: "Resource group",
          value: activeGateway.resourceGroup,
          evidence: bindingEvidence,
        });
      }
    }
    gateway.details.push(...[...modelNames].map(([name, evidence]) => ({
      kind: "model",
      label: activeGateway ? "Foundry model" : "Model route",
      value: name,
      evidence,
    })));
    if (modelNames.size > 0) {
      gateway.badges.push(platformBadge(
        activeGateway
          ? `${modelNames.size} Foundry model ${modelNames.size === 1 ? "binding" : "bindings"}`
          : `${modelNames.size} model ${modelNames.size === 1 ? "route" : "routes"}`,
        "model",
        [...modelNames.values()][0],
      ));
    }
    if (toolboxEvidence.length > 0) {
      gateway.details.push({
        kind: "tool-route",
        label: "Tools",
        value: "Foundry Toolbox",
        evidence: toolboxEvidence[0],
      });
    }
  }
}

export async function traceApp({ root = process.cwd() } = {}) {
  const scan = await scanRepository(root);
  const allFiles = await loadRepositoryFiles(scan);
  const repository = await discoverRepository(root, { scan, files: allFiles });
  const files = filesInAppScope(allFiles, repository.componentPaths);
  const nodes = repository.candidates.map((candidate) => ({
    ...candidate,
    kind: "project",
    name: projectNodeName(candidate, repository.root),
  }));
  const edges = [];
  const unresolved = [];
  const seen = new Set();

  consolidateGatewayNodes(nodes);
  addPlatformMetadata(nodes, files);
  addCrossTierEdges(nodes, files, edges, seen, unresolved);
  addGatewayDetails(nodes, files);
  addObservabilityMetadata(nodes, files);
  addWorkflowOperations(nodes, files, edges, seen);

  return {
    generatedAt: new Date().toISOString(),
    root: repository.root,
    nodes,
    edges,
    unresolved,
    diagnostics: repository.diagnostics,
    summary: {
      projectNodes: nodes.filter((node) => node.kind === "project").length,
      operationNodes: nodes.filter((node) => node.kind !== "project").length,
      edges: edges.length,
      unresolved: unresolved.length,
    },
  };
}
