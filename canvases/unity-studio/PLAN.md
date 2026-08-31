# Unity Studio canvas plan

This plan is the living specification for the Unity Studio hub canvas. It
covers the canvas and its project extension only; application templates and
specialist studios remain separate authorities.

## Product intent

Unity Studio is the entry point for creating, assembling, reopening, and
operating Unity-pattern applications. It should be useful after creation:
users must be able to identify an app, inspect what is real in its source,
trace its App Map, open component source, hand off to specialist studios, run
the app locally, prepare or deploy it in Azure, and delete an app deliberately.

The canvas models the generic Unity pattern, not a car-buying narrative. The
nine tiers are:

| ID | Meaning |
| --- | --- |
| `web` | End-user application surface |
| `agent` | Reasoning and governed skill selection |
| `gateway` | Policy, identity, routing, quota, and observability boundary |
| `skills` | Hosted Skills with explicit tool contracts |
| `sandbox` | Constrained execution for sensitive or untrusted work |
| `connectors` | Governed integration with external systems |
| `workflows` | Durable orchestration across restarts and decisions |
| `sre` | Self-awareness, health correlation, and bounded remediation |
| `data` | Direct data primitives and persistence |

Tier names and roles must remain generic. Do not add demo-specific narrative
steps or infer that proxy access through a Hosted Skill is a direct data
primitive.

## Entry journeys

The landing context has three primary actions:

1. **Create a new app** — choose the editable Empty Unity app or the
   runnable Dealer sample.
2. **Open an app** — rediscover apps persisted as Git repository/worktree
   pairs.
3. **Assemble existing pieces** — explicitly map capabilities to independently
   built source projects and compatible Azure resources.

Template choice cards show only a clear title and one outcome-focused
description. After creation or selection, navigation goes directly to the App
Map. Capability lists, lifecycle commands, file paths, and source provenance
belong in its Guide, Manage panel, and Implementation view, not in
the landing decision surface.

Every non-landing screen has a visible back arrow near the top. Bottom action
buttons may remain for keyboard/mobile flow, but navigation must not depend on
them.

## App identity and persistence

An app's user-provided name is its canonical identity. Generated sample names
use the form `Dealer-sample-<unique-id>` (case preserved when entered, with a
stable lower-case slug for filesystem/branch use).

New deterministic template workspaces persist identity metadata in
`.unity-studio/app.json` with the app name, purpose, managed branch, runtime
profile, and app child session ID. Existing apps must not
be identified by a README title such as “Unity: The Self-Aware App Platform,”
nor by exposing multiple unrelated branch, worktree, and commit IDs as the
primary label. The Open existing list shows one canonical app name and a
compact implementation count; technical paths remain available in the
inventory view.

Until a control plane exists, the source of truth for reopening is the Git
repository/worktree pair. Discovery must tolerate older worktrees without
metadata by deriving a stable generated name from their app/worktree naming
convention.

Deletion is irreversible. Open existing and the app inventory must both expose
Delete. The UI must require an explicit confirmation naming the app and
warning that its worktree will be removed. The API must independently require
confirmation, reject the current Unity Studio workspace, require an authorized
registered Git worktree, and remove only that worktree. A branch is removed only
when metadata explicitly marks it as Unity-managed and it matches the registered
worktree branch.

## Truthful inventory

Inventory is evidence-driven, never a canned status list. Repository
discovery scans source markers and reports component name, type, source path,
confidence, and concise semantic badges. Azure discovery is read-only and
limited to the active subscription.

Component cards use compact, color-coded badges instead of verbose insight
sentences. Badge vocabulary is rule-derived and may include:

- Foundry, HostedAgent, MAF, HTTP
- Embr, Web framework
- HostedSkill, Azure Functions, MCP tool
- Docker, Sandbox, Durable Functions
- Connector, Gateway reference, Direct data

Badge colors are categorical rather than health-oriented: use blue, cyan,
purple, indigo, and neutral gray. Do not use green, yellow, or red for
component badges because those colors imply health or severity.

Missing tiers must say they were not discovered and offer the tier's
non-mutating scaffold path. A gateway referenced by source is not presented as
provisioned. Connector stubs, infrastructure-only files, and Unity Studio's
own source must not become false application implementations.

Static JSON fixtures nested inside a Hosted Skill are implementation data for
that skill, not a direct data primitive. The Data tier requires independent
evidence such as a schema (`.sql` or Prisma), an Azure data resource definition,
or a discovered Azure data service.

## Deterministic actions

Known template creation is deterministic: create a Git worktree, materialize
the selected pinned/checked-in source, persist identity metadata, optionally
open VS Code, and then rediscover the new worktree. It must not send a
model-mediated “create an app” prompt.

The canvas actions and HTTP routes are the executable boundary for:

- source catalog and repository/Azure discovery;
- App Map tracing from source-derived calls and workflow links;
- specialist-canvas activation with context;
- source opening in VS Code;
- local `scripts/dev-start.sh`/`scripts/dev-stop.sh` (or the `.ps1`
  equivalents on Windows), invoked directly by the lifecycle actions;
- explicit `azd provision` and `azd up`;
- confirmed worktree deletion.

Cloud actions are explicit because they can mutate Azure. The canvas should
surface command start/failure information and avoid claiming deployment
success without command evidence.

Local lifecycle controls are stateful: the app reports running or stopped and
offers the corresponding action (`Run locally` or `Stop local app`) rather
than presenting competing run/stop buttons at the same time. Running locally
also exposes a live embedded terminal showing the actual lifecycle command
output. Before running, Unity checks for the local gateway endpoint and model
credentials; if they are missing, it directs the user to choose an existing
gateway/model set or provision one in AI Gateway Studio. `azd provision`
does not imply that SRE has been obtained; SRE remains a separate tier that
must be discovered, attached, or provisioned explicitly.

Created apps persist runtime-specific start arguments, expected entrypoints,
and reserved ports. A template may declare a safe credential-free preview, but
full startup remains gated on validated gateway identity, endpoint, key, and
model settings. API callers cannot bypass the same readiness decision shown in
Guide.

Gateway configuration only establishes governed model access. Local Run then
starts discovered Hosted Skills as separate Functions MCP services before the
agent, binds the agent to their localhost endpoints when no cloud Toolbox is
configured, and derives the displayed entrypoints from lifecycle state.
Ready component endpoints are actions, not passive text: open the web client,
inspect a Hosted Skill MCP endpoint, send a prompt to the local agent, or open
the registered agent specialist studio.

## Guided-success UX

Unity Studio owns the path from selection to a working app. It should not stop
at reporting that settings are missing when it has enough resource identity to
retrieve and apply them safely.

- Selecting an AI Gateway persists the selection and immediately configures
  the app from that gateway. A separate configure action may remain as an
  explicit retry, but it is not the primary path.
- Each selection receives a unique configuration ID. The app settings file and
  configuration process coordinate through an app-local cross-process lock, and
  the process rereads the on-disk ID before writing credentials. Older
  configuration processes therefore cannot overwrite a newer selection.
- Configuration and runtime are distinct regions. **Azure configuration**
  establishes cloud bindings such as the active AI Gateway; **Local runtime**
  starts and observes local processes.
- Optional configuration is clearly labeled without being hidden. The active
  gateway selector is the primary control, with **Create / Manage** directly
  beneath it as a secondary route into AI Gateway Studio.
- Readiness guidance is actionable and located beside the control that fixes
  it. Errors preserve the actual command output, while successful automation
  updates the visible state without requiring a manual refresh.
- Lifecycle state is derived from process and endpoint evidence. Starting,
  running, stopping, stopped, and failed are visibly distinct; the canvas never
  infers success from a command merely being launched.
- Local component endpoints are clickable actions. A ready web surface opens
  in the Browser canvas, a Hosted Skill opens its MCP endpoint, and a ready
  agent exposes both prompt and specialist-studio actions.
- Optional editor launch is best-effort. Failure to open VS Code must not remove
  a successfully created worktree or block navigation to App Map.
- Active startup reports ready services against the discovered total so a
  normal first-run delay does not look like an indefinite hang.
- Background status probes are silent. They must not generate application
  request-log traffic or imply that the user invoked a component.
- Runtime status survives Unity Studio reloads. Rehydrate it from the app's
  persisted process registry or root-owned listeners plus silent TCP readiness
  evidence so a live stack is not mislabeled as stopped, another app is not
  attributed to the selected worktree, and stale evidence is not mislabeled as
  running.
- Deterministic canvas actions replace copy/paste prompts and passive
  instructions wherever the host API can perform the operation directly.

## Visual system

Unity Studio follows the same presentation primitives as the AI Gateway and
Intelligent Function App studios and the Microsoft Foundry portal:

- use documented canvas theme tokens, the shared sans/mono type ramps, a
  restrained purple accent, and a subtle Foundry-style background treatment;
- make App Map the primary app screen after creation or selection rather than
  introducing a separate app-workspace dashboard;
- keep the architecture diagram visually dominant and place progressive
  guidance in **Guide**;
- place contextual **Add component** actions on request-flow stages and
  Implementation lanes; narrow multi-tier choosers and open single-tier setup
  directly;
- place explicit **Connect** actions between adjacent request-flow stages; show
  existing evidence, require source/target selection and confirmation, then
  delegate the real source/configuration change to the app session;
- keep **Guide**, **Manage**, and collapsed **Search & layout** in the primary
  header, with the primary App Map view switch in a persistent row below it;
- keep overall runtime state visible beside the app name, distinguishing a
  local preview from the complete app running locally;
- group model selection, Azure deployment, source navigation, technical output,
  local-agent testing, and deletion into disclosures in the secondary
  **Manage** panel;
- keep command output collapsible and make the desktop details panel resizable
  without changing the mobile full-width layout;
- return to the app list through one visible top-level back action;
- use compact pills only for status or categorical metadata, never as the sole
  indicator of state; and
- preserve full-button hit targets, keyboard focus treatment, responsive
  stacking, and readable wrapping for paths and errors. Below the mobile
  breakpoint, stack Guide below the map rather than covering the map with a
  drawer.

The visual hierarchy must not change backend behavior. Presentation tests
assert direct App Map routing, management actions, and generated browser-script
syntax alongside the existing workflow assertions.

## App Map

App Map is a generic source-derived graph, not a fixed narrative. Given an
authorized app root, derive nodes and edges from manifests, runtime/tool
references, HTTP boundaries, and durable workflow activities. Do not invent
Cartesian relationships when targets are ambiguous. Show useful graph counts
and retain enough source provenance to inspect the relationship.

Tracing runs automatically when an app is created or opened; a
running app never depends on the user clicking a first-time Trace button. The
canvas renders the result as a visual graph with component nodes,
directional relationship labels, source evidence, and visibly unresolved
references. A secondary **Refresh map** action exists only to pick up source
changes made after the initial discovery. The App Map is the primary app screen,
using the full canvas for the graph and its Guide rather than requiring
an expansion step from an intermediate workspace.

The expanded canvas defaults to **Request flow**, a stable left-to-right
architecture diagram across Experience, Reasoning, Models & capabilities, and
Connected systems. An Operations plane spans the path for telemetry, health,
and management. Only components reachable through evidence-backed
relationships from a discovered entry point appear on the flow; disconnected
implementations and detailed workflow operations remain available in the
secondary **Implementation** view rather than implying requests reach them.
Multiple entry points can filter the visible request path.

Both views support pan, zoom, fit, search, and tier filters under the collapsed
**Search & layout** disclosure, while the view switch remains persistently
visible. Selecting an edge
explains the connection and its source evidence while stating that the diagram
is not a live distributed trace. Documentation-only paths are explicitly
labeled and rendered as low-confidence dashed connections. The Implementation view retains all nine tier
swimlanes and draggable nodes constrained to their evidence-derived lane.
Browser-local positions are keyed by app, mode, and a stable topology
fingerprint, so graph changes get a clean layout and never write presentation
state into the app. A single click or keyboard activation opens evidence,
bindings, and authorized source, specialist, and ready-endpoint actions.
Clicking the selected card again or clicking empty map space returns to
**Guide**. A lane-level **Add** handoff opens its specialist
studio or, after explicit confirmation, requests a source capability through
the existing implementation workflow; Azure provisioning remains outside the map.
The expansion action is an accessible
Fluent-style icon in the map's top-right toolbar, with a tooltip and
screen-reader label rather than another large text button.

The expanded map opens on **Guide**, which abstracts the platform into
four user outcomes: **Build**, **Connect**, **Run**, and **Observe & manage**.
The current source graph, unresolved relationships, local readiness, and runtime
state determine stage progress and prioritized next actions. The surface shows
these outcomes as a non-interactive vertical stepper, shows one explicit
**Next action** matched to the current stage, and collapses later
improvements. Runtime controls appear first only when Run is the current stage
or the app is already running.
Runtime progress updates automatically; delegated implementation work offers
**Check for changes** when the user needs to retrace source evidence. The Run
stage uses existing readiness and lifecycle APIs so gateway hardening remains
authoritative and merge-compatible.

Observability is a first-class recommendation. When no SRE or telemetry evidence
exists, **Set up observability** requests cross-tier, OpenTelemetry-compatible
health instrumentation while cloud resource attachment remains an explicit
specialist/deployment step. Partial instrumentation remains incomplete: the
Guide reports evidence-backed coverage across runtime components and
recommends extending it across the remaining request path.

Graph labels describe runtime roles rather than source-folder accidents. A
gateway marker found in an agent project is rendered as an **AI Gateway
binding**, never as another agent component. Agent relationships therefore read
as model requests to that gateway boundary and tool calls to Hosted Skills.
When source evidence identifies model deployment names or a governed toolbox
route, those appear as compact metadata inside the single gateway binding card,
not as duplicate graph nodes or synthetic gateway-internal edges.

App Map also distinguishes platform intent from concrete bindings with compact,
evidence-backed badges. The lane remains simply labeled **Agent** for a clear
pattern-level map, while each qualifying agent card identifies **Foundry Hosted
Agent** as Unity's opinionated runtime and shows observed **MAF**, **Foundry SDK**,
and **Foundry deploy target** evidence. Web projects with `embr.yaml` show
**Embr target**.
Persisted gateway selection produces one consolidated **Azure bound** gateway
card with its concrete resource name, resource group, and source-referenced
Foundry model bindings. Target badges must not imply a deployment already
exists; bound badges require persisted resource evidence.

## Ongoing spec checks

Future changes should preserve these invariants:

- nine generic tiers remain complete and demo-independent;
- every inventory claim has repository or Azure evidence;
- app identity is stable, singular, and user-recognizable;
- every screen except the landing screen has a top back arrow;
- deletion is visible and confirmation-gated at both UI and API layers;
- badges stay concise, semantic, color-coded, and rule-derived;
- create/reopen/assemble flows remain deterministic and workspace-confined;
- specialist studios remain authoritative for deep tier operations;
- Azure configuration, local runtime, App Map, and component inventory remain
  visibly separate, collapsible surface panels;
- App Map traces automatically and renders nodes, relationships, and unresolved
  references visually rather than exposing only graph counts;
- command output remains collapsible and uses the standard output-window
  header/body treatment;
- focused tests cover identity, inventory rendering, navigation, lifecycle
  actions, authorization, and deletion safety.

## Near-term extensions

1. Extract richer Hosted Skill metadata: tool names, endpoints, function
   names, runtime/provider configuration, and source evidence.
2. Deep-dive provisioned gateway resources: model deployments, routes, and
   tool mappings, then hand off that context to AI Gateway Studio. The active
   gateway card now automatically runs the checked-in configuration hook after
   selection or provisioning, including a runtime-hostname fallback for
   preview gateway resources that do not expose `properties.gatewayUrl`.
3. Extend the Guide's observability setup with direct SRE Agent and
   Application Insights resource attachment when their specialist operations
   are registered.
4. Add lifecycle command logs, process status, and detected local endpoint or
   portal links.
5. Define a future control-plane registration model without weakening the
   current repository/worktree persistence contract.
