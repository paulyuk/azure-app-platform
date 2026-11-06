import { ACTION_BUTTON_STYLE } from "./control-styles.mjs";
import { STUDIO_FILTERABLE_DROPDOWN_CSS } from "./studio-toolkit-components.mjs";
import { STUDIO_TABS_CSS } from "./studio-tabs.mjs";
import { octiconMask } from "./studio-icons.mjs";

export const AGENT_STATUS_CSS = `
#details[data-mode="manage"] .agent-status-brief { min-width:0; border:1px solid var(--studio-line); border-radius:8px; overflow:hidden; background:var(--studio-raised); color:var(--studio-ink); }
#details[data-mode="manage"] .agent-status-summary { display:flex; flex-wrap:wrap; align-items:flex-start; gap:10px; padding:12px; }
#details[data-mode="manage"] .agent-status-summary > div { min-width:0; }
#details[data-mode="manage"] .agent-status-copy { flex:1 1 180px; }
#details[data-mode="manage"] .agent-status-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; max-width:100%; margin-inline-start:auto; }
#details[data-mode="manage"] .agent-status-actions button { max-width:100%; white-space:normal; }
#details[data-mode="manage"] .agent-status-copy .command-code { max-height:160px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; margin:4px 0; }
#details[data-mode="manage"] .agent-status-copy details { font-size:12px; margin-top:4px; }
#details[data-mode="manage"] .agent-status-copy summary { cursor:pointer; }
#details[data-mode="manage"] .agent-status-prerequisites { margin:4px 0 0; padding-inline-start:18px; font-size:12px; overflow-wrap:anywhere; }
#details[data-mode="manage"] .agent-connection-shortcut { flex:none; }
#details[data-mode="manage"] .agent-status-icon { display:grid; flex:none; place-items:center; width:28px; height:28px; border-radius:50%; color:var(--text-color-button-primary-rest, var(--studio-on-accent)); background:var(--background-color-button-primary-rest, var(--canvas-button-primary-bg, var(--studio-accent))); }
#details[data-mode="manage"] .agent-status-icon[data-tone="busy"] { background:var(--studio-accent); }
#details[data-mode="manage"] .agent-status-icon[data-tone="success"] { background:var(--studio-ok); }
#details[data-mode="manage"] .agent-status-icon[data-tone="warning"] { background:var(--studio-warn); }
#details[data-mode="manage"] .agent-status-icon[data-tone="danger"] { background:var(--studio-danger); }
#details[data-mode="manage"] .agent-status-icon::before { content:""; width:16px; height:16px; background:currentColor; mask:${octiconMask("info")} center/contain no-repeat; }
#details[data-mode="manage"] .agent-status-icon[data-tone="busy"]::before { mask-image:${octiconMask("stopwatch")}; }
#details[data-mode="manage"] .agent-status-icon[data-tone="success"]::before { mask-image:${octiconMask("check")}; }
#details[data-mode="manage"] .agent-status-icon:is([data-tone="danger"],[data-tone="warning"])::before { mask-image:${octiconMask("alert")}; }
#details[data-mode="manage"] .agent-invoke-spinner.ct-spinner { display:inline-flex; width:auto; min-height:0; color:inherit; }
#details[data-mode="manage"] .agent-invoke-spinner .ct-spinner-ring { width:14px; height:14px; border-color:color-mix(in srgb, currentColor 28%, transparent); border-top-color:currentColor; }
#details[data-mode="manage"] .agent-status-brief h2 { font-size:11px; letter-spacing:0; color:var(--studio-muted); font-weight:600; margin:0; }
#details[data-mode="manage"] .agent-status-brief h3 { font-size:14px; line-height:1.5; margin:0; color:var(--studio-ink); overflow-wrap:anywhere; }
#details[data-mode="manage"] .agent-status-brief p { font-size:12px; line-height:1.5; margin:0; color:var(--studio-muted); }
#details[data-mode="manage"] .agent-status-brief p.error { color:var(--studio-danger); }
#details[data-mode="manage"] .agent-status-brief:is([data-state="runtime-failed"],[data-state="unavailable"]) h3 { color:var(--studio-danger); }
#details[data-mode="manage"] .agent-status-brief[data-state="invoking"] h3 { color:var(--studio-accent); }
#details[data-mode="manage"] .agent-status-facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin:0; min-width:0; border-top:1px solid var(--studio-line); background:var(--studio-panel); font-size:11px; }
#details[data-mode="manage"] .agent-status-facts > div { min-width:0; padding:8px 10px; }
#details[data-mode="manage"] .agent-status-facts > div + div { border-inline-start:1px solid var(--studio-line); }
#details[data-mode="manage"] .agent-status-facts dt { color:var(--studio-muted); font-weight:600; overflow-wrap:anywhere; }
#details[data-mode="manage"] .agent-status-facts dd { display:flex; align-items:center; gap:4px; margin:2px 0 0; color:var(--studio-ink); overflow-wrap:anywhere; }
#details[data-mode="manage"] .agent-status-facts dd > span { min-width:0; }
@media (max-width:620px) {
  #details[data-mode="manage"] .agent-status-facts { grid-template-columns:minmax(0,1fr); }
  #details[data-mode="manage"] .agent-status-facts > div + div { border-inline-start:0; border-top:1px solid var(--studio-line); }
}
`;

export const RUN_PANEL_CONTENT_CSS = `
#workspace-diagnostics { flex:none; min-width:0; color:var(--studio-ink); background:var(--studio-raised); font:13px/1.5 var(--font-sans,system-ui,sans-serif); }
body[data-workspace="build"] #workspace-diagnostics[data-diagnostics="closed"] { display:none; }
#details:is([data-mode="manage"], [data-mode="deploy"], [data-mode="connections"]) {
  color:var(--studio-ink); background:var(--studio-raised);
  font:13px/1.5 var(--font-sans, system-ui, sans-serif); padding:16px 12px;
}
#details[data-mode="manage"] .run-workspace, #details[data-mode="deploy"] .deploy-workspace { width:100%; max-width:960px; margin:0 auto; min-width:0; }
#details:is([data-mode="manage"], [data-mode="deploy"], [data-mode="connections"]) h2 { font-size:20px; letter-spacing:-.3px; margin:0; }
#details[data-mode="manage"] h3, #details[data-mode="deploy"] h3 { font-size:13px; font-weight:600; margin:16px 0 8px; color:var(--studio-ink); }
#details:is([data-mode="manage"], [data-mode="deploy"], [data-mode="connections"]) p { font-size:12px; line-height:1.5; color:var(--studio-muted); margin:0 0 10px; overflow-wrap:anywhere; }
#details[data-mode="manage"] button:not(.ct-button):not([role="tab"]):not(.run-connection), #details[data-mode="deploy"] button:not(.ct-button) { ${ACTION_BUTTON_STYLE} border:1px solid var(--studio-line); color:var(--studio-ink); background:var(--studio-raised); max-width:100%; }
#details[data-mode="manage"] button:not(.ct-button):not([role="tab"]):not(.run-connection):hover:not(:disabled), #details[data-mode="deploy"] button:not(.ct-button):hover:not(:disabled) { border-color:var(--studio-accent); background:var(--studio-panel); }
#details[data-mode="manage"] button.primary:not(.ct-button), #details[data-mode="deploy"] button.primary:not(.ct-button) { background:var(--studio-accent); border-color:var(--studio-accent); color:var(--studio-on-accent); }
#details[data-mode="manage"] button.primary:not(.ct-button):hover:not(:disabled), #details[data-mode="deploy"] button.primary:not(.ct-button):hover:not(:disabled) { background:var(--studio-accent-2); }
#details[data-mode="manage"] button:not(.ct-button):disabled, #details[data-mode="deploy"] button:not(.ct-button):disabled { opacity:.6; cursor:not-allowed; }
#details[data-mode="manage"] button.danger, #details:is([data-mode="manage"], [data-mode="deploy"], [data-mode="connections"]) .error { color:var(--studio-danger); }
#details:is([data-mode="manage"], [data-mode="deploy"], [data-mode="connections"]) .gateway-fields { display:grid; gap:14px; min-width:0; max-width:560px; }
#details:is([data-mode="manage"], [data-mode="deploy"], [data-mode="connections"]) .studio-field { display:grid; gap:6px; min-width:0; color:var(--studio-ink); font:600 12px/1.4 var(--font-sans, system-ui, sans-serif); }
#details:is([data-mode="manage"], [data-mode="deploy"], [data-mode="connections"]) .studio-field > span:first-child { display:block; font-size:12px; font-weight:600; color:var(--studio-ink); }
#details:is([data-mode="manage"], [data-mode="deploy"], [data-mode="connections"]) select { box-sizing:border-box; width:100%; min-width:0; max-width:100%; height:34px; min-height:34px; padding:6px 10px; border:1px solid var(--studio-line); border-radius:6px; color:var(--studio-ink); background:var(--studio-raised); font:13px/1.4 var(--font-sans, system-ui, sans-serif); }
#details:is([data-mode="manage"], [data-mode="connections"]) .field-group, .studio-settings .field-group { display:grid; gap:8px; min-width:0; }
#details:is([data-mode="manage"], [data-mode="connections"]) .field-actions, .studio-settings .field-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
#details[data-mode="manage"] .env-section-card { padding:16px; border:1px solid var(--studio-line); border-radius:8px; background:var(--studio-panel); margin-bottom:16px; }
#details[data-mode="manage"] .env-section-card > h3 { margin-top:0; }
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
#details[data-mode="manage"] textarea { display:block; width:100%; min-width:0; padding:10px 12px; border:1px solid var(--studio-line); border-radius:7px; background:var(--studio-raised); color:var(--studio-ink); font:13px/1.6 var(--font-sans, system-ui); min-height:88px; }
#details[data-mode="manage"] textarea:focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
#details[data-mode="manage"] .actions { display:flex; flex-wrap:wrap; gap:8px; margin:4px 0; }
#details[data-mode="manage"] .actions > button { flex:0 1 auto; white-space:normal; }
#details[data-mode="manage"] .agent-response { min-height:96px; max-height:300px; overflow:auto; padding:14px 16px; border:1px solid var(--studio-line); border-radius:7px; background:var(--studio-panel); color:var(--studio-ink); white-space:pre-wrap; overflow-wrap:anywhere; font:13px/1.65 var(--font-sans, system-ui); }
#details[data-mode="manage"] .agent-response[data-state="failed"] .agent-result-title { color:var(--studio-danger); }
#details[data-mode="manage"] .agent-response:focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
#details[data-mode="manage"] .agent-response:not([data-state="succeeded"]) { display:grid; align-self:start; gap:8px; min-height:0; padding:10px 12px; white-space:normal; }
#details[data-mode="manage"] .agent-response[data-state="invoking"] { max-height:none; }
#details[data-mode="manage"] .agent-result-summary { display:flex; align-items:center; gap:8px; min-width:0; }
#details[data-mode="manage"] .agent-result-illustration { --run-art-brand:var(--true-color-blue, #5c8df8); --run-art-soft-blue:color-mix(in srgb, var(--run-art-brand) 20%, #ffffff); --run-art-outline:#294482; --run-art-paper:#f5f5f5; --run-art-task:#ffe4b4; --run-art-highlight:#ffffff; display:block; flex:none; width:40px; height:40px; }
#details[data-mode="manage"] .agent-result-copy { min-width:0; }
#details[data-mode="manage"] .agent-result-title { display:flex; align-items:center; gap:6px; font-size:13px; line-height:1.45; }
#details[data-mode="manage"] .agent-result-copy p { margin:4px 0 0; font-size:12px; line-height:1.5; }
#details[data-mode="manage"] .agent-result-copy .agent-result-error { color:var(--studio-ink); white-space:pre-wrap; }
#details[data-mode="manage"] .agent-result-step-spinner { display:flex; align-items:center; flex:none; width:16px; height:16px; }
#details[data-mode="manage"] .agent-result-step-spinner > .ct-provider { display:contents; }
#details[data-mode="manage"] .agent-result-footer { display:flex; }
#details[data-mode="manage"] .agent-response[data-state="blocked"] { display:block; max-height:none; overflow:visible; padding:0; border-color:color-mix(in srgb, var(--studio-danger) 45%, var(--studio-line)); color:var(--studio-ink); white-space:normal; }
.blocked-agent-card { display:grid; gap:10px; padding:14px; border-radius:7px; color:var(--studio-ink); background:var(--studio-raised); white-space:normal; }
.blocked-agent-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.blocked-agent-identity { display:flex; align-items:flex-start; gap:9px; min-width:0; }
.blocked-agent-icon { display:grid; flex:none; place-items:center; width:18px; height:18px; margin-top:1px; border:1px solid var(--studio-danger); border-radius:50%; color:var(--studio-danger); background:color-mix(in srgb, var(--studio-danger) 12%, transparent); }
.blocked-agent-icon::before { content:""; width:10px; height:10px; background:currentColor; mask:${octiconMask("alert")} center/contain no-repeat; }
.blocked-agent-title { display:grid; min-width:0; }
.blocked-agent-title strong { font-size:13px; color:var(--studio-danger); }
.blocked-agent-title span { color:var(--studio-muted); font-size:10px; }
.blocked-agent-status { flex:none; padding:3px 8px; border:1px solid color-mix(in srgb, var(--studio-danger) 45%, var(--studio-line)); border-radius:999px; color:var(--studio-danger); background:color-mix(in srgb, var(--studio-danger) 10%, var(--studio-panel)); font:10px/1.35 var(--font-mono,ui-monospace,monospace); }
.blocked-agent-callout { margin:0; padding:9px 11px; border-inline-start:3px solid var(--studio-danger); color:var(--studio-ink); background:color-mix(in srgb, var(--studio-danger) 8%, var(--studio-panel)); font-size:12px; }
.blocked-agent-path-heading { display:flex; align-items:baseline; gap:5px; flex-wrap:wrap; }
.blocked-agent-path-heading strong { font-size:11px; }
.blocked-agent-path-heading span { color:var(--studio-muted); font-size:10px; }
.blocked-agent-stages { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; }
.blocked-agent-stage { display:grid; align-content:start; gap:6px; min-width:0; min-height:72px; padding:9px 10px; border:1px solid var(--studio-line); border-radius:7px; background:var(--studio-raised); }
.blocked-agent-stage-header { display:flex; align-items:center; gap:6px; min-width:0; }
.blocked-agent-stage-header strong { min-width:0; font-size:10px; overflow-wrap:anywhere; }
.blocked-agent-stage-icon { display:grid; flex:none; place-items:center; width:16px; height:16px; border:1px solid var(--studio-muted); border-radius:50%; color:var(--studio-muted); }
.blocked-agent-stage-icon::before { content:"−"; font:700 10px/1 var(--font-sans,system-ui); }
.blocked-agent-stage[data-state="succeeded"] .blocked-agent-stage-icon { border-color:var(--studio-ok); color:var(--studio-ok); }
.blocked-agent-stage[data-state="succeeded"] .blocked-agent-stage-icon::before { content:"✓"; }
.blocked-agent-stage:is([data-state="rejected"],[data-state="blocked"],[data-state="failed"]) { border-color:color-mix(in srgb, var(--studio-danger) 55%, var(--studio-line)); background:color-mix(in srgb, var(--studio-danger) 6%, var(--studio-raised)); }
.blocked-agent-stage:is([data-state="rejected"],[data-state="blocked"],[data-state="failed"]) .blocked-agent-stage-icon { border-color:var(--studio-danger); color:var(--studio-danger); }
.blocked-agent-stage:is([data-state="rejected"],[data-state="blocked"],[data-state="failed"]) .blocked-agent-stage-icon::before { content:"!"; }
.blocked-agent-stage-detail { color:var(--studio-muted); font-size:10px; line-height:1.4; overflow-wrap:anywhere; }
.blocked-agent-summary { font-size:11px; }
.blocked-agent-limit { margin:0; color:var(--studio-muted); font-size:10px; line-height:1.5; }
.blocked-agent-disclosures { display:flex; flex-wrap:wrap; gap:6px 14px; padding-top:2px; border-top:1px solid var(--studio-line); }
.blocked-agent-disclosure { min-width:0; max-width:100%; }
.blocked-agent-disclosure > summary { color:var(--studio-muted); cursor:pointer; font-size:10px; }
.blocked-agent-disclosure > ul { margin:7px 0 0; padding-inline-start:18px; color:var(--studio-muted); font-size:10px; }
.blocked-agent-evidence { max-width:min(720px,calc(100vw - 64px)); max-height:240px; margin:7px 0 0; padding:9px; overflow:auto; border:1px solid var(--studio-line); border-radius:6px; color:var(--studio-ink); background:var(--studio-panel); white-space:pre-wrap; overflow-wrap:anywhere; font:10px/1.5 var(--font-mono,ui-monospace,monospace); }
#details[data-mode="manage"] .run-document > summary, #details[data-mode="manage"] .run-tool-activity > summary, #details[data-mode="manage"] .agent-tester > details > summary { color:var(--studio-muted); cursor:pointer; font-size:12px; padding:5px 0; overflow-wrap:anywhere; }
#details[data-mode="manage"] .document-input { display:grid; gap:8px; min-width:0; padding:0; }
#details[data-mode="manage"] .document-input:not(:has(> :not([hidden]):not(:empty))) { display:none; }
#details[data-mode="manage"] .document-input p { margin:0; }
#details[data-mode="manage"] .document-input p:empty { display:none; }
#details[data-mode="manage"] .document-input input[type="file"] { width:100%; min-width:0; min-height:32px; font:12px var(--font-sans, system-ui); }
#details[data-mode="manage"] .document-input > button { justify-self:start; }
#details[data-mode="manage"] .agent-prompt-frame { min-width:0; }
#details[data-mode="manage"] .agent-task-actions { align-items:center; margin:0; }
#details[data-mode="manage"] .agent-dispatch-actions { display:flex; align-items:center; gap:8px; max-width:100%; }
#details[data-mode="manage"] [data-invoke-agent][data-appearance="secondary"] svg[data-octicon="agent"] { color:var(--background-color-button-primary-rest, var(--canvas-button-primary-bg, var(--studio-accent))); }
#details[data-mode="manage"] .document-attachment { display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border:1px solid var(--studio-line); border-radius:7px; background:var(--studio-panel); }
#details[data-mode="manage"] .document-attachment[hidden] { display:none; }
#details[data-mode="manage"] .document-attachment > .run-document { flex:1; min-width:0; }
#details[data-mode="manage"] .document-summary-content { display:inline-flex; align-items:center; gap:8px; max-width:calc(100% - 14px); vertical-align:middle; }
#details[data-mode="manage"] .document-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; color:var(--studio-ink); }
#details[data-mode="manage"] .document-source-label { flex:none; margin:0; color:var(--studio-muted); }
#details[data-mode="manage"] .document-preview { margin:8px 0 0; max-height:280px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font:13px/1.65 var(--font-sans, system-ui); color:var(--studio-ink); }
#details[data-mode="manage"] .document-paste { display:grid; gap:8px; min-width:0; }
#details[data-mode="manage"] .run-document > .document-paste { margin-top:8px; }
#details[data-mode="manage"] .document-paste[hidden] { display:none; }
#details[data-mode="manage"] .event-runner-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
#details[data-mode="manage"] .event-runner-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
#details[data-mode="manage"] .event-preset-bar { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:2px 0 4px; }
#details[data-mode="manage"] .event-preset-label { font-size:11px; font-weight:600; color:var(--studio-muted); margin-right:2px; }
#details[data-mode="manage"] select.event-preset-select { width:auto; flex:0 1 260px; max-width:100%; height:28px; min-height:28px; padding:2px 8px; border-radius:6px; font:600 11px/1.3 var(--font-mono, ui-monospace, monospace); background:var(--studio-panel); border:1px solid var(--studio-line); color:var(--studio-ink); }
#details[data-mode="manage"] select.event-preset-select:focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
#details[data-mode="manage"] button.event-preset-chip:not(.ct-button) { min-height:24px; padding:2px 8px; border-radius:999px; font:600 11px/1.3 var(--font-mono, ui-monospace, monospace); background:var(--studio-panel); border:1px solid var(--studio-line); color:var(--studio-ink); }
#details[data-mode="manage"] button.event-preset-chip:not(.ct-button):hover:not(:disabled) { border-color:var(--studio-accent); background:var(--studio-accent-soft, var(--studio-panel)); }
#details[data-mode="manage"] .safety-trust-section { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 12px; margin:2px 0; padding:9px 0; border-top:1px solid var(--studio-line); border-bottom:1px solid var(--studio-line); }
#details[data-mode="manage"] .safety-trust-copy { display:flex; align-items:flex-start; gap:8px; flex:1 1 180px; min-width:0; }
#details[data-mode="manage"] .safety-trust-icon { display:inline-flex; flex:none; margin-top:2px; color:var(--studio-muted); }
#details[data-mode="manage"] .safety-trust-icon svg { width:16px; height:16px; fill:currentColor; }
#details[data-mode="manage"] .safety-trust-text { display:grid; gap:1px; min-width:0; }
#details[data-mode="manage"] .safety-trust-text strong { font-size:12px; font-weight:600; color:var(--studio-ink); }
#details[data-mode="manage"] .safety-trust-text p { margin:0; font-size:11px; line-height:1.5; color:var(--studio-muted); }
.safety-boundary-dialog { box-sizing:border-box; width:min(calc(100vw - 24px), 560px); max-width:calc(100vw - 24px); max-height:calc(100dvh - 24px); margin:auto; padding:0; border:1px solid var(--studio-line); border-radius:var(--studio-dialog-radius, 10px); color:var(--studio-ink); background:var(--studio-raised); box-shadow:0 12px 32px rgb(0 0 0 / .28); font:13px/1.5 var(--font-sans, system-ui, sans-serif); overflow:hidden; }
.safety-boundary-dialog[open] { display:flex; flex-direction:column; }
.safety-boundary-dialog::backdrop { background:rgb(0 0 0 / .4); }
.safety-boundary-dialog-heading { flex:none; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:14px 16px 12px; border-bottom:1px solid var(--studio-line); background:var(--studio-raised); }
.safety-boundary-dialog-copy { display:grid; gap:2px; min-width:0; }
.safety-boundary-dialog-copy h2 { margin:0; font-size:15px; font-weight:600; line-height:1.35; color:var(--studio-ink); }
.safety-boundary-dialog-subtitle { margin:0; font-size:12px; line-height:1.45; color:var(--studio-muted); }
.safety-boundary-dialog-close { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:4px; border:0; background:transparent; color:var(--studio-muted); border-radius:6px; flex:none; }
.safety-boundary-dialog-close:hover { background:var(--studio-panel); color:var(--studio-ink); }
.safety-boundary-dialog-body { overflow:auto; overscroll-behavior:contain; min-width:0; min-height:0; padding:14px 16px 16px; background:var(--studio-panel); }
.safety-boundary-dialog .safety-cards-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap:10px; }
.safety-boundary-dialog .safety-card { display:grid; align-content:space-between; gap:10px; padding:12px; border:1px solid var(--studio-line); border-radius:7px; background:var(--studio-raised); }
.safety-boundary-dialog .safety-card-head { display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; }
.safety-boundary-dialog .safety-card-head strong { font-size:12px; font-weight:600; color:var(--studio-ink); }
.safety-boundary-dialog .safety-card-pill { font-size:10px; font-weight:600; padding:1px 6px; border-radius:999px; border:1px solid var(--studio-line); background:var(--studio-panel); color:var(--studio-muted); }
.safety-boundary-dialog .safety-card p { margin:0; font-size:11px; line-height:1.45; color:var(--studio-muted); }
#details[data-mode="manage"] .document-assessment { display:grid; gap:8px; padding:10px 12px; border:1px solid var(--studio-line); border-radius:7px; }
#details[data-mode="manage"] .document-assessment > summary { display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; font-size:12px; color:var(--studio-ink); }
#details[data-mode="manage"] .document-assessment > summary > .command-badge { justify-self:end; }
#details[data-mode="manage"] .document-assessment p { margin:0; }
#details[data-mode="manage"] .sanitized-document { min-height:0; max-height:240px; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
#details[data-mode="manage"] { padding:0; overflow:hidden; }
#details[data-mode="manage"] .run-workspace { display:flex; flex-direction:column; height:100%; max-width:none; min-height:0; }
#details[data-mode="manage"] .run-primary { flex:1; min-height:0; min-width:0; overflow:auto; padding:16px 12px; scrollbar-gutter:stable; }
#details[data-mode="manage"] .run-primary > * { max-width:960px; margin-inline:auto; }
#details[data-mode="manage"] .run-diagnostics-resizer { flex:none; height:8px; cursor:row-resize; touch-action:none; background:var(--studio-panel); position:relative; }
#details[data-mode="manage"] .run-diagnostics-resizer::after { content:""; position:absolute; width:40px; height:2px; top:3px; left:calc(50% - 20px); background:var(--studio-muted); border-radius:2px; }
#details[data-mode="manage"] .run-diagnostics-resizer:hover, #details[data-mode="manage"] .run-diagnostics-resizer:focus-visible { background:var(--studio-accent-soft); outline:2px solid var(--studio-focus); outline-offset:-2px; }
#details.resizing-diagnostics { cursor:row-resize; user-select:none; }
#details[data-mode="manage"] .run-support { display:flex; flex-direction:column; flex:none; height:var(--diagnostics-height,240px); min-height:0; min-width:0; margin:0; border-top:1px solid var(--studio-line); overflow:hidden; }
#details[data-mode="manage"] .run-tabs { flex:none; }
#details[data-mode="manage"] .run-tab-summary[data-attention="true"] { color:var(--studio-danger); font-weight:700; }
#details[data-mode="manage"] .run-tab-panels { flex:1; min-width:0; min-height:0; overflow:hidden; }
#details[data-mode="manage"] .run-tab-panel { height:100%; min-width:0; padding:16px 12px 20px; outline:none; overflow:auto; scrollbar-gutter:stable; }
#details[data-mode="manage"] .endpoint-row { border:0; border-bottom:1px solid var(--studio-line); border-radius:0; padding:10px 0; margin:0; background:transparent; }
#details[data-mode="manage"] .endpoint-row:last-child { border-bottom:0; }
#details[data-mode="manage"] .endpoint-row .runtime-source-action { grid-column:1 / -1; grid-row:auto; justify-self:start; min-height:24px; padding:0; border:0; color:var(--studio-accent); font-size:11px; font-weight:400; }
#details[data-mode="manage"] .endpoint-row code, #details[data-mode="manage"] .endpoint-row small { color:var(--studio-muted); }
#details[data-mode="manage"] .tool-status, #details[data-mode="manage"] .command-badge { width:fit-content; display:inline-flex; align-items:center; font-size:11px; font-weight:600; line-height:1.4; padding:2px 7px; border:1px solid var(--studio-line); border-radius:999px; background:var(--studio-raised); color:var(--studio-muted); }
#details[data-mode="manage"] .command-badge[data-state="succeeded"], #details[data-mode="manage"] .tool-status.ready { color:var(--studio-ok); border-color:var(--studio-ok); }
#details[data-mode="manage"] .command-badge[data-state="running"] { color:var(--studio-accent); border-color:var(--studio-accent); }
#details[data-mode="manage"] .command-badge[data-state="failed"] { color:var(--studio-danger); border-color:var(--studio-danger); }
#details[data-mode="manage"] .command-output { background:var(--studio-panel); color:var(--studio-ink); border:1px solid var(--studio-line); border-radius:7px; font:12px/1.55 var(--font-mono, ui-monospace, monospace); min-height:0; max-height:280px; padding:12px; overflow:auto; }
#details[data-mode="manage"] .live-output { min-height:100px; max-height:240px; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
#details[data-mode="manage"] .command-feed { display:grid; gap:0; max-height:360px; overflow:auto; }
#details[data-mode="manage"] .command-record { min-width:0; border:0; border-bottom:1px solid var(--studio-line); border-radius:0; padding:0; margin:0; }
#details[data-mode="manage"] .command-record > summary { display:grid; gap:5px; padding:10px 0; color:var(--studio-ink); cursor:pointer; list-style-position:inside; }
#details[data-mode="manage"] .command-record > summary:focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
#details[data-mode="manage"] .command-record-body { padding:0 0 12px 18px; }
#details[data-mode="manage"] .command-head { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; }
#details[data-mode="manage"] .command-title { font-size:12px; font-weight:600; overflow-wrap:anywhere; }
#details[data-mode="manage"] .command-kind { border-radius:4px; font-size:10px; color:var(--studio-muted); }
#details[data-mode="manage"] .command-meta { display:flex; flex-wrap:wrap; gap:8px; color:var(--studio-muted); font-size:11px; font-variant-numeric:tabular-nums; }
#details[data-mode="manage"] .command-code { min-height:0; max-height:220px; overflow:auto; resize:none; padding:8px 10px; margin:0; border:1px solid var(--studio-line); border-radius:6px; background:var(--studio-panel); color:var(--studio-ink); font:12px/1.5 var(--font-mono, ui-monospace, monospace); white-space:pre-wrap; overflow-wrap:anywhere; }
#details[data-mode="manage"] .command-error-details { margin-top:6px; }
#details[data-mode="manage"] .command-error-details > summary { cursor:pointer; font-size:11px; font-weight:600; color:var(--studio-danger); padding:2px 0; }
#details[data-mode="manage"] .command-error-output { margin-top:4px; border-color:var(--studio-danger); }
@media (max-width:820px) {
  .blocked-agent-stages { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
@media (max-width:620px) {
  #details[data-mode="manage"] .run-primary { padding:12px; }
  #details[data-mode="manage"] .run-open-app, #details[data-mode="manage"] .run-section-actions { align-items:flex-start; flex-wrap:wrap; }
  #details[data-mode="manage"] .run-tab-panel { padding-inline:4px; }
  .blocked-agent-header { flex-direction:column; }
  .blocked-agent-status { align-self:flex-start; }
}
@media (max-width:430px) {
  .blocked-agent-stages { grid-template-columns:1fr; }
}
${STUDIO_FILTERABLE_DROPDOWN_CSS}
`.replaceAll("#details", ":is(#details, #workspace-diagnostics)");

export const RUN_PANEL_CSS = STUDIO_TABS_CSS + RUN_PANEL_CONTENT_CSS + AGENT_STATUS_CSS;
