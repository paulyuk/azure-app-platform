export const TIER_IDS = Object.freeze([
  "web",
  "agent",
  "gateway",
  "skills",
  "sandbox",
  "connectors",
  "workflows",
  "sre",
  "data",
]);

export const PLATFORM_TIERS = Object.freeze([
  {
    id: "web",
    name: "Surface / web",
    role: "Human-facing application surface",
    jobToBeDone: "Present application state and turn user intent into governed requests.",
    expectedInterfaces: ["HTTP", "WebSocket or server events", "Accessible UI"],
    preferredCanvases: ["app-service-builder"],
    scaffold: {
      summary: "Create a web surface with App Service Builder that serves static or HTTP components and calls governed APIs.",
      markers: ["package.json", "builder.yaml"],
      nextActions: ["Choose a web runtime", "Define the builder.yaml component contract", "Add health and telemetry endpoints"],
    },
  },
  {
    id: "agent",
    name: "Agent",
    mapLabel: "Agent",
    role: "Agent reasoning and tool use governed by an agent harness",
    jobToBeDone: "Reason over user intent and use governed tools without fabricating results.",
    expectedInterfaces: ["HTTP or Responses API", "Agent instructions", "Tool contracts", "Runtime configuration"],
    preferredCanvases: ["ai-gateway-studio", "agent-builder"],
    scaffold: {
      summary: "Create an agent with explicit instructions, tool contracts, and a selected harness and hosting runtime.",
      markers: ["agent.yaml", "main.py"],
      nextActions: ["Choose the agent runtime and hosting", "Define agent instructions", "Register tools and model routing"],
    },
  },
  {
    id: "gateway",
    name: "Gateway",
    role: "Governed model and tool ingress",
    jobToBeDone: "Apply policy, identity, routing, quotas, and observability to model and MCP traffic.",
    expectedInterfaces: ["OpenAI-compatible API", "MCP federation", "Policy telemetry"],
    preferredCanvases: ["ai-gateway-studio"],
    scaffold: {
      summary: "Provision or bind an API Management AI Gateway and define governed model/tool routes.",
      markers: ["azure.yaml", "infra"],
      nextActions: ["Select an APIM instance", "Define model routes", "Apply token and identity policies"],
    },
  },
  {
    id: "skills",
    name: "Hosted Skills",
    role: "Deterministic, callable business capabilities",
    jobToBeDone: "Expose bounded operations as independently deployable tools with explicit contracts.",
    expectedInterfaces: ["MCP", "HTTP", "Function trigger"],
    preferredCanvases: ["intelligent-function-app-studio"],
    scaffold: {
      summary: "Create a hosted skill with a function entry point, tool contract, and MCP endpoint.",
      markers: ["agents.config.yaml", "function_app.py", "host.json"],
      nextActions: ["Define one bounded capability", "Declare its input/output contract", "Add local and hosted tests"],
    },
  },
  {
    id: "sandbox",
    name: "Sandbox",
    role: "Ephemeral isolated execution",
    jobToBeDone: "Run sensitive or untrusted computation with constrained identity, network, and lifetime.",
    expectedInterfaces: ["Job API", "Container image", "Egress policy"],
    preferredCanvases: [],
    scaffold: {
      summary: "Create an ephemeral containerized job with explicit ingress, egress, identity, and deletion behavior.",
      markers: ["Dockerfile", "egress-policy.yaml"],
      nextActions: ["Define the isolation boundary", "Build the container image", "Set egress and lifecycle policy"],
    },
  },
  {
    id: "connectors",
    name: "Connectors",
    role: "External system integration",
    jobToBeDone: "Connect applications to collaboration and systems-of-record APIs through governed identities.",
    expectedInterfaces: ["Connector API", "Microsoft Graph", "Event or webhook"],
    preferredCanvases: [],
    scaffold: {
      summary: "Define a connector boundary with least-privilege identity and an explicit external API contract.",
      markers: ["connector manifest", "connection configuration"],
      nextActions: ["Choose the external system", "Define least-privilege permissions", "Add retry and audit behavior"],
    },
  },
  {
    id: "workflows",
    name: "Durable workflows",
    role: "Replay-safe long-running coordination",
    jobToBeDone: "Coordinate activities, timers, events, and human decisions across process restarts.",
    expectedInterfaces: ["Orchestration trigger", "Activity trigger", "External event"],
    preferredCanvases: ["intelligent-function-app-studio"],
    scaffold: {
      summary: "Create a durable orchestration with replay-safe activities, timers, and external-event handling.",
      markers: ["function_app.py", "host.json"],
      nextActions: ["Model the orchestration states", "Separate deterministic orchestration from activities", "Test replay and resume"],
    },
  },
  {
    id: "sre",
    name: "Self-awareness / SRE",
    role: "Cross-tier observation, diagnosis, and safe remediation",
    jobToBeDone: "Correlate signals across the application and propose or perform policy-bounded remediation.",
    expectedInterfaces: ["Telemetry", "Health model", "Incident and remediation workflow"],
    preferredCanvases: ["sre-agent-studio"],
    scaffold: {
      summary: "Connect cross-tier telemetry to a health model and define approval-bounded remediation workflows.",
      markers: ["sre-agent configuration", "health model", "OpenTelemetry configuration"],
      nextActions: ["Define health entities", "Connect logs, metrics, and traces", "Set remediation approval policy"],
    },
  },
  {
    id: "data",
    name: "Direct data primitive",
    role: "Durable application state and retrieval",
    jobToBeDone: "Store, query, and govern operational, analytical, and grounding data.",
    expectedInterfaces: ["Data API", "Schema", "Backup and retention policy"],
    preferredCanvases: [],
    scaffold: {
      summary: "Choose a data service from access, consistency, retention, and governance requirements.",
      markers: ["schema", "migration", "data resource definition"],
      nextActions: ["Define the data contract", "Choose the persistence model", "Add lifecycle and recovery controls"],
    },
  },
].map((tier) => Object.freeze({
  ...tier,
  expectedInterfaces: Object.freeze([...tier.expectedInterfaces]),
  preferredCanvases: Object.freeze([...tier.preferredCanvases]),
  scaffold: Object.freeze({
    ...tier.scaffold,
    markers: Object.freeze([...tier.scaffold.markers]),
    nextActions: Object.freeze([...tier.scaffold.nextActions]),
  }),
})));

export function getTierDefinition(tierId) {
  return PLATFORM_TIERS.find((tier) => tier.id === tierId) ?? null;
}
