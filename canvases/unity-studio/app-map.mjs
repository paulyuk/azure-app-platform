import { basename, dirname } from "node:path";

import {
  discoverRepository,
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

export async function traceApp({ root = process.cwd() } = {}) {
  const scan = await scanRepository(root);
  const files = await loadRepositoryFiles(scan);
  const repository = await discoverRepository(root, { scan, files });
  const nodes = repository.candidates.map((candidate) => ({
    ...candidate,
    kind: "project",
    name: basename(candidate.projectPath) || basename(repository.root),
  }));
  const edges = [];
  const unresolved = [];
  const seen = new Set();

  addCrossTierEdges(nodes, files, edges, seen, unresolved);
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
