import { octiconMask } from "./studio-icons.mjs";

export const STUDIO_TAB_ICONS = {
  behavior: "comment-discussion",
  tools: "tools",
  runtime: "terminal",
  output: "terminal",
  policies: "shield-check",
  services: "apps",
  operations: "workflow",
  deployment: "cloud",
  map: "project",
  logs: "list-unordered",
};

export const STUDIO_TABS_CSS = `
:is(#details,#workspace-shell) .studio-tabs {
  --studio-tab-count:4;
  display:grid; grid-template-columns:repeat(var(--studio-tab-count),minmax(0,1fr));
  gap:2px; box-sizing:border-box; width:100%; max-width:100%; min-width:0;
  padding:0 2px; border:0; border-bottom:1px solid var(--studio-line,#d2d0ce);
}
:is(#details,#workspace-shell) .studio-tabs > button.studio-tab {
  min-width:0; min-height:48px; display:grid; align-content:center; justify-items:center; gap:1px;
  padding:7px 5px; border:0; border-bottom:3px solid transparent; border-radius:6px 6px 0 0;
  background:transparent; color:var(--studio-muted,#59636e); text-align:center; cursor:pointer;
}
:is(#details,#workspace-shell) .studio-tabs > button.studio-tab:hover:not(:disabled) {
  border-color:transparent; border-bottom-color:var(--studio-line,#d2d0ce); background:var(--studio-panel,rgb(0 0 0/.04));
}
:is(#details,#workspace-shell) .studio-tabs > button.studio-tab[aria-selected="true"] {
  border-bottom-color:var(--studio-accent,#0969da); background:var(--studio-panel,rgb(0 0 0/.04)); color:var(--studio-ink,currentColor);
}
:is(#details,#workspace-shell) .studio-tabs > button.studio-tab:focus-visible { outline:2px solid var(--studio-focus,#0078d4); outline-offset:-2px; }
:is(#details,#workspace-shell) .studio-tabs > button.studio-tab:disabled { opacity:.55; cursor:not-allowed; }
.studio-tab-main { min-width:0; max-width:100%; display:flex; align-items:center; justify-content:center; gap:6px; }
.studio-tab-icon {
  width:16px; height:16px; flex:none; background:currentColor;
  -webkit-mask:var(--studio-tab-icon) center/contain no-repeat;
  mask:var(--studio-tab-icon) center/contain no-repeat;
}
.studio-tab-label {
  min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-size:12px; font-weight:700; line-height:1.2;
}
.studio-tab-summary {
  min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-size:10px; font-weight:500; line-height:1.25; color:var(--studio-muted,#59636e);
}
.studio-tab-summary[data-attention="true"] { color:var(--studio-danger,#a4262c); font-weight:700; }
.studio-tab-panel { min-width:0; outline:none; }
.studio-tab-panel[hidden] { display:none; }
.studio-tab-panel:focus-visible { outline:2px solid var(--studio-focus,#0078d4); outline-offset:-2px; }
${Object.entries(STUDIO_TAB_ICONS).map(([tab, icon]) => `.studio-tab-icon--${tab} { --studio-tab-icon:${octiconMask(icon)}; }`).join("\n")}
@media (max-width:620px) {
  :is(#details,#workspace-shell) .studio-tabs { padding:0; }
  :is(#details,#workspace-shell) .studio-tabs > button.studio-tab { min-height:52px; padding-inline:2px; }
  .studio-tab-main { gap:4px; }
  .studio-tab-icon { width:14px; height:14px; }
  .studio-tab-label { font-size:11px; }
  .studio-tab-summary { font-size:9px; }
}
`;
