---
name: azure-app-platform-fluent-theme
description: Design and customize web app themes, stacks, and icons on Azure App Platform's Fluent UI Headless token and component foundation.
---

# Fluent Headless Theme & Icon Authoring

Use this skill when creating or customizing a User Experience / App Service Builder web frontend, selecting or authoring a visual theme (`[data-style]` and `[data-theme]`), scaffolding a requested frontend stack (such as Vite + TypeScript or React + `@fluentui/react-headless-components-preview`), or adding Fluent icons and custom SVG icons.

## 1. Fluent Headless Token Foundation

Every Azure App Platform web frontend uses the Fluent UI Headless CSS custom-property contract on `:root`, `[data-style="<preset>"]`, and `[data-theme="light" | "dark"]` (`tokens.css` or `src/app/globals.css`):

- **Backgrounds**: `--colorNeutralBackground1` (card/surface), `--colorNeutralBackground2` (page canvas), `--colorNeutralBackground3` (muted control/code surface), `--colorSubtleBackgroundHover`
- **Foregrounds**: `--colorNeutralForeground1` (primary ink), `--colorNeutralForeground2` (secondary body copy), `--colorNeutralForeground3` (captions/metadata), `--colorNeutralForegroundOnBrand`
- **Brand**: `--colorBrandBackground`, `--colorBrandBackgroundHover`, `--colorBrandBackgroundPressed`, `--colorBrandBackground2` (soft badge/tint surface), `--colorBrandForeground1` (accent text/icons), `--colorBrandStroke1`, `--colorCompoundBrandStroke`
- **Strokes & Status**: `--colorNeutralStroke1`, `--colorNeutralStroke2`, `--colorStrokeFocus2`, `--colorStatusSuccessBackground1`, `--colorStatusSuccessForeground1`, `--colorStatusWarningBackground1`, `--colorStatusWarningForeground1`, `--colorStatusDangerBackground1`, `--colorStatusDangerForeground1`
- **Typography & Geometry**: `--fontFamilyBase`, `--fontFamilyMonospace`, `--fontFamilyDisplay`, `--borderRadiusSmall`, `--borderRadiusMedium`, `--borderRadiusLarge`, `--borderRadiusXLarge`, `--borderRadiusCircular`, `--shadow4`, `--shadow8`, `--shadow16`

### Built-in Style Presets (`data-style`)

- `copilot` (default): Soft warm stone canvas (`#f8f7f4` light / `#141413` dark), purple-blue brand accent (`#4f46e5` / `#818cf8`), rounded modern cards (`14px`). Best for AI assistants, productivity tools, and general-purpose apps.
- `warm`: Warm cream & terracotta palette (`#faf6f1` light / `#171311` dark, `#c2410c` / `#fb923c` accent), editorial display headings. Best for consumer, hospitality, lifestyle, task/todo, and creative workflows.
- `modern`: Crisp slate & cyan-blue palette (`#f4f6f9` light / `#0b0f17` dark, `#0066ff` / `#3b82f6` accent). Best for developer tools, dashboards, analytics, and SaaS portals.
- `editorial`: High-contrast warm paper & crimson accent (`#fbf9f5` light / `#121110` dark, `#991b1b` / `#f87171` accent), serif headings, sharp geometry (`2px–4px` radius). Best for publishing, knowledge bases, legal/financial review, and research apps.
- `minimal`: Pure monochrome ink & paper (`#ffffff` light / `#0a0a0a` dark, `#171717` / `#fafafa` accent). Best for distraction-free utilities, note-taking, and minimal trackers.

### Selecting or Authoring a Theme

1. **Match the user's request or domain**:
   - If the user requests a specific preset or mood (e.g., "warm", "editorial", "minimal", "modern", "dark mode"), set `data-style` and `data-theme` on `<html>` (`index.html` or `layout.tsx`) and update the default fallback in `src/main.ts`.
   - If the user names an app topic without a preset (e.g., `"Create a todo app"`), pick the most fitting preset (such as `warm` or `copilot` for a personal todo/planner app, `modern` for an engineering dashboard, `editorial` for a reading/research app) and refine the brand/surface tokens in `tokens.css` if the prompt asks for custom colors (e.g., "forest green theme" or "ocean blue palette").
2. **Preserve Build Panel Switchability**:
   - Always keep `:root, [data-style="copilot"]` and the `[data-style="warm"]`, `[data-style="modern"]`, `[data-style="editorial"]`, `[data-style="minimal"]`, and `[data-theme="dark"]` blocks in `tokens.css` / `globals.css` so the Build panel's **Style** dropdown and **Light | Dark** toggle continue to work seamlessly.
   - Never add an in-page theme switcher toolbar; theme switching belongs exclusively to the Azure App Platform Build panel.

## 2. Tech Stack & Fluent Headless Component Patterns

- **Honor the requested stack**:
  - If the user asks for an interactive app (e.g., `"Create a todo app"`) without specifying a framework, build a complete, interactive app in the existing stack (Vite + TypeScript in `src/main.ts` and `index.html`, or React/Next.js when the project uses React) with real state, keyboard accessibility, filtering, and persistence (`localStorage` or wired API endpoints).
  - If the user explicitly requests **React** (or another stack) in a Vite starter, update `package.json`, `tsconfig.json`, and entry files (`src/main.tsx`) to use React and `@fluentui/react-headless-components-preview` while preserving `npm run build` -> `dist/` and `builder.yaml`.
- **Using `@fluentui/react-headless-components-preview`**:
  - Import accessible behavior-first primitives (`Button`, `Input`, `Checkbox`, `Switch`, `Badge`, `Tag`, `Tabs`, `TabList`, `Tab`, `Accordion`, `Dialog`, `Menu`, `Tooltip`, `Field`, `ProgressBar`) and style their slots with classes backed by `tokens.css` variables.
  - Because `@fluentui/react-headless-components-preview` intentionally isolates icon packages from its runtime bundle, pass icons through component `icon` slots (for example `<Tag icon={{ className: "tag-icon", children: <TaskListIcon /> }}>` or `<Button><AddIcon /> Add task</Button>`).

## 3. Fluent Icons & Custom SVG Icon Rules

1. **Standard Icons**:
   - In React projects with `@fluentui/react-icons` installed, prefer `*20Regular` / `*20Filled` or `*24Regular` / `*24Filled` icons from `@fluentui/react-icons`.
   - When using MCP tools in chat, you can search or validate icons with `fluent-agent-search_fluent_icons` and `fluent-agent-validate_fluent_icon`.
2. **Inline & Custom SVG Icons (Fluent System Icon Reference Spec)**:
   - When `@fluentui/react-icons` is not installed (such as zero-dependency Vite + TypeScript starters) or when creating a custom domain icon, author clean inline SVG icons modeled on the **Fluent System Icons** specification:
     - **ViewBox & Grid**: Use `viewBox="0 0 20 20"` (compact UI controls, buttons, badges) or `viewBox="0 0 24 24"` (headers, empty states, feature cards) with `width="20" height="20"` or `width="24" height="24"`.
     - **Stroke & Fill**: Use `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"` for regular outline icons, or `fill="currentColor"` for filled Fluent icon paths.
     - **Corner Radii & Metaphors**: Use smooth `2px`–`3px` corner radii (`rx="2"`) and clear, recognizable Fluent metaphors (checkmark circle, task list, calendar, tag, spark, filter, search, shield, document).
     - **Accessibility & Token Binding**: Mark decorative icons beside text with `aria-hidden="true" focusable="false"`, and bind icon color via `color: var(--colorBrandForeground1)` or `currentColor` so icons automatically adapt to every theme and dark mode.
