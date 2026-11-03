# GitHub app theme integration

The host owns colors, typography and resolved light/dark appearance. The
`github-app` profile supplies structure, not a replacement color theme.
Load toolkit styles, component styles and the selected profile in that order.

```html
<link rel="stylesheet" href="./canvas-ui/styles.css">
<link rel="stylesheet" href="./canvas-ui/base.css">
<link rel="stylesheet" href="./canvas-ui/profiles/github-app.css">
<body class="canvas-ui canvas-profile-github-app">
```

The public `ui/visual-profiles` registry exposes `GITHUB_APP_VISUAL_PROFILE`
and `getCanvasVisualProfile("github-app")`, including the class, stylesheet,
design-guide and theme-guide routes. Resolve these relative to the canvas
server's base URL. `prepareCanvasUiAssets` includes the registry, profile and
guides in the same standalone asset inventory.

## Ownership

Use delivered semantic tokens through the toolkit's `--canvas-*` aliases.
Do not declare host-owned values such as `--text-color-default` or
`--background-color-default` on a canvas ancestor: those declarations can
shadow later host delivery. Do not import a full Primer color theme over the
host, infer host identity from a theme attribute, or force the host's tone.

Toolkit styles prefer valid `data-theme-tone` for resolved tone and use valid
`data-color-mode` as a compatibility fallback. Before delivery, standalone
light/dark fallbacks are useful but do not prove the host theme was received.
Font-stack tokens do not install font files or guarantee identical app scaling.

CSS consumers update through the cascade. Charts or other non-DOM renderers
can use `readCanvasTheme` and `observeCanvasTheme` from `ui/theme` to read
resolved local values and observe late delivery without remounting UI.

## Delivery checks

Host appearance may arrive after the initial document script and change while
the canvas is open. Verify computed colors, typography and control states
after load and after a live change, not merely the existence of token names
or a plausible dark fallback.

Check production CSP admission. A host that inserts ordinary non-nonced style
elements needs a compatible style policy; giving synthetic test styles a
nonce does not prove that delivery path works. Preserve script and network
protections, and inspect CSP violations rather than silently overriding colors
when host CSS is blocked.

Record the actual host build and packaged canvas identity for native visual
acceptance. A successful open/action RPC, a standalone screenshot or synthetic
token precedence is not evidence of actual host paint.

Other hosts require independently verified token delivery, capabilities and
design guidance. A standalone appearance setting must not override host-owned
appearance in an embedded GitHub app canvas.
