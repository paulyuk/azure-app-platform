# Sandbox & Gateway Pattern

A lean blueprint for agentic apps on Azure. Start with the minimal building
blocks. Add a tier only when a real requirement forces you to.

---

## Start here: Minimal Building Blocks

![Sandbox & Gateway Pattern — Minimal Building Blocks](images/sandbox-gateway-minimal-building-blocks.svg)

**This is the whole pattern.** Everything below is optional.

A trigger — HTTP or a timer — wakes an agent loop running on interchangeable
host compute. The loop does three things: prompt a model, receive tool calls,
and offload code execution elsewhere. It never runs untrusted code itself and
never calls a model directly.

Two boundaries carry the safety story, and they are not the same boundary:

| Boundary | Owns | Why it can't be the other one |
| --- | --- | --- |
| **ACA Sandboxes** | Execution | Model-generated code has to run *somewhere*. It runs in an ephemeral, kernel-isolated container with its own filesystem, memory, and identity, and dies after the turn. |
| **AI Gateway (APIM)** | Egress | Model routing, tools, policies, enforcement. By the time traffic reaches a gateway, the code has already run — a gateway cannot contain execution. |

They compose. Sandboxed code that needs the outside world goes through a
**secure egress proxy** to a single allow-listed destination. If the sandbox is
compromised, the gateway still bounds the blast radius. If you had only a
gateway, arbitrary code would be executing inside your host compute with its
identity.

Underneath both sit the **shared primitives** — auth, OpenTelemetry, audit —
present at every tier, independent of which host compute you picked.

> **Host compute is a swap, not a rewrite.** App Service, Functions, or
> Container Apps. The loop, the sandbox boundary, and the gateway don't change.

---

## + Durability & Human-In-The-Loop

![Minimal + Durability & HITL](images/sandbox-gateway-durable-hitl.svg)

**Add when** a turn outlives a request, or a human has to say yes.

The Durable Task Scheduler checkpoints turn state, so a workflow survives a host
restart and can wait hours for a person without keeping compute warm.

Note what this tier does *not* add: a special notification component. The
approval request leaves through the AI Gateway and the egress proxy to
**Connectors (Teams / Email / M365)**, exactly like every other governed
outbound call. The approval event returns along the same path and resumes the
loop. Human-in-the-loop is a flow, not a box.

---

## + SRE & Continuous Evals

![Minimal + SRE & Evals](images/sandbox-gateway-sre-evals.svg)

**Add when** you need to know the agent is still *good*, not just still *up*.

Continuous Evals score reasoning quality on live traffic. The SRE Agent band
reads the OTEL traces the shared primitives were already emitting and correlates
them across compute, sandboxes, and gateway.

The sandbox emits lifecycle events only — created, executed, deleted, duration,
exit code — never payloads. So an operator can diagnose "prequal sandboxes are
timing out" without ever seeing what they computed.

---

## Complete Architecture

![Complete Architecture](images/sandbox-gateway-full-architecture.svg)

All three add-ons at once, drawn with dashed borders so the solid core stays
readable. This is a destination, not a starting point.

---

## Reading the diagrams

- **Solid border** — core. Present in every tier.
- **Dashed border** — add-on. Removable without breaking the core.
- **Colour** — role, not decoration: red = core, blue = durability, purple =
  evals, amber = egress, teal = shared primitives, green = interchangeable host.
- **★** — the two elements that define the pattern: sandboxes and shared
  primitives.

To recreate or extend these diagrams, see
[`images/DIAGRAM-PROMPT.md`](images/DIAGRAM-PROMPT.md).
