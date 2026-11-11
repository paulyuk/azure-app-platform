export const CREATE_GUIDANCE = {
  sandbox: {
    introduction: "An agent uses document checks and governed model access; local execution is a process simulation, not cloud isolation.",
    caution: "Local execution is a process simulation, not cloud isolation.",
    worksFirst: "Test text and Markdown checks locally without a model connection.",
    run: "AI replies require a configured AI Gateway endpoint and credentials. Missing configuration fails rather than returning a fake answer.",
    later: "Configure ACA sandboxes separately if cloud isolation is needed; creating the starter does not provision them.",
    boundaries: "Default local mode launches the tool as a child process. Optional ACA sandbox execution needs separate configuration; copilot-sdk-sandbox uses separate configured HTTPS agent and tool pools. The model stays remote behind AI Gateway. Focused policy checks are not complete PII, malware or prompt-injection protection.",
    included: [["Agent", "Orchestrates document checks and configured model calls."], ["Document validation tool", "Checks bounded text and Markdown input; local execution is a process simulation."], ["AI Gateway configuration", "Model routing configuration; requires a gateway endpoint and credentials."]],
    excluded: "No web frontend, Hosted Skill, provisioned gateway or cloud sandbox pools.",
    editing: "Used by the configured app agent. This text does not change document checks, supported formats or safety policy, and does not implement new tools.",
    flow: ["Validate a supported text document", "Independently check the bounded, sanitized tool result", "Send approved document text to a remote model through configured AI Gateway", "Check the model response before returning it"],
    files: [["src/agent/prompts/system.md", "Instructions used by the configured app agent"], ["src/tools/document-validation/contract.json", "Supported files, input limits and schemas"], ["src/policy/enforcement.py", "Deterministic policy implementation"], ["config/runtime.json", "Local or separately configured cloud runtime"]],
  },
  web: {
    introduction: "A minimal web page with optional Hosted Skills; backend behavior and hosting still need implementation and deployment.",
    caution: "Includes a minimal page, not generated screens or backend behavior.",
    worksFirst: "Build and preview the minimal page locally without a model or backend.",
    run: "Use Node.js and npm to build and preview the page locally. No model connection or backend service is needed.",
    later: "Add backend capabilities when needed, then deploy explicitly. Hosted Skills are an optional extension, not included or already connected.",
    boundaries: "Vite writes static assets to dist, including a public health file. Node.js is the build toolchain, not a deployed backend. Creating the starter does not deploy it or generate screens from your description.",
    included: [["Web frontend", "Vite and TypeScript page with a greeting, app description, builder.yaml and static health link."]],
    excluded: "No app agent, backend, Hosted Skill or provisioned hosting.",
    editing: "Saved as app metadata and displayed page text. This does not generate screens, an agent or backend logic.",
    flow: ["Edit the Vite and TypeScript frontend", "Build static assets into dist", "Deploy explicitly through App Service Builder when ready"],
    files: [["src/main.ts", "Greeting and displayed description"], ["index.html", "Minimal page structure"], ["builder.yaml", "Static hosting deployment contract"], ["static.test.mjs", "Static-site smoke tests"]],
  },
  basic: {
    introduction: "An empty app blueprint with four optional components; the included scaffold uses a mock agent and an unimplemented tool.",
    caution: "The agent is a mock; the included backend tool is unimplemented.",
    worksFirst: "Preview the web form and its fixed mock response without model credentials.",
    run: "Azure Functions Core Tools is needed to start the included Hosted Skill; its invoke endpoint returns HTTP 501 until implemented.",
    later: "Implement the Hosted Skill, replace or extend the mock agent, and connect real services explicitly.",
    boundaries: "The mock agent does not read saved instructions, call a model or execute the skill. Implement that behavior and wire the tool explicitly. A Hosted Skill is the included Azure Functions backend tool. The gateway folder is a configuration placeholder, not a provisioned gateway.",
    included: [["Web frontend", "Web form with a mock-agent connection."], ["Mock agent", "Returns a fixed response; real agent behavior needs implementation."], ["Hosted Skill stub", "Azure Functions tool; returns HTTP 501 until implemented."], ["AI Gateway placeholder", "Configuration scaffold, not a provisioned gateway."]],
    excluded: "No live AI agent, implemented business tool, provisioned gateway or credentials.",
    editing: "The mock agent does not read these instructions. They are saved for the agent behavior you implement; tools still need code and explicit connections.",
    flow: ["Local web form calls the mock agent", "Mock agent returns a fixed response", "Implement and connect the separate skill and model access"],
    files: [["src/agent/prompts/system.md", "Saved instructions for the agent behavior you implement"], ["src/skills/<your-skill>/function_app.py", "Backend-tool implementation stub"], ["src/web/server.mjs", "Web form and mock-agent proxy"], ["infra-ai-gateway/README.md", "Gateway configuration placeholder"]],
  },
  sample: {
    introduction: "A dealership reference connects web flows, an agent, tools and AI Gateway; real integrations need configuration.",
    caution: "Copies dealership behavior unchanged; renaming does not change its domain.",
    worksFirst: "Explore the dealership's credential-free mock preview.",
    run: "Full AI and tool integrations require the reference's documented services and configuration.",
    later: "Configure full integrations to use real services. Adapting the example to your own domain is a separate coding task.",
    boundaries: "Create copies the eligible pinned reference commit as a whole. Configuration, tests and docs stay together. Changing the workspace name does not rewrite dealership behavior or deploy services.",
    included: [["Web frontend", "Buyer and dealer reference flows."], ["Agent", "Deal-finder reference implementation."], ["Hosted Skills", "Four example business tools."], ["Sandbox examples", "Reference sandbox execution examples."], ["AI Gateway configuration", "Configured model access; real services require credentials."], ["Workflows", "Reference durable workflow examples."]],
    excluded: "No rewrite to your business domain and no newly provisioned Azure resources.",
    editing: "The sample's domain behavior is copied unchanged. Changing this description or the app name does not rewrite it.",
    flow: ["Buyer/dealer web flows", "Deal-finder app agent", "Four business tools, sandbox and workflow examples", "Configured model access through AI Gateway"],
    files: [["src/web", "Buyer and dealer interface source"], ["src/agent", "Reference app-agent implementation"], ["src/skills", "Four example business tools"], ["scripts/dev-start.*", "Reference setup and mock startup"]],
  },
};

export function createTemplateKind(template) {
  if (template.id === "builtin-sandbox-gateway-minimal-v1") return "sandbox";
  if (template.id === "builtin-app-service-builder-vite-v1") return "web";
  if (template.id === "builtin-empty-starter-v1") return "basic";
  if (template.kind === "sample") return "sample";
  throw new Error("No Create guidance is registered for template " + template.id);
}

export function renderCreateProgress(step) {
  return '<ol class="create-progress" aria-label="Create progress">' +
    ["Choose a template", "Describe app", "Review app"].map((label, index) =>
      '<li' + (step === index + 1 ? ' aria-current="step"' : "") + '><span class="create-step-number">' +
      (index + 1) + '</span><span>' + label + '</span></li>').join("") + '</ol>';
}

export const CREATE_FLOW_CSS = `
  .create-progress { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; gap: 16px; width: 100%; max-width: 640px; margin: 0 0 18px; padding: 0; list-style: none; font-size: 12px; container: create-progress / inline-size; }
  .create-progress li { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--studio-muted); }
  .create-progress li > span:last-child { min-width: 0; overflow-wrap: anywhere; }
  .create-progress li + li::before { content: ""; width: 24px; height: 1px; flex: none; background: var(--studio-line); margin-right: 4px; }
  .create-progress [aria-current] { color: var(--studio-ink); }
  .create-step-number { display: grid; place-items: center; width: 24px; height: 24px; flex: none; border: 1px solid var(--studio-line); border-radius: 50%; font-variant-numeric: tabular-nums; line-height: 1; }
  .create-progress [aria-current] .create-step-number { background: var(--canvas-selected, var(--studio-accent-soft)); border-color: var(--studio-accent); }
  @container create-progress (max-width: 520px) {
    .create-progress li { flex-direction: column; align-items: flex-start; gap: 6px; }
    .create-progress li + li::before { display: none; }
    .create-progress li:not(:last-child)::after { content: ""; position: absolute; top: 12px; left: 32px; right: 0; height: 1px; background: var(--studio-line); }
  }
  .create-selection { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 16px; }
  .create-selection > [data-create-context] { align-self: stretch; display: flex; flex-direction: column; min-width: 0; }
  [data-create-context] > .create-starter-panel { flex: 1; }
  .create-selection[data-narrow] { grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 1100px) {
    main:has(.create-selection) { width: min(100%, 1280px); }
    .create-selection { grid-template-columns: minmax(0, 420px) minmax(0, 1fr); }
  }
  .create-configure, .create-review { max-width: 640px; }
  .create-configure-context { font-size: 12px; color: var(--studio-muted); }
  .create-choices { border: 0; min-width: 0; display: grid; gap: 8px; }
  .create-choices > legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .create-template { min-width: 0; border: 1px solid var(--studio-line); border-radius: var(--canvas-radius-surface, 6px); overflow-wrap: anywhere; }
  .create-template:has(input:checked) { border-color: var(--studio-accent); background: var(--canvas-selected, var(--studio-accent-soft)); }
  .create-template .template { border: 0; border-radius: inherit; background: transparent; box-shadow: none; padding: 12px; }
  .create-template .template:has(input:checked) { box-shadow: none; }
  .create-template .template strong { font-weight: 500; }
  [data-create-inline][hidden], [data-create-context][hidden] { display: none !important; }
  [data-create-inline] { border-top: 1px solid var(--studio-line); }
  .create-starter-panel { min-width: 0; padding: 14px; border: 1px solid var(--studio-line); border-radius: var(--canvas-radius-surface, 6px); background: var(--studio-raised); }
  .create-caution, .create-field-help { font-size: 12px; line-height: 18px; margin: 10px 0; color: var(--studio-muted); }
  .create-caution { border-left: 2px solid var(--studio-warn); padding-left: 8px; color: var(--studio-ink); }
  .create-inline-body .create-starter-panel { padding: 12px; border: 0; border-radius: 0; }
  .create-selection .create-footer { border: 0; margin-top: 12px; padding-top: 0; }
  .create-selection .create-footer > p { display: none; }
  .create-starter-heading { margin: 0 0 12px; font-size: 14px; line-height: 20px; font-weight: 600; }
  .create-footer { border-top: 1px solid var(--studio-line); margin-top: 16px; padding-top: 12px; }
  .create-footer > p { font-size: 12px; line-height: 18px; margin-bottom: 8px; }
  .create-footer .actions { margin-top: 8px; flex-wrap: wrap; }
  .create-selection .create-footer .actions { flex-direction: row; align-items: center; flex-wrap: nowrap; gap: 8px; }
  .create-selection .create-footer .actions-right { width: auto; flex-direction: row; }
  .create-selection .create-footer .actions button { width: auto; }
  .create-form { min-width: 0; }
  .create-form .field:first-child { margin-top: 0; }
  .create-form textarea { min-height: 96px; }
  .create-starter-panel > figure { margin: 0; }
  .create-diagram { margin-top: 12px; padding: 8px; border: 1px solid var(--studio-line); border-radius: var(--canvas-radius-surface, 6px); background: var(--studio-raised); }
  .create-diagram svg { display: block; width: 100%; height: auto; }
  .create-diagram-relationships { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .create-review-copy { overflow-wrap: anywhere; }
  .create-review-copy .summary { gap: 12px; }
  .create-review-copy .summary p { margin-bottom: 0; white-space: pre-wrap; }
  .create-review-capabilities { margin: 8px 0 0; display: grid; gap: 10px; }
  .create-review-capabilities > div { margin: 0; padding-left: 10px; border-left: 2px solid var(--studio-line); }
  .create-review-capabilities dt { font-size: 13px; line-height: 18px; font-weight: 500; color: var(--studio-ink); }
  .create-review-capabilities dd { color: var(--studio-muted); font-size: 12px; line-height: 18px; margin: 2px 0 0; }
  .create-field-error { color: var(--studio-danger); font-size: 12px; line-height: 18px; margin: 0; }
  .create-form [aria-invalid="true"] { border-color: var(--studio-danger); }
`;

export function mountCreateFlow({ root, toolkit, buttons, current, guidanceFor, preview, kindFor, step, onError }) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const layout = root.querySelector(".create-selection, .create-configure");
  const contextMount = root.querySelector("[data-create-context]");
  const footer = root.querySelector(".create-footer");
  let panel, inlineMount, disposed = false, originalDiagram;
  function sync() {
    if (disposed || !panel) return;
    const narrow = layout.clientWidth <= 620, focused = document.activeElement;
    const retainFocus = panel.contains(focused) || footer?.contains(focused);
    if (narrow) layout.dataset.narrow = ""; else delete layout.dataset.narrow;
    const destination = narrow ? inlineMount : contextMount;
    if (panel.parentElement !== destination) destination.append(panel);
    if (step === 1 && footer) {
      if (footer.parentElement !== panel) panel.append(footer);
    }
    contextMount.hidden = narrow;
    inlineMount.hidden = !narrow;
    if (retainFocus && document.activeElement !== focused) focused.focus({ preventScroll: true });
    refreshDiagram();
  }
  function blueprintNodes(svg) {
    const rectangles = [...svg.querySelectorAll("rect")], texts = [...svg.querySelectorAll("text")];
    return rectangles.map(rect => ({ rect, texts: texts.filter(text => {
      const x = Number(text.getAttribute("x")), y = Number(text.getAttribute("y"));
      return rectangles.filter(box => x >= Number(box.getAttribute("x")) && x <= Number(box.getAttribute("x")) + Number(box.getAttribute("width")) &&
        y >= Number(box.getAttribute("y")) && y <= Number(box.getAttribute("y")) + Number(box.getAttribute("height")))
        .sort((a, b) => Number(a.getAttribute("width")) * Number(a.getAttribute("height")) - Number(b.getAttribute("width")) * Number(b.getAttribute("height")))[0] === rect;
    }) }));
  }
  function blueprintEdges(kind) {
    return kind === "basic" ? [] : kind === "sandbox" ? [[0, 1], [0, 2]] : kind === "web" ? [[0, 1]] : [[0, 1], [1, 2], [1, 3], [1, 4]];
  }
  function diagram(source, stage, kind) {
    const svg = source.cloneNode(true), ns = "http://www.w3.org/2000/svg";
    const colors = {
      "#ffffff": "var(--studio-raised)", "#f8fafc": "var(--studio-panel)", "#f5f7ff": "var(--canvas-selected, var(--studio-accent-soft))",
      "#f0fdfa": "var(--canvas-selected, var(--studio-accent-soft))",
      "#94a3b8": "var(--studio-line)", "#cbd5e1": "var(--studio-line)",
      "#a5b4fc": "var(--studio-accent)", "#5eead4": "var(--studio-accent)", "#93c5fd": "var(--studio-accent)",
      "#1e3a8a": "var(--studio-accent)", "#312e81": "var(--studio-accent)", "#0f766e": "var(--studio-accent)", "#1d4ed8": "var(--studio-accent)",
      "#334155": "var(--studio-ink)", "#1e293b": "var(--studio-ink)", "#475569": "var(--studio-muted)", "#64748b": "var(--studio-muted)",
    };
    for (const element of svg.querySelectorAll("*")) {
      for (const attr of ["fill", "stroke"]) if (colors[element.getAttribute(attr)]) element.setAttribute(attr, colors[element.getAttribute(attr)]);
      if (element.hasAttribute("font-family")) element.setAttribute("font-family", "var(--font-sans, sans-serif)");
      if (element.getAttribute("font-weight") === "700") element.setAttribute("font-weight", "600");
    }
    stage.replaceChildren(svg);
    if (stage.clientWidth >= 560) {
      stage.dataset.diagramLayout = "horizontal";
      for (const { rect, texts } of blueprintNodes(svg)) for (const text of texts) {
        const available = Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")) - Number(text.getAttribute("x")) - 8;
        const measured = text.getBBox().width;
        if (measured > available) text.setAttribute("font-size", Number(text.getAttribute("font-size")) * available / measured);
      }
      return svg;
    }
    stage.dataset.diagramLayout = "compact";
    const width = Math.min(stage.clientWidth, 560);
    if (width <= 0) return svg;
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) throw Error("Text measurement is unavailable for the starter diagram.");
    const nodes = blueprintNodes(svg);
    const boxes = [], font = getComputedStyle(stage).fontFamily;
    function plan(node, x, y, w) {
      const lines = node.texts.map((text, index) => {
        const size = index ? 12 : 14, height = index ? 18 : 20, wrapped = [];
        measure.font = `${text.getAttribute("font-weight") || "400"} ${size}px ${font}`;
        let line = "";
        for (const word of text.textContent.split(/\s+/)) {
          if (line && measure.measureText(line + " " + word).width > w - 24) { wrapped.push(line); line = word; }
          else line += (line ? " " : "") + word;
        }
        if (line) wrapped.push(line);
        return { text, size, height, wrapped };
      });
      const box = { node, x, y, w, h: 24 + lines.reduce((sum, line) => sum + line.height * line.wrapped.length, 0), lines };
      boxes.push(box); return box;
    }
    let height;
    if (kind === "basic") {
      const workspace = plan(nodes[0], 8, 8, width - 16), cardWidth = (width - 52) / 2;
      let y = workspace.y + workspace.h;
      for (let index = 1; index < nodes.length; index += 2) {
        const row = nodes.slice(index, index + 2).map((node, column) => plan(node, 20 + column * (cardWidth + 12), y, cardWidth));
        const h = Math.max(...row.map(box => box.h)); row.forEach(box => box.h = h); y += h + 12;
      }
      workspace.h = y - workspace.y; height = y + 8;
    } else if (kind === "sample") {
      const w = (width - 56) / 2, roots = nodes.slice(0, 2).map((node, index) => plan(node, 16 + index * (w + 24), 8, w));
      const h = Math.max(...roots.map(box => box.h)); roots.forEach(box => box.h = h);
      let y = 8 + h + 24;
      for (const node of nodes.slice(2)) { const box = plan(node, 16, y, width - 32); y += box.h + 12; }
      height = y - 4;
    } else {
      let y = 8;
      for (const node of nodes) { const box = plan(node, 16, y, width - 32); y += box.h + 24; }
      height = y - 16;
    }
    const make = (name, attrs) => {
      const element = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
      return element;
    };
    svg.replaceChildren(); svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    for (const [fromIndex, toIndex] of blueprintEdges(kind)) {
      const from = boxes[fromIndex], to = boxes[toIndex], fy = from.y + from.h / 2, ty = to.y + to.h / 2;
      const d = from.y === to.y ? `M${from.x + from.w} ${fy}H${to.x}` : kind === "web" ?
        `M${from.x + from.w / 2} ${from.y + from.h}V${to.y}` : `M${from.x + from.w} ${fy}H${width - 8}V${ty}H${to.x + to.w}`;
      svg.append(make("path", { d, fill: "none", stroke: "var(--studio-muted)", "stroke-width": 1.4, ...(kind === "web" ? { "stroke-dasharray": "4 3" } : {}) }));
      if (kind !== "sample") {
        const x = kind === "web" ? to.x + to.w / 2 : to.x + to.w, y = kind === "web" ? to.y : ty;
        svg.append(make("path", { d: kind === "web" ? `M${x - 3} ${y - 5}L${x} ${y}L${x + 3} ${y - 5}` : `M${x + 5} ${y - 3}L${x} ${y}L${x + 5} ${y + 3}`, fill: "none", stroke: "var(--studio-muted)", "stroke-width": 1.4 }));
      }
    }
    for (const { node, x, y, w, h, lines } of boxes) {
      const rect = node.rect.cloneNode(true);
      for (const [key, value] of Object.entries({ x, y, width: w, height: h })) rect.setAttribute(key, value);
      svg.append(rect); let baseline = y + 12;
      for (const line of lines) {
        const text = line.text.cloneNode(false); text.setAttribute("x", x + 12); text.setAttribute("y", baseline + line.size); text.setAttribute("font-size", line.size);
        line.wrapped.forEach((value, index) => { const span = make("tspan", { x: x + 12, y: baseline + line.size + index * line.height }); span.textContent = value + (index < line.wrapped.length - 1 ? " " : ""); text.append(span); });
        svg.append(text); baseline += line.height * line.wrapped.length;
      }
    }
    return svg;
  }
  function renderInlineDiagram(template, kind) {
    const source = document.createElement("div"); source.innerHTML = preview(template);
    const original = source.querySelector("svg");
    if (!original) { onError("The starter diagram is unavailable."); return; }
    const nodes = blueprintNodes(original), label = index => nodes[index].texts[0].textContent;
    const relationships = kind === "basic"
      ? nodes.slice(1).map((_node, index) => label(0) + " contains " + label(index + 1) + ".")
      : blueprintEdges(kind).map(([from, to]) => label(from) + " to " + label(to) + ": " + (kind === "web" ? "optional connection." : "blueprint relationship."));
    const figure = document.createElement("figure");
    figure.innerHTML = '<div class="create-diagram"></div><ol class="create-diagram-relationships" aria-label="Blueprint relationships">' +
      relationships.map(text => '<li>' + escape(text) + '</li>').join("") + '</ol>';
    panel.append(figure);
    originalDiagram = { original, kind };
  }
  function refreshDiagram() {
    const stage = panel?.querySelector(".create-diagram");
    if (originalDiagram && stage?.clientWidth) diagram(originalDiagram.original, stage, originalDiagram.kind);
  }
  function update() {
    if (disposed || step !== 1) return;
    originalDiagram = undefined;
    if (panel) {
      if (footer && panel.contains(footer)) root.append(footer);
      contextMount.append(panel);
      inlineMount.hidden = true; inlineMount.replaceChildren();
      buttons.clear(panel); panel.remove();
    }
    const template = current(), guidance = guidanceFor(template), kind = kindFor(template);
    panel = document.createElement("section"); panel.className = "create-starter-panel"; panel.setAttribute("aria-label", "Selected starter details");
    if (step === 1) {
      panel.innerHTML = '<h2 class="create-starter-heading">Starter architecture</h2>';
      renderInlineDiagram(template, kind);
      const caution = document.createElement("p"); caution.className = "create-caution";
      caution.textContent = guidance.introduction; panel.append(caution);
    }
    contextMount.append(panel);
    inlineMount = [...root.querySelectorAll("[data-create-inline]")].find(node => node.dataset.createInline === template.id);
    sync();
  }
  let resizeFrame;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(sync);
  });
  if (step === 1) { observer.observe(root); update(); }
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true; observer.disconnect(); cancelAnimationFrame(resizeFrame);
      if (footer && panel?.contains(footer)) root.append(footer);
      if (panel) contextMount.append(panel);
    },
  };
}
