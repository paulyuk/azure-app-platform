# Unity Studio presentation integration

The shared toolkit owns host profiles, structural values, design guidance and
theme-delivery contracts. See its shipped
[design guide](../vendor/toolkit/ui/hosts/github-app/design.md) and
[theming guide](../vendor/toolkit/ui/hosts/github-app/theming.md).
Unity consumes that contract; this document records only Unity's integration
and product exceptions.

## Selection and ownership

Unity workflows and component owners remain host-neutral. Its Copilot extension
explicitly selects `presentationProfile: "github-app"` when opening the canvas.
The public input also accepts `standalone` for an explicitly requested fallback
preview. Direct renderer callers default to standalone and must pass their
integration deliberately. Neither theme attributes, palette values nor OS
preferences select a host.

Selection is retained by the canvas instance server and reaches both Home and
App Map rendering, including internal navigation. Reopening an instance with a
different explicit selection replaces its server. Unknown selections fail;
profile identity is not saved with Appearance.

`studio-presentation.mjs` adapts shared semantic/structural tokens into Unity's
legacy `--studio-*` variables and product-owned layout. It must not duplicate
the shared host profile or restyle private toolkit classes. Real Button and
MessageBar roots retain their existing shared owners and lifecycle behavior.

Retained App Map HTML and SVG read compatibility aliases such as `--surface`,
`--text` and `--accent` from the Studio document root. These map only to
`--studio-*` tokens: delivered host colors flow through the canonical toolkit
mapping, while standalone uses its existing palette. They do not define host
tokens or override canonical `--canvas-*` values.

The renderer gets the selected descriptor from the shipped public toolkit
registry. It loads `styles.css`, `base.css`, then the descriptor's stylesheet and
applies its class alongside Unity's host-neutral adapter class. Shared guides,
registry and stylesheet are retained with the source-pinned toolkit assets;
there is no runtime fetch or separate package installation.

## Unity-specific behavior and exceptions

| Surface | Integration or retained behavior |
| --- | --- |
| Copilot appearance | Host colors/fonts win; no legacy body aliases shadow delivered tokens |
| Saved Appearance setting | Existing light/dark preference remains fallback-only in Copilot; Settings explains that ownership |
| Standalone | Retains the existing saved light/dark palette and native layout; not a new external-host adapter |
| Home/setup/review | Public CanvasHeader owns compact branding and existing utility actions; Simple home composes public toolkit components, and product cards/fields map to the shared structural profile without changing journeys, copy or ordering |
| Customize and Run | Product file/agent cards and fields map to shared tokens; focus and drafts remain owned by existing workflows |
| Settings/confirmation | Retain native dialogs and focus behavior; map geometry to the shared dialog role |
| Navigation and App Map | No information-architecture, map arrangement, Guide placement or breakpoint redesign |
| Status badges, graph glyphs and code | Retain role-appropriate shapes and source typography |
| Cinematic intro | Retains its intentionally black presentation and existing Skip behavior |
| Destructive and header runtime actions | Remain native pending the separate toolkit danger-appearance decision |

No separate font bundle, Aptos preference, CoreAI Azure stylesheet or full
Primer color theme is introduced. CLI, VS Code, Super App and other host
integrations are not implemented by this selection mechanism.

Acceptance covers an extensible shared profile contract and tested
presentation switching on real mounted components. A synthetic alternate
profile demonstrates that boundary without claiming a native Claude or VS Code
integration. Integration selection remains distinct from live light/dark changes
and does not introduce an end-user profile picker.

## Delivery and evidence boundary

Unity's current HTTP server has no Content-Security-Policy header or meta
policy. The toolkit's documented host style-element delivery can apply, but
actual native delivery still requires computed values from the real canvas.
Preserve existing authentication, Host/Origin checks and escaped output if
changing the response policy; see the toolkit's theming contract before adding
nonce-only CSS restrictions.

`studio-presentation.browser.test.mjs` uses an isolated shipped payload and
synthetic host data at narrow/wide sizes. It covers late palette/font updates,
conflicting/invalid tone attributes, fallback preference updates, mounted
identity, focus and Run drafts. `build-preview-layout.browser.test.mjs` covers
both selections in the full renderer with Chromium/WebKit classic scrollbars.
`plugin-portability.test.mjs` checks actual provider opening and selection
without checkout dependencies.
`app-map-theme.browser.test.mjs` checks the real Observe SVG's fills, text,
strokes, arrowheads and late palette changes in both presentations with
Chromium/WebKit at compact and wide sizes.

These are source/payload checks, not native Copilot delivery or
assistive-technology announcement evidence. No providers or user panels are
reloaded by this work.
