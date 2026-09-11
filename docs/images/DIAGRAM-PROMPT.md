# Diagram prompt: Sandbox & Gateway pattern SVGs

Instructions for recreating or extending the four `sandbox-gateway-*.svg`
diagrams in this folder. Hand the whole file to an agent along with the target
tier.

---

## Task

Produce a hand-authored SVG architecture diagram for one tier of the Sandbox &
Gateway pattern. Write the SVG directly — do not use a diagramming library,
Mermaid, or a rasteriser.

---

## The single most important rule: restraint

Most architecture diagrams fail by saying too much. Every element must earn its
place. When in doubt, delete it.

**Never include:**

- Pattern summary cards, callout boxes, or legend paragraphs. If the diagram
  needs a paragraph to explain itself, fix the diagram.
- Descriptive sub-labels under a box title. "ACA Sandboxes" is enough;
  "Ephemeral, isolated code/tool execution" is noise.
- Captions under chips.
- Labels on flow arrows that restate the obvious ("routes to Azure OpenAI").
  Label a flow only when the *nature* of the call is non-obvious, e.g.
  "HITL approval request (via Gateway)".
- Text that describes an add-on. Show add-ons visually instead — see below.

**Titles only.** A reader should parse the structure in five seconds.

---

## The four tiers

| File | Tier | Adds |
| --- | --- | --- |
| `sandbox-gateway-minimal-building-blocks.svg` | Minimal Building Blocks | — (the core) |
| `sandbox-gateway-durable-hitl.svg` | Minimal + Durability & HITL | Durable Task Scheduler |
| `sandbox-gateway-sre-evals.svg` | Minimal + SRE & Evals | Continuous Evals, SRE band |
| `sandbox-gateway-full-architecture.svg` | Complete Architecture | all three |

Each add-on tier is *the minimal diagram plus one thing*. The core must stay
pixel-stable and visually dominant. If an add-on makes the core harder to read,
the add-on is drawn wrong.

---

## Core content (present in every tier)

Three labelled columns, left to right:

1. **Triggers** — `HTTP REST`, `Timer Trigger`. No front-end UI; this pattern is
   headless.
2. **Host Compute (Interchangeable)** — `Agent Loop Host` with a green badge
   reading `App Service / Functions / ACA`, plus an `Agentic Control Flow` soft
   box with exactly three bullets:
   - Prompts model via AI Gateway
   - Receives tool call requests
   - Offloads code to an ACA Sandbox
3. **Tool Execution & Egress** — `★ ACA Sandboxes` (with a `PII Boundary
   Enforced` pill) → `🔒 Secure Egress Proxy` → `External Destination`.

Below column 3, under the label **Egress & Model Governance**:

4. **AI Gateway (APIM)** with exactly four chips, in this order:
   - top row: `Model Routing`, `Tools`
   - bottom row: `Policies`, `Enforcement`

Full-width bar across the bottom:

5. **★ Shared Primitives** — `Auth`, `OTEL`, `Audit`, with the single line
   *"— shared by every tier of this pattern, regardless of host compute choice"*.

---

## Concepts to get right

These are correctness issues, not style:

- **"ACA Sandboxes"**, never "Dynamic Sessions". See sandboxes.azure.com/docs.
- **Sandbox = execution isolation. Gateway = egress governance.** Orthogonal
  boundaries. Do not merge them or imply one subsumes the other.
- **HITL is a flow, not a component.** Never draw a standalone "Teams / Email"
  notification card. Approval requests route Durable Task Scheduler → AI Gateway
  → Secure Egress Proxy → `Connectors (Teams / Email / M365)`, and the approval
  event returns along the same path. This is the point: human approval is a
  governed outbound call like any other.
- **Host compute is interchangeable**, and the diagram must say so once (the
  green badge) and never again.
- The column holding sandboxes *and* egress is labelled **Tool Execution &
  Egress** — not "Tool Isolation", which misdescribes two of its three boxes.

---

## Visual language

### Add-ons

Distinguish add-ons with **dashed borders plus a distinct colour**, never with
prose.

- `stroke-dasharray: 6 5` on the border.
- In the complete architecture only, prefix add-on titles with `+`.

### Colour roles

| Colour | Hex | Role |
| --- | --- | --- |
| Accent red | `#d7263d` | core / primary |
| Blue | `#2563eb` | durability, DTS, HITL |
| Purple | `#8b5cf6` | evals |
| Amber | `#b45309` | secure egress |
| Teal | `#0f766e` | shared primitives |
| Green | `#10b981` | interchangeable-host badge |

Colour carries meaning. Do not introduce a colour without a role.

### Markers

`★` prefixes exactly two things: ACA Sandboxes and Shared Primitives — the two
elements that define the pattern.

---

## Technical requirements

Follow the conventions in `agentic-architecture.svg`:

- A `<style>` block using CSS custom properties, with a
  `@media (prefers-color-scheme: dark)` override so the diagram adapts to both
  themes. Never hard-code ink colours on elements.
- Semantic classes, reused rather than redefined:
  `.card` `.soft` `.panel` `.gate` `.chip` `.pill` `.trig` `.egress`
  `.prim` `.primchip` `.badge` `.t` (ink) `.m` (muted) `.a` (accent)
  `.cap` (uppercase section label) `.lbl` (italic flow label) `.sub` (body)
  `.flow*` (connector paths with arrow markers).
- A `<title>` element matching the main heading, for accessibility.
- Landscape viewBox, roughly `1400–1600` wide. Let height follow content; do not
  pad to a round number.
- No stray `opacity="0"` elements or unused defs.

### Validate before committing

```shell
python3 -c "import xml.dom.minidom as m; m.parse('docs/images/<file>.svg')"
```

Then confirm restraint held:

```shell
grep -n "Pattern Summary\|Add-on\|Callout" docs/images/sandbox-gateway-*.svg
```

Both must come back clean.

---

## Definition of done

- [ ] Parses as valid XML.
- [ ] Renders legibly in light *and* dark mode.
- [ ] Zero summary cards, sub-labels, or chip captions.
- [ ] Add-ons dashed and colour-coded; core solid and dominant.
- [ ] Core layout matches the other three tiers.
- [ ] Referenced from `docs/sandbox-gateway-pattern.md` and
      `docs/unity-platform-plan.md` §2.4.
