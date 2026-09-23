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
.studio-tab-icon--behavior { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3h14v10H9l-4 4v-4H3z'/%3E%3Cpath d='M6 7h8M6 10h5'/%3E%3C/svg%3E"); }
.studio-tab-icon--tools { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M4 5h12M4 10h12M4 15h12'/%3E%3Ccircle cx='7' cy='5' r='2' fill='white'/%3E%3Ccircle cx='13' cy='10' r='2' fill='white'/%3E%3Ccircle cx='8' cy='15' r='2' fill='white'/%3E%3C/svg%3E"); }
.studio-tab-icon--runtime,.studio-tab-icon--output { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='3' width='16' height='14' rx='2'/%3E%3Cpath d='m5 8 3 2-3 2M10 13h4'/%3E%3C/svg%3E"); }
.studio-tab-icon--policies { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 2 16 4v5c0 4-2.5 7-6 9-3.5-2-6-5-6-9V4z'/%3E%3Cpath d='m7 10 2 2 4-5'/%3E%3C/svg%3E"); }
.studio-tab-icon--services { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='7' y='2' width='6' height='4' rx='1'/%3E%3Crect x='2' y='14' width='6' height='4' rx='1'/%3E%3Crect x='12' y='14' width='6' height='4' rx='1'/%3E%3Cpath d='M10 6v4M5 14v-4h10v4'/%3E%3C/svg%3E"); }
.studio-tab-icon--operations { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 5h8M4 10h12M4 15h9'/%3E%3Cpath d='m14 3 3 2-3 2M15 13l2 2-2 2'/%3E%3C/svg%3E"); }
.studio-tab-icon--deployment { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 15H5a3 3 0 0 1-.5-6A5.5 5.5 0 0 1 15 8a3.5 3.5 0 0 1 0 7h-1'/%3E%3Cpath d='M10 17V9m-3 3 3-3 3 3'/%3E%3C/svg%3E"); }
.studio-tab-icon--map { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='7' y='2' width='6' height='4' rx='1'/%3E%3Crect x='2' y='14' width='6' height='4' rx='1'/%3E%3Crect x='12' y='14' width='6' height='4' rx='1'/%3E%3Cpath d='M10 6v4M5 14v-4h10v4'/%3E%3C/svg%3E"); }
.studio-tab-icon--logs { --studio-tab-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='2' width='16' height='16' rx='2'/%3E%3Cpath d='M5 6h1m3 0h6M5 10h1m3 0h6M5 14h1m3 0h6'/%3E%3C/svg%3E"); }
@media (max-width:620px) {
  :is(#details,#workspace-shell) .studio-tabs { padding:0; }
  :is(#details,#workspace-shell) .studio-tabs > button.studio-tab { min-height:52px; padding-inline:2px; }
  .studio-tab-main { gap:4px; }
  .studio-tab-icon { width:14px; height:14px; }
  .studio-tab-label { font-size:11px; }
  .studio-tab-summary { font-size:9px; }
}
`;
