// Functions Hosted Skills Studio presentation, scoped away from the App Map.
export const RUN_PANEL_CSS = `
#details[data-mode="manage"] {
  --run-panel: color-mix(in srgb, var(--run-accent) 4%, var(--run-surface));
  --run-surface: var(--background-color-default, #fff);
  --run-line: var(--border-color-default, #e6e3f0);
  --run-ink: var(--text-color-default, #1b1a24);
  --run-muted: var(--text-color-muted, #6a6775);
  --run-accent: var(--true-color-purple, #6b3fd6);
  --run-ok: var(--true-color-green, #0f8060);
  --run-bad: var(--true-color-red, #c43232);
  --run-code: color-mix(in srgb, var(--run-accent) 6%, var(--run-surface));
  color: var(--run-ink); background: var(--run-surface);
  font: 13px/1.5 var(--font-sans, system-ui, sans-serif); padding: 20px 16px;
}
@media (prefers-color-scheme: dark) {
  #details[data-mode="manage"] {
    --run-surface: var(--background-color-default, #1b1a21);
    --run-line: var(--border-color-default, #403c4b);
    --run-ink: var(--text-color-default, #eeedf2);
    --run-muted: var(--text-color-muted, #b6b2c2);
    --run-accent: var(--true-color-purple, #ba9bf6);
    --run-ok: var(--true-color-green, #65c9a3);
    --run-bad: var(--true-color-red, #ff9696);
  }
}
#details[data-mode="manage"] h2 { font-size: 20px; letter-spacing: -.3px; margin: 0 0 4px; }
#details[data-mode="manage"] p { font-size: 12px; line-height: 1.5; color: var(--run-muted); margin: 0 0 10px; }
#details[data-mode="manage"] h3 { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--run-muted); margin: 18px 0 8px; }
#details[data-mode="manage"] button { min-height: 30px; border: 1px solid var(--run-line); border-radius: 8px; padding: 6px 10px; font: 600 12px/1.4 var(--font-sans, system-ui); color: var(--run-ink); background: var(--run-surface); }
#details[data-mode="manage"] button:hover:not(:disabled) { border-color: var(--run-accent); color: var(--run-accent); }
#details[data-mode="manage"] button.primary { background: var(--run-accent); border-color: var(--run-accent); color: var(--run-surface); }
#details[data-mode="manage"] button.primary:hover:not(:disabled) { color: var(--run-surface); filter: brightness(1.08); }
#details[data-mode="manage"] button:disabled { opacity: .5; cursor: not-allowed; }
#details[data-mode="manage"] button.danger, #details[data-mode="manage"] .error { color: var(--run-bad); }
#details[data-mode="manage"] .panel-back { border: 0; padding: 0; min-height: 0; margin-bottom: 12px; background: transparent; color: var(--run-accent); }
#details[data-mode="manage"] .actions { display: flex; flex-wrap: wrap; gap: 8px; }
#details[data-mode="manage"] .actions > button { flex: 0 1 auto; }
#details[data-mode="manage"] .management-section { padding: 0; border: 1px solid var(--run-line); border-radius: 12px; background: var(--run-panel); overflow: hidden; margin: 14px 0; }
#details[data-mode="manage"] .management-section > summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; list-style: none; padding: 12px 14px; margin: 0; cursor: pointer; color: var(--run-ink); font-size: 13px; font-weight: 650; }
#details[data-mode="manage"] summary::-webkit-details-marker { display: none; }
#details[data-mode="manage"] .management-section > summary::before { content: ""; flex: 0 0 6px; width: 6px; height: 6px; border-right: 1.5px solid var(--run-accent); border-top: 1.5px solid var(--run-accent); transform: rotate(45deg); margin-right: 3px; }
#details[data-mode="manage"] .management-section[open] > summary::before { transform: rotate(135deg); }
#details[data-mode="manage"] .management-section[open] > summary { border-bottom: 1px solid var(--run-line); }
#details[data-mode="manage"] .section-body { padding: 14px; }
#details[data-mode="manage"] .connection-summary { flex: 1 1 100%; padding-left: 20px; min-width: 0; margin: 0; font-size: 12px; line-height: 1.5; color: var(--run-muted); font-weight: 400; }
#details[data-mode="manage"] .connection-state { margin-left: auto; }
#details[data-mode="manage"] .gateway-fields { display: grid; gap: 10px; min-width: 0; }
#details[data-mode="manage"] .gateway-fields > button { justify-self: start; }
#details[data-mode="manage"] .gateway-fields > p { margin: 0; }
#details[data-mode="manage"] .studio-field { display: grid; gap: 5px; min-width: 0; font-size: 12px; font-weight: 600; color: var(--run-muted); }
#details[data-mode="manage"] select, #details[data-mode="manage"] textarea { width: 100%; min-width: 0; max-width: 100%; padding: 8px 10px; border: 1px solid var(--run-line); border-radius: 8px; background: var(--run-surface); color: var(--run-ink); font: 13px/1.5 var(--font-sans, system-ui); }
#details[data-mode="manage"] textarea { min-height: 84px; }
#details[data-mode="manage"] .run-card { background: transparent; border: 0; padding: 0; margin: 0 0 14px; }
#details[data-mode="manage"] .run-card > strong { font-size: 14px; }
#details[data-mode="manage"] .run-card > button { margin: 4px 6px 0 0; }
#details[data-mode="manage"] .action-priority { display: none; }
#details[data-mode="manage"] .command-output { background: var(--run-code); color: var(--run-ink); border: 1px solid var(--run-line); border-radius: 8px; font: 12px/1.55 var(--font-mono, ui-monospace, monospace); }
#details[data-mode="manage"] .live-output { min-height: 120px; max-height: 280px; margin: 0; background: #000; color: #fff; }
#details[data-mode="manage"] .agent-response { min-height: 0; padding: 10px; white-space: pre-wrap; }
#details[data-mode="manage"] .agent-response:empty { display: none; }
#details[data-mode="manage"] .document-input { display: grid; gap: 8px; min-width: 0; }
#details[data-mode="manage"] .document-input p { margin: 0; }
#details[data-mode="manage"] .document-input p:empty { display: none; }
#details[data-mode="manage"] .document-input input[type="file"] { width: 100%; min-width: 0; font: 12px var(--font-sans, system-ui); }
#details[data-mode="manage"] .document-input > button { justify-self: start; }
#details[data-mode="manage"] .document-input .command-badge { justify-self: start; }
#details[data-mode="manage"] .document-assessment { display:grid; gap:8px; padding:12px; border:1px solid var(--run-line); border-radius:8px; }
#details[data-mode="manage"] .document-assessment > .command-badge { justify-self:start; }
#details[data-mode="manage"] .document-assessment p { margin:0; }
#details[data-mode="manage"] .sanitized-document { min-height:0; max-height:240px; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
#details[data-mode="manage"] .developer-tool-card { background: var(--run-surface); border-color: var(--run-line); border-radius: 10px; padding: 14px; gap: 10px; }
#details[data-mode="manage"] .endpoint-row { border-color: var(--run-line); background: var(--run-surface); border-radius: 9px; }
#details[data-mode="manage"] .endpoint-row code, #details[data-mode="manage"] .endpoint-row small { color: var(--run-muted); }
#details[data-mode="manage"] .endpoint-row button { font-size: 11px; padding: 4px 8px; }
#details[data-mode="manage"] .tool-status, #details[data-mode="manage"] .command-badge { width: fit-content; display: inline-flex; align-items: center; font-size: 10px; font-weight: 600; line-height: 1.4; padding: 2px 7px; border: 1px solid var(--run-line); border-radius: 999px; background: var(--run-surface); color: var(--run-muted); }
#details[data-mode="manage"] [data-state="succeeded"], #details[data-mode="manage"] .tool-status.ready { color: var(--run-ok); border-color: color-mix(in srgb, var(--run-ok) 35%, var(--run-line)); }
#details[data-mode="manage"] [data-state="running"] { color: var(--run-accent); border-color: color-mix(in srgb, var(--run-accent) 40%, var(--run-line)); }
#details[data-mode="manage"] [data-state="failed"] { color: var(--run-bad); border-color: color-mix(in srgb, var(--run-bad) 35%, var(--run-line)); }
#details[data-mode="manage"] .command-feed { display: grid; gap: 8px; max-height: 320px; overflow-y: auto; }
#details[data-mode="manage"] .command-record { min-width: 0; border: 1px solid var(--run-line); border-radius: 10px; background: var(--run-surface); padding: 10px; margin: 0; }
#details[data-mode="manage"] .command-record[data-status="running"] { border-color: color-mix(in srgb, var(--run-accent) 45%, var(--run-line)); }
#details[data-mode="manage"] .command-record[data-status="failed"] { border-color: color-mix(in srgb, var(--run-bad) 45%, var(--run-line)); }
#details[data-mode="manage"] .command-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
#details[data-mode="manage"] .command-title { font-size: 12px; font-weight: 650; overflow-wrap: anywhere; }
#details[data-mode="manage"] .command-kind { border-radius: 5px; text-transform: uppercase; letter-spacing: .3px; font-size: 10px; color: var(--run-accent); }
#details[data-mode="manage"] .command-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; color: var(--run-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
#details[data-mode="manage"] .command-code { min-height: 0; max-height: 220px; overflow: auto; resize: none; padding: 8px 10px; margin: 8px 0 0; border: 1px solid var(--run-line); border-radius: 8px; background: var(--run-code); color: var(--run-ink); font: 12px/1.5 var(--font-mono, ui-monospace, monospace); white-space: pre-wrap; overflow-wrap: anywhere; }
`;
