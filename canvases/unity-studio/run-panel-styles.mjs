import { ACTION_BUTTON_STYLE } from "./control-styles.mjs";

export const RUN_PANEL_CSS = `
#details[data-mode="manage"] {
  color:var(--studio-ink); background:var(--studio-raised);
  font:13px/1.5 var(--font-sans, system-ui, sans-serif); padding:24px;
}
#details[data-mode="manage"] .run-workspace { width:100%; max-width:960px; margin:0 auto; min-width:0; }
#details[data-mode="manage"] h2 { font-size:20px; letter-spacing:-.3px; margin:0; }
#details[data-mode="manage"] h3 { font-size:13px; font-weight:600; margin:16px 0 8px; color:var(--studio-ink); }
#details[data-mode="manage"] p { font-size:12px; line-height:1.5; color:var(--studio-muted); margin:0 0 10px; overflow-wrap:anywhere; }
#details[data-mode="manage"] button { ${ACTION_BUTTON_STYLE} border:1px solid var(--studio-line); color:var(--studio-ink); background:var(--studio-raised); max-width:100%; }
#details[data-mode="manage"] button:hover:not(:disabled) { border-color:var(--studio-accent); background:var(--studio-panel); }
#details[data-mode="manage"] button.primary { background:var(--studio-accent); border-color:var(--studio-accent); color:var(--studio-on-accent); }
#details[data-mode="manage"] button.primary:hover:not(:disabled) { background:var(--studio-accent-2); }
#details[data-mode="manage"] button:disabled { opacity:.6; cursor:not-allowed; }
#details[data-mode="manage"] button.danger, #details[data-mode="manage"] .error { color:var(--studio-danger); }
#details[data-mode="manage"] .run-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 20px; margin-bottom:20px; }
#details[data-mode="manage"] .run-connection { min-width:0; max-width:min(100%, 380px); display:grid; justify-items:start; gap:2px; border:1px solid var(--studio-line); border-radius:6px; padding:6px 10px; color:var(--studio-ink); background:var(--studio-raised); font-size:12px; text-align:left; }
#details[data-mode="manage"] .run-connection-action { font-weight:600; color:var(--studio-accent); }
#details[data-mode="manage"] .run-connection-value { display:block; min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; font-weight:400; color:var(--studio-muted); }
#details[data-mode="manage"] .run-open-app, #details[data-mode="manage"] .run-section-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
#details[data-mode="manage"] .run-open-app p, #details[data-mode="manage"] .run-section-actions p, #details[data-mode="manage"] .run-section-actions h3 { margin:0; }
#details[data-mode="manage"] .run-section-actions button { flex-shrink:0; }
#details[data-mode="manage"] .run-card { background:var(--studio-panel); border:1px solid var(--studio-line); border-radius:8px; padding:14px 16px; margin:0 0 16px; }
#details[data-mode="manage"] .run-card > strong { font-size:14px; }
#details[data-mode="manage"] .run-card > button { margin:4px 6px 0 0; }
#details[data-mode="manage"] .action-priority { display:none; }
#details[data-mode="manage"] .run-runtime-notice { padding:0; margin:0 0 8px; }
#details[data-mode="manage"] .agent-tester { position:relative; display:grid; gap:8px; border:0; background:transparent; border-radius:0; padding:0; margin:16px 0 0; }
#details[data-mode="manage"] .agent-tester > strong { font-size:13px; }
#details[data-mode="manage"] .agent-tester > .tool-status { justify-self:start; }
#details[data-mode="manage"] .agent-tester > h3 { margin:12px 0 0; }
#details[data-mode="manage"] textarea { width:100%; min-width:0; padding:10px 12px; border:1px solid var(--studio-line); border-radius:7px; background:var(--studio-raised); color:var(--studio-ink); font:13px/1.6 var(--font-sans, system-ui); min-height:88px; }
#details[data-mode="manage"] textarea:focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
#details[data-mode="manage"] .actions { display:flex; flex-wrap:wrap; gap:8px; margin:4px 0; }
#details[data-mode="manage"] .actions > button { flex:0 1 auto; white-space:normal; }
#details[data-mode="manage"] .agent-response { min-height:96px; max-height:300px; overflow:auto; padding:14px 16px; border:1px solid var(--studio-line); border-radius:7px; background:var(--studio-panel); color:var(--studio-ink); white-space:pre-wrap; overflow-wrap:anywhere; font:13px/1.65 var(--font-sans, system-ui); }
#details[data-mode="manage"] .run-document > summary, #details[data-mode="manage"] .run-tool-activity > summary, #details[data-mode="manage"] .agent-tester > details > summary { color:var(--studio-muted); cursor:pointer; font-size:12px; padding:5px 0; overflow-wrap:anywhere; }
#details[data-mode="manage"] .document-input { display:grid; gap:8px; min-width:0; padding:8px 0; }
#details[data-mode="manage"] .document-input p { margin:0; }
#details[data-mode="manage"] .document-input p:empty { display:none; }
#details[data-mode="manage"] .document-input input[type="file"] { width:100%; min-width:0; min-height:32px; font:12px var(--font-sans, system-ui); }
#details[data-mode="manage"] .document-input > button { justify-self:start; }
#details[data-mode="manage"] .document-assessment { display:grid; gap:8px; padding:12px; border:1px solid var(--studio-line); border-radius:7px; }
#details[data-mode="manage"] .document-assessment > .command-badge { justify-self:start; }
#details[data-mode="manage"] .document-assessment p { margin:0; }
#details[data-mode="manage"] .sanitized-document { min-height:0; max-height:240px; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
#details[data-mode="manage"] .run-sections { margin-top:24px; border-top:1px solid var(--studio-line); }
#details[data-mode="manage"] .run-section { margin:0; border-bottom:1px solid var(--studio-line); }
#details[data-mode="manage"] .run-section > summary { display:flex; align-items:center; gap:10px; padding:14px 0; cursor:pointer; list-style:none; }
#details[data-mode="manage"] .run-section > summary::-webkit-details-marker { display:none; }
#details[data-mode="manage"] .run-section > summary::before { content:""; width:6px; height:6px; border-top:1.5px solid currentColor; border-right:1.5px solid currentColor; transform:rotate(45deg); color:var(--studio-muted); margin:0 4px 0 2px; flex-shrink:0; }
#details[data-mode="manage"] .run-section[open] > summary::before { transform:rotate(135deg); }
#details[data-mode="manage"] .run-section-title { font-size:13px; font-weight:600; }
#details[data-mode="manage"] .run-section-summary { margin-left:auto; text-align:right; color:var(--studio-muted); font-size:12px; }
#details[data-mode="manage"] .run-section-summary[data-attention="true"] { color:var(--studio-danger); }
#details[data-mode="manage"] .run-section-body { padding:0 0 16px; min-width:0; }
#details[data-mode="manage"] .endpoint-row { border:0; border-bottom:1px solid var(--studio-line); border-radius:0; padding:10px 0; margin:0; background:transparent; }
#details[data-mode="manage"] .endpoint-row:last-child { border-bottom:0; }
#details[data-mode="manage"] .endpoint-row .runtime-source-action { grid-column:1 / -1; grid-row:auto; justify-self:start; min-height:24px; padding:0; border:0; color:var(--studio-accent); font-size:11px; font-weight:400; }
#details[data-mode="manage"] .endpoint-row code, #details[data-mode="manage"] .endpoint-row small { color:var(--studio-muted); }
#details[data-mode="manage"] .tool-status, #details[data-mode="manage"] .command-badge { width:fit-content; display:inline-flex; align-items:center; font-size:11px; font-weight:600; line-height:1.4; padding:2px 7px; border:1px solid var(--studio-line); border-radius:999px; background:var(--studio-raised); color:var(--studio-muted); }
#details[data-mode="manage"] [data-state="succeeded"], #details[data-mode="manage"] .tool-status.ready { color:var(--studio-ok); border-color:var(--studio-ok); }
#details[data-mode="manage"] [data-state="running"] { color:var(--studio-accent); border-color:var(--studio-accent); }
#details[data-mode="manage"] [data-state="failed"] { color:var(--studio-danger); border-color:var(--studio-danger); }
#details[data-mode="manage"] .command-output { background:var(--studio-panel); color:var(--studio-ink); border:1px solid var(--studio-line); border-radius:7px; font:12px/1.55 var(--font-mono, ui-monospace, monospace); min-height:0; max-height:280px; padding:12px; overflow:auto; }
#details[data-mode="manage"] .live-output { min-height:100px; max-height:240px; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
#details[data-mode="manage"] .command-feed { display:grid; gap:0; max-height:260px; overflow:auto; }
#details[data-mode="manage"] .command-record { min-width:0; border:0; border-bottom:1px solid var(--studio-line); border-radius:0; padding:10px 0; margin:0; }
#details[data-mode="manage"] .command-head { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; }
#details[data-mode="manage"] .command-title { font-size:12px; font-weight:600; overflow-wrap:anywhere; }
#details[data-mode="manage"] .command-kind { border-radius:4px; font-size:10px; color:var(--studio-muted); }
#details[data-mode="manage"] .command-meta { display:flex; flex-wrap:wrap; gap:8px; margin-top:5px; color:var(--studio-muted); font-size:11px; font-variant-numeric:tabular-nums; }
#details[data-mode="manage"] .command-code { min-height:0; max-height:220px; overflow:auto; resize:none; padding:8px 10px; margin:8px 0 0; border:1px solid var(--studio-line); border-radius:6px; background:var(--studio-panel); color:var(--studio-ink); font:12px/1.5 var(--font-mono, ui-monospace, monospace); white-space:pre-wrap; overflow-wrap:anywhere; }
@media (max-width:620px) {
  #details[data-mode="manage"] { padding:16px; }
  #details[data-mode="manage"] .run-heading { gap:4px; margin-bottom:16px; }
  #details[data-mode="manage"] .run-heading h2 { width:100%; }
  #details[data-mode="manage"] .run-open-app, #details[data-mode="manage"] .run-section-actions { align-items:flex-start; flex-wrap:wrap; }
  #details[data-mode="manage"] .run-section > summary { gap:8px; }
  #details[data-mode="manage"] .run-section-summary { font-size:11px; }
}
`;
