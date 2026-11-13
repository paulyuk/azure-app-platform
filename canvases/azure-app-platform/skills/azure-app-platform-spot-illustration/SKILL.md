---
name: azure-app-platform-spot-illustration
description: Create simple, metaphor-driven SVG spot illustrations mapped to Fluent Headless and host semantic color tokens.
---

# Theme-Aware SVG Spot Illustration Authoring

Use this skill when creating or customizing an App Service Builder / User Experience web app so the page includes a clean, purposeful SVG spot illustration (for hero headers, empty states, or workflow callouts) that communicates the app's topic at a glance and adapts automatically to the active theme.

## 1. Core Design Principles

1. **One Clear Metaphor**:
   - Inspect the app's domain and purpose first, then pick a single, immediately recognizable concrete object or pair of objects:
     - **Todo / Task Planner**: A clean checklist card with a completed checkmark badge and a rising progress line.
     - **Document / Policy Review**: A structured page with a verification seal or magnifier lens.
     - **Inventory / Commerce / Dealership**: A catalog card with a price/status tag and search filter.
     - **Analytics / Operations Dashboard**: A pulsing signal wave with a balanced metric card.
   - Avoid cluttered scenes, literal screenshots, miniature UI chrome, text paragraphs inside SVGs, or abstract geometric noise.
2. **Simple, Readable Geometry**:
   - Limit each spot illustration to **3–6 geometric primitives/paths** (`<rect>`, `<circle>`, `<path>`, `<line>`) with generous negative space.
   - Use a square or landscape canvas (`viewBox="0 0 120 120"`, `viewBox="0 0 160 120"`, or `viewBox="0 0 512 512"`), consistent stroke weights (`2px–2.5px` at `120px` scale, or `12px` at `512px` scale), and `stroke-linecap="round" stroke-linejoin="round"`.
   - Never use `<script>`, `<foreignObject>`, `<image>`, `<filter>`, or `<linearGradient>`.

## 2. Semantic Role & Token Mapping (Required)

Map every spot illustration's fills and strokes to **Fluent Headless / host semantic CSS custom properties** so the illustration automatically shifts palette and contrast across `[data-style]` (`copilot`, `warm`, `modern`, `editorial`, `minimal`, or custom themes) and `[data-theme="light" | "dark"]`.

Organize the SVG into three semantic groups with `data-spot-role` attributes:

1. **Primary Subject (`data-spot-role="outline"`)**:
   - Represents the main silhouette or container of the metaphor.
   - Bind stroke to `var(--colorNeutralForeground1)` (with optional surface fill `var(--colorNeutralBackground1)`).
2. **Supporting Context (`data-spot-role="supporting-detail"`)**:
   - Adds 1–2 secondary lines or soft tinted shapes that give context without competing with the focal point.
   - Bind stroke to `var(--colorNeutralForeground3)` or `var(--colorNeutralStroke1)`, and soft fills to `var(--colorBrandBackground2)` or `var(--colorNeutralBackground3)`.
3. **Focal Accent (`data-spot-role="accent"`)**:
   - Highlights the key action or outcome (e.g., the completed checkmark, active spark, or verified badge).
   - Bind stroke/fill to `var(--colorBrandForeground1)` (with optional badge fill `var(--colorBrandBackground2)`).

## 3. Accessibility & Markup Template

Include `<title>` and `<desc>` referenced by `role="img"` and `aria-labelledby` (or `aria-hidden="true"` when adjacent heading text already conveys the exact same meaning):

```html
<svg
  class="spot-illustration"
  xmlns="http://www.w3.org/2000/svg"
  width="96"
  height="96"
  viewBox="0 0 120 120"
  fill="none"
  role="img"
  aria-labelledby="spot-title spot-desc"
>
  <title id="spot-title">Focused task planner</title>
  <desc id="spot-desc">A checklist card with two task lines and a highlighted completion check.</desc>
  <g data-spot-role="supporting-detail" stroke="var(--colorNeutralStroke1)" fill="var(--colorBrandBackground2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="28" y="22" width="68" height="80" rx="12" />
  </g>
  <g data-spot-role="outline" stroke="var(--colorNeutralForeground1)" fill="var(--colorNeutralBackground1)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="20" y="16" width="68" height="80" rx="12" />
    <path d="M48 42h26M48 60h20M48 78h14" fill="none" />
  </g>
  <g data-spot-role="accent" stroke="var(--colorBrandForeground1)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="35" cy="42" r="6" fill="var(--colorBrandBackground2)" />
    <path d="M32.5 42l2 2 4-4" />
    <circle cx="35" cy="60" r="5" fill="none" />
    <circle cx="35" cy="78" r="5" fill="none" />
  </g>
</svg>
```
