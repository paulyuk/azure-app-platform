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
| `sandbox-gateway-hosted-skills.svg` | Minimal + Hosted Skills | Azure Functions agents runtime hosts the loop |
| `sandbox-gateway-durable-hitl.svg` | Minimal + Durability & HITL | Durable Task Scheduler |
| `sandbox-gateway-sre-evals.svg` | Minimal + SRE & Evals | Continuous Evals, SRE band |
| `sandbox-gateway-full-architecture.svg` | Complete Architecture | all three |

Each add-on tier is *the minimal diagram plus one thing*. The core must stay
pixel-stable and visually dominant. If an add-on makes the core harder to read,
the add-on is drawn wrong.

---

## Core content (present in every tier)

Three labelled columns, left to right:

1. **Triggers** — `HTTP REST`, `Timer`, `Connectors events`, with equal visual
   weight and solid connectors to the Agent. No front-end UI; this pattern is
   headless.
2. **Host Compute (Interchangeable)** — `Agent` with a muted neutral badge
   reading `FHA / ACA / App Service / Functions`, plus an `Agentic Control Flow` soft
   box with exactly three bullets:
   - Prompts model via AI Gateway
   - Receives tool call requests
   - Offloads code to an ACA Sandbox
3. **Tool isolation** — `★ ACA Sandboxes` with scoped tool execution,
   default-deny egress, and result contract/policy checks. Document processing
   is an example, not the name of the layer. Do not show a local-process fallback.

Below column 3, under the label **Shared model and tool access**:

4. **AI Gateway** with exactly four chips, in this order:
   - top row: `Model Routing`, `MCP`
   - bottom row: `Policies`, `Enforcement`

Full-width bar across the bottom:

5. **Shared Primitives** — `Auth`, `OTEL`, `Audit`, with the single line
   *"— shared by every tier of this pattern, regardless of host compute choice"*.

---

## Concepts to get right

These are correctness issues, not style:

- **"ACA Sandboxes"**, never "Dynamic Sessions". See sandboxes.azure.com/docs.
- **Sandbox = execution isolation. Gateway = shared model and tool access.** Orthogonal
  boundaries. Do not merge them or imply one subsumes the other.
- **HITL needs an explicit integration.** Show an approval channel and an
  authenticated callback to durable orchestration. Model routing alone does
  not deliver notifications or approval events.
- **Host compute is interchangeable**, and the diagram must say so once (the
  neutral badge) and never again.
- **Hosted Skills add callable capabilities**, not a replacement Agent.
  Keep the Agent and host choices in every variant; show optional skills
  separately, reached through governed MCP / HTTP access.

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
| Slate blue | `#486581` | core / primary |
| Indigo | `#4f46e5` | Hosted Skills |
| Blue | `#2563eb` | durability, DTS, HITL |
| Purple | `#8b5cf6` | evals |
| Amber | `#b45309` | secure egress |
| Neutral gray | theme `--muted` / `--line` | host badges and shared primitives |

Colour carries meaning. Do not introduce a colour without a role.

### Markers

Reserve visual emphasis for ACA Sandboxes and AI Gateway. Host badges and shared
primitives use muted neutral fills, thin borders, and regular-weight labels.
Do not add a star to Shared Primitives.

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
      `docs/azure-app-platform-plan.md` §2.4.
