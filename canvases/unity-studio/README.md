# Unity Studio

Opening the canvas plays the bundled, muted 12-second Unity logo animation.
The intro always uses a black background, independent of the saved appearance,
with only a small floating **Skip** button and no footer. Skip is available
immediately; Escape also skips it. Finishing or skipping the intro reveals the
start page in the user's selected light or dark theme without changing the saved
preference, using the same transparent Unity symbol as the workspace header
and the **Unity — The self-aware app platform** branding. Returning Home or
reloading the page does not replay the intro; opening the canvas again does.
Reduced-motion preferences bypass playback. If autoplay is blocked or the video
fails or stalls, Studio opens the start page with an explanatory notice.
The PNG and MP4 ship with the plugin and are served locally, with no CDN,
Downloads-folder dependency, or additional install step.

The start page shows the large Unity logo and tagline only; the compact header
branding appears on inner screens instead. Docs and the Settings gear remain
available at the top right on every screen.

## Shared toolkit browser assets

The review page's **No Azure resources will be created or changed.** notice uses
the canonical toolkit informational MessageBar, including its icon, border and
status semantics. Its text, placement, visibility and workflow are unchanged.
The chosen design is the toolkit's layout and informational icon (16px padding,
6px radius), mapped to Copilot's delivered semantic tokens, rather than a
compatibility variant of the old Unity notice. No internal icon hiding or
Unity-specific MessageBar restyling is applied.
The toolkit's unmodified `styles.css` maps the current host's delivered semantic tokens to
`--canvas-*` aliases; `base.css` uses those aliases for MessageBar. For example,
`--text-color-default` supplies `--canvas-fg`, `--border-color-default` supplies
`--canvas-border`, and `--background-color-muted` supplies `--canvas-tint`.
The existing Studio Appearance preference sets the fallback light/dark tone;
it does not replace supplied host colors with Studio's palette. Legacy Studio
aliases stay on `body` so they do not overwrite host tokens on `:root`.
There is no second appearance selector. React owns only the notice's mount
container, with updates on the same root and disposal before navigation replaces
the page. Unchanged updates do not re-announce the notice.

`createStudioNotices` is the one shared notice helper. Its `renderNotice(element,
props)` keeps a canonical MessageBar root keyed by the mount element, merges the
latest props, and forwards callbacks through stable handlers so callback-only
refreshes do not re-render or lose focus. `clearNotice(element)` cancels pending
work and disposes that root; the same element can safely be reused. `dispose()`
clears all owned roots before legacy DOM replacement. The first review notice
uses this helper; no other notices are migrated here.

Ordinary actions use the same pinned toolkit's actual Base UI-backed **Button**,
through its public DOM mount API. Primary, secondary and subtle appearances use
canonical toolkit geometry and host-delivered button tokens, not Unity's purple
palette. Medium buttons use the toolkit's 32px minimum height, 14px/20px normal
type and 5px/12px padding by default; this intentionally replaces the legacy
12px semibold action styling. Existing action copy, order, enabled state and
workflow ownership remain unchanged. Existing SVG glyphs are composed through
the public `icon` prop; Button supplies no default icon. Legacy CSS is in a
lower-priority cascade layer so it cannot override canonical component styles.
Mount/provider wrappers use `display: contents` only to retain existing layout
placement.

| Surface | Button adoption |
| --- | --- |
| Create/assemble setup, review, back/continue and local-path actions | Migrated |
| Existing app screen | Back and confirmation-cancel actions migrated; compound app rows and destructive actions retained |
| Post-creation actions | Gateway, deployment, runtime, endpoints, source, agent invocation and map actions migrated |
| Build | Refresh/retry, Files/editor handoff, model connection, help and document testing migrated |
| Run/Debug and Guide | Ordinary lifecycle/setup, endpoint/source, connection review, capability, invocation, document and port actions migrated |
| Observe | Map reset/zoom/fit, inspector close and Guide collapse/dismiss actions migrated |
| Logs | All-services action, pause/resume and refresh migrated, including the component-log panel |
| Shared Settings | Open/close and ordinary app-section actions migrated |

This is not a migration of every element with a button tag. Semantic tabs,
workspace navigation, Build implementation selection, journey/app cards, the
two-line model-connection control, Guide progress/status shortcuts, inline log
service filters, SVG graph controls, links and the cinematic intro's Skip action
remain their existing controls. They need their appropriate component slices,
not conversion to generic Button. The separate `src/web` demo and generated
application templates are outside this migration.

The approved pin has no destructive/danger Button appearance. Delete controls
and the header's stateful runtime action (which uses danger styling when
stopping) therefore retain their original implementation and warning hierarchy.
They require a toolkit-owned public appearance or an explicit design decision;
this consumer does not approximate danger with private classes or token overrides.

The approved upstream fix resolves primary Button fallback contrast through public
`--canvas-button-primary-bg` / `--canvas-button-primary-fg` tokens. Without host
button tokens, light uses `#0969da` with white text (5.19:1), and dark uses
`#79b8ff` with `#0d1117` text (9.11:1), including hover/pressed states. Delivered
host primary tokens retain priority, and missing hover backgrounds retain the
resolved rest background. Text-accent does not control primary backgrounds.
The primary migration is no longer blocked on fallback contrast; no Unity-only
fallback bridge or private CSS override is used. Synthetic host-token checks do
not prove native delivery.

`createStudioButtons` is one shared button owner per page, independent of the
unchanged notice owner. `renderButton`/`update` retain roots and latest callbacks;
`clear`/`dispose` unmount before DOM replacement. Imperative actions append the
owned mount through `append`/`host`, not by moving a React-owned button out of
its root. Disabled and label updates go through the component. Settings,
Build, Run and log teardown release their owned subtrees before replacing them.
Back/forward-cache suspension retains roots; final page departure disposes them.
Startup waits for the shipped module before wiring actions, ignores a late load
after departure, and reports a load failure with a reload-to-retry message rather
than silently falling back to bespoke controls. Embedded synthetic previews can
wait for `window.unityStudioReady` or the `unity-studio-ready` event.

The pinned toolkit recognizes the current Copilot-style semantic names above;
it does not include a `--vscode-*` adapter. Other hosts need a toolkit-owned
mapping into that contract. This change does not add another host adapter or
claim that a synthetic browser fixture proves native host token delivery.

The standalone plugin ships the prepared React/Base UI browser runtime, shared
React chunk, CSS, upstream MIT license and complete bundled dependency notices
under `vendor/toolkit/`. Nothing is downloaded or restored when the plugin opens.
Only six explicitly allowed `/canvas-ui/` assets are served, relative to the
installed plugin, never the user's workspace or a sibling checkout.

This is **source-pinned build-time consumption**, not an npm publication:
`@microsoft/canvas-toolkit` identifies itself as private version `0.1.0` at
[`7f3fb1ee46a3ac17ceca2a40470a30666412ee17`](https://github.com/coreai-microsoft/canvases-cloud-foundation/commit/7f3fb1ee46a3ac17ceca2a40470a30666412ee17).
This is the explicitly approved, pushed **unmerged upstream fix artifact**, not a
released package or a claim that the upstream branch has merged.
`vendor/toolkit/provenance.json` records that source, the upstream lockfile and
builder hashes, toolchain, and every shipped asset's SHA-256.
The source archive/preparation path retains LF CSS: `styles.css` hashes to
`f4188ad417039a227b67e7787ed127cf90154f02ddc08d4784bb44d9c3afc534` and
`base.css` to `8f2df18a26a7b347abe3be5735727334bb74236d903abff140d738beb631dec8`.
The upstream Windows-checkout evidence's `c8aaf1f1...` / `15a5350a...` hashes
identify exactly the CRLF equivalents, not these retained bytes. Regeneration
and an independent check compare the archive-produced bytes without newline
rewriting. JavaScript chunks, license and dependency notices are unchanged.
The vendor directory disables Git text conversion so these exact bytes and
hashes survive Windows checkouts with `core.autocrlf` enabled.

Maintainers need Node.js (the recorded build uses 24.22.1), npm, `tar`, and an
authenticated `gh` with read access to that repository. These commands work
unchanged in PowerShell and macOS/Linux shells, from the repository root:

```shell
npm run vendor:toolkit --prefix canvases/unity-studio
npm run check:toolkit --prefix canvases/unity-studio
```

The generator downloads only the exact pinned source into a temporary directory,
restores its lockfile with scripts disabled, invokes the existing upstream
`buildToolkitUi` and `prepareCanvasUiAssets` helpers, and selects the required
browser assets without reimplementing bundling. It compares two builds within
that restored source/toolchain before writing output. `check:toolkit` repeats the
clean-source preparation and compares all checked-in bytes and hashes. Matching
bytes prove the runs checked, not determinism across arbitrary toolchains.
No sibling checkout, publication, customer bootstrap, or toolkit runtime package
dependency is introduced.

## Studio journeys

The workspace uses one compact top bar for the Unity logo/home navigation,
app name, runtime status and start/stop, workspace buttons, **Docs**, and the
Settings gear. Docs and Settings remain at the top right at every width.
At narrower widths, all three workspace buttons move together to a second row;
on the smallest canvases, app identity and runtime controls occupy a third row.
Long app names truncate rather than displacing controls. Studio defaults to light; the saved appearance applies
to the landing page and all workspaces, including after a provider restart.
This user-level preference lives under
`$COPILOT_HOME/extensions/unity-studio/artifacts/preferences.json`
(`~/.copilot` when `COPILOT_HOME` is unset), not in app source.

Unity Studio is the guided app builder for the generic nine-tier Unity platform
pattern. Its landing page keeps three equally styled, neutral journey cards visible:

1. **Create a new app** — choose the editable **Empty Unity app**, the headless
   **Sandbox & Gateway (Minimal)** template, or the complete **Dealer sample**,
   customize the supported inputs, review the deterministic materialization
   plan, and create the app in an isolated worktree.
2. **Open an app** — rediscover apps persisted as repository/worktree
   pairs, then open their workspace to build, run, inspect request flow and implementation inventory,
   source, runtime, or specialist studios. This is the local persistence
   mechanism until Unity apps register with a control plane.
3. **Assemble existing pieces** — explicitly map capabilities to source projects
   and, optionally, compatible Azure resources.

The canvas does not scan on launch. Source and Azure discovery happen only when
the selected journey needs them. Workspace requests preload relevant specialist
studios and may open the resulting worktree in the user's selected code editor.

After creation or selection, the app workspace becomes the primary interface.
The Unity logo and **Unity Studio** text link home; there is no separate Home button.
An optional editor launch failure does not roll back the new worktree; the workspace
opens with a clear warning so the user can continue.
The main page navigation is **Build → Run & Debug → Observe**: one rounded,
segmented strip with a filled, outlined selection marking the current page. This navigation
is separated from the outlined **Set up** or runtime action; compact canvases put it
on its own row below app identity. Build opens first. Observe contains **App Map** and
**Logs** views and remembers the last one used during the current visit.
Build starts directly with customization areas and one focused preview, without a duplicate
Build/Run/Map toolbar. Use the top-level **Run & Debug** or **Observe → App Map**
navigation. The Guide's Build action opens the general map with a dismissible
hint highlighting the existing add-component and connection controls; it does
not select a component based on the current file. Connect retains its source
review and offers **Edit connections on App Map**. These entry points do not
change files or start the app.
Every workspace remains accessible regardless of readiness: this is not a
locked wizard. The two Observe views use a compact tab row with
map/log line icons and the same flat Run-style tabs used by Build: a shared baseline,
subtle selected fill, and accent underline rather than individually outlined buttons.
Keyboard tab navigation remains available across all three pages.
Each view fills the workspace rather than sharing it
with an always-visible map. Guide owns workflow progress and the next useful
action, independently of the active workspace. Its inline toggle collapses the panel
to a 46px status rail at the far right instead of disappearing.
The toggle stays at the same top-right position in both states, including
when the expanded Guide overlays a narrow workspace.
The rail retains Build, Connect, Run, and Observe icons with checkmarks,
attention indicators, and descriptive tooltips. Selecting an icon expands
Guide at that stage's explanation without changing workspaces.
There is no separate Guide button in the top navigation;
switching views never reopens Guide or discards message drafts or the selected Build preview.
Guide visibility is remembered per app in the current browser origin.
On narrow screens it starts collapsed and opens as a dismissible overlay.
A persistent badge beside the app name distinguishes
**Not running**, **Local preview**, **Running locally**, and active lifecycle
transitions; selecting it opens the local runtime controls. A neighboring
contextual action starts the app or preview, stops a running app, or opens
required setup. Each request-flow stage exposes a
contextual **Add component** action. Adjacent request-flow stages expose
**Connect** actions that list discovered relationships, require source and
destination selection, and review the source-backed change before delegating
implementation to the app session. Compact tier illustrations on each component
card make the architecture easier to scan without replacing source-derived names,
badges, or status. Guide stays focused on progress and one required action at a
time.
Additional recommendations are collapsed. **Observe → App Map** has one request-flow
map. Once the app is running, Guide marks Run complete and makes
**Observe & manage** current. **Open App Map** is offered from the other main
workspaces, not when the map or its inspector is already visible. Clicking
**Connect** opens a read-only connection review in the bottom inspector, with
source locations, possible destinations, and actions to inspect affected
components or resolve missing connections.
Uncertain source connections remain review items, not a gate on observing a
live app. Starting, stopping, failures, and previews retain explicit runtime
context; this does not claim full telemetry coverage or a successful agent test.
**Show other resources** reveals disconnected resources in a separate region
of that same map; it starts off and is remembered
per app in the current browser origin. This is a source-derived distinction,
not a claim that those resources are unused in production. Stopped services stay
on discovered request paths, and documentation-only links retain their uncertainty.
Workflow operations and events are grouped under their source-backed owning
workflow. **Show internal items** expands them into a separate, named region;
collapse returns to the overview. Cross-boundary calls connect to the workflow
while collapsed, with duplicate connections grouped without losing their source
evidence. Containment is conveyed by the group, not a fan of redundant arrows.
Search also matches collapsed internal items through their owner. Ambiguous
ownership stays ungrouped rather than assigning an operation speculatively.
Map controls float at the top right of the map rather than occupying
another header row or competing with the bottom inspector.
The compact palette exposes zoom and **Fit map**; **Search & layout** opens
downward with search, component/request-path filters, **Show other resources**,
and reset.
Wheel and trackpad gestures
zoom smoothly anywhere over the map surface. **Run/Debug** focuses on trying the
app: contextual startup or recovery guidance, an available web-app link, the
agent message, and a readable response. A single **Output**, **Services**,
**Operations**, **Deploy** tab row sits below this primary area, showing one
supporting panel at a time. Output is first and selected by default, so command
stdout/stderr is visible beneath the tester. **Open all logs** hands off to Observe.
Services retains readiness, endpoint actions, and native source links; Operations
separates recorded command/activity history from output. Error/failure indicators
remain visible on inactive tabs. Explicit tab choices, input drafts, focus, and
output scroll state survive refreshes, workspace switches, and lifecycle changes;
starting or failing an operation does not force the user back to Output.
There is no additional workspace
navigation, custom debugger, or resizable diagnostics dock.

The **Settings** gear opens a compact modal without leaving the current
workspace. Appearance and **Preferred external editor** are Studio-wide
preferences; VS Code is the default editor, while explicit saved choices are
retained. **Model connection**,
**Local ports**, and **Danger zone** apply to the named app. The model summary,
setup blockers, and service port action open the relevant settings directly.
Closing Settings or pressing Escape returns focus without discarding app input.
Build's **Model connection** action opens the same settings in place, preserving
the read-only preview; Run's **Review key files** action returns to Build rather
than introducing another editor or navigation bar.
Delete local app remains a reviewed, stopped-app operation: it removes the local
worktree/files and Unity-created branch, not Azure resources or source repositories.
Landing-page Settings exposes appearance and the preferred external editor. Studio preferences are separate
from app source and runtime configuration.

Map inspection opens a separate resizable
bottom details panel, keeping the map's full width beside Guide. Drag the
horizontal divider or use its Up/Down keys to resize it; **Close details** or
Escape dismisses it without changing Guide. The inspector's height is
remembered and bounded to leave the map visible, including in compact panes.
New inspector content starts at the top. Opening, closing, or resizing the
inspector does not pan or zoom the map; use the map controls to adjust the view.
**Invoke agent** stays in the main run area; stdout/stderr and component details
are available through the Output and Services tabs.
**Observe → Logs** is a dedicated view for all captured local service output, including
registered supporting services such as Azurite. Runtime component cards and their
inspectors open the same workspace with that service selected. Service and stream
filters, text search, **Pause**, **Resume**, and **Refresh** narrow a bounded recent
tail. All services share one console-style text stream, with a muted
`[service/stdout]` or `[service/stderr]` prefix before each line instead of table rows
and separators. Long messages wrap naturally without fixed row heights. Use **Services** to check
one or more sources; every selected service stays in the same viewer, not a separate
container. Select a row's service label to focus on that source; choose **All services**
to clear the filter. Up to 24 services can be explicitly selected, under the same
aggregate response limits. The toolbar stays in place while the log viewer scrolls;
there are no per-service scrollbars or additional page scrolling. Original order within
each stream and any source timestamps are preserved, not merged into a fabricated
global timeline. Unchanged refreshes retain text selection and scroll position.
Automatic reads stop when paused or when you leave Logs.
**Capture details** groups missing output and source notices in a compact disclosure;
read-error and no-output counts remain visible while collapsed. Truncation is explicit. Lifecycle
command history remains in Run/Debug; Logs does not substitute command output
for missing service logs or fetch cloud logs.
Reads are bounded to 24 services, 1,200 lines, and 256 KiB across the response,
with at most 80 catalog entries; clipping is disclosed in the view.
Build, Run, Logs, and inspector actions share compact 32px controls with the same
typography, padding, and corner radius. Inspector actions form a wrapping row
below the source path; Logs uses the same field sizing, heading hierarchy,
muted metadata, and theme tokens as the other workspaces, without per-service output panels.
New Minimal, Empty, and Dealer apps automatically receive available ports during
creation, before the child session or code editor opens. The allocator excludes live
listeners and saved assignments in sibling worktrees, then persists the new app's
`.unity-studio/ports.env`. It does not stop or reassign existing apps.

**Settings → Local ports** provides **Pick available ports** while the app is stopped.
It checks live IPv4/IPv6 listeners and other discovered apps' assignments, then
saves `.unity-studio/ports.env`. Run, readiness, endpoint links, and both
POSIX/PowerShell startup scripts use those same assignments. This is supported
by the Empty Unity app, Sandbox & Gateway template, and materialized Dealer
sample; older or custom scripts must implement the port-loading contract first.
Ports are not permanently reserved: startup still checks for conflicts.
**Stop apps using these ports** reviews listener PIDs, executables, and ports
before **Confirm stop**. Only the selected app's port owners and their children
are targeted, including known launchers from other workspaces. This is not a
machine-wide stop command. Reviews expire after one minute and reject changed
process identities; Studio and its host ancestors are protected. The operation
verifies that ports remain free and reports permission errors or respawning apps.
The outlined **Connection settings** button shows the current model/gateway and
opens **Settings → Model connection**. Before a gateway is configured it reads
**Connect AI Gateway**, with **No AI Gateway connected** beneath it. A local
web preview remains available when the app supports it; agent invocation stays
disabled until its endpoint is ready. If gateway discovery finds none, Settings
offers **Create or manage gateways** rather than an empty apply action. Run/Debug uses
Studio-owned theme tokens, compact controls, quiet section dividers, and themed
code blocks. Styles are isolated from the App Map.
The **Operations** tab shows actual Azure discovery, lifecycle shell commands, and agent
HTTP calls with running/succeeded/failed status and elapsed time. Its latest 60
records survive a canvas reload; credentials are redacted before storage and
agent message bodies are excluded. There is no separate command-example or
troubleshooting card. The agent's
readable answer and raw response are separate. **Services** contains the
source-discovered implementations; **Tool activity** beneath the response
contains only calls reported in the last response. A reported call alone is not
proof of successful execution.
**Home** returns to the landing screen. The active main view is highlighted
independently from Guide visibility; Search & layout does not change that view.
**Open app** lists the most recently opened apps first and shows their last-opened
date and time in the browser's local timezone. Opening an App Map records its
timestamp in `.unity-studio/last-opened.json`, separately from app identity and
runtime settings. Apps without recorded history appear last, labeled Not recorded;
inventory and readiness polling do not change the timestamp.
Missing tiers are scaffoldable rather than inferred from the platform catalog.

**Build** selects artifacts from the app's own source and `unity.app.yaml` scope,
not one universal template checklist. It is a focused workspace for changing your
app, not a file explorer, embedded IDE, or vertical catalog. Compact **Behavior**,
**Tools**, **Runtime**, and **Policies** tabs appear only when backed by available
source. Only the selected area is visible, with a short explanation of what you
can change. The first available area is selected initially. Arrow keys, Home, and
End move between tabs; Tab continues into the selected panel. Build, Run, and
Observe use the same compact Studio tab treatment: purpose-specific line icons,
rounded outlines on every tab, an accent border and fill for the selected tab,
and clear hover/focus styling. There is no shared underline or trailing baseline.
Where Tools has several source projects, a native **Tool** dropdown selects one
by name, retaining a fixed footprint even with a large catalog. Other areas use
compact named choices when needed. Tools shows only the selected tool's implementation,
configuration, and contract rows, not every tool and file at once. Duplicate
names include their project path as a qualifier. Area and project selections
survive refreshes and workspace switches. Semantic labels lead, with actual
file paths as secondary references. There is no sidebar, selected-file state,
resizable split, or collapsed file rail.

Dealer exposes its inline instructions in `src/agent/main.py`, actual Hosted
Skills, and app settings. Empty Unity exposes its prompt, declared skill, and
runtime configuration, not its HTTP-server boilerplate. Inline instructions stay
in the original source file; a recognized declaration supplies the initial preview
position. Web implementation files, package manifests, container build files, and
other general source remain outside this focused UI. The existing scoped catalog
and read/open authorization remain scoped. Custom component paths reuse App
Map discovery. Unsupported areas are omitted, not shown as missing features.
An app with no supported customization points gets an explicit explanation and
an **Open in &lt;editor&gt;** workspace handoff.
Each file has its own bordered, subtly shaded container grouping its heading,
path, edit actions, and **Preview source**, open by default for the selected project.
Users can collapse individual previews; those choices survive refreshes and
switching areas/projects. Source is created only for visited content, and its
height is bounded so it does not take over the workspace.
The read-only preview highlights source using its filename: Python, JavaScript/TypeScript
(including JSX/TSX), JSON, YAML, Markdown, Dockerfiles, and other supported source
languages. Unknown extensions stay plain text. Highlighting follows the Studio
theme and keeps native text selection and copying. A noninteractive 1-based
line-number gutter includes the final blank line when the source ends with a
newline. Long lines scroll horizontally inside the preview without moving the
gutter or widening the Build pane; high-contrast mode uses readable plain text.
A tokenizer failure reports the problem and keeps plain-text preview available.
The same reading order works in compact and wide panes. Container-aware spacing
and wrapping keep actions and paths within the available canvas width.

**Edit in Files** is the primary action. It opens the selected, saved source
file in the app's native Files canvas in the current session, not a scratch
buffer or copied artifact. The server resolves the artifact through the
allowlisted catalog and passes its path relative to the session worktree to the
host's repository-scoped editor canvas. Nested app roots retain their complete
worktree-relative path. Files outside that worktree cannot use this handoff;
Studio reports the limitation and the external-editor action remains available.
Missing host support or a failed handoff produces a visible error, not a
fallback to an unrelated file or editor.

The secondary **Open in &lt;editor&gt;** action opens the app worktree and
chosen file in VS Code or the saved preferred editor. The **Preferred external
editor** picker lives in shared **Settings**, rather than taking space on Build.
It retains native keyboard
navigation and a visible focus outline. A **Code editor** field is also available
when reviewing a new app. Supported choices are **VS Code**,
**VS Code Insiders**, **Cursor**, **Windsurf**, **Zed**, or **Sublime Text**.
The preference is saved per user in `editor-preferences.json`, independently of
appearance settings, and is shared by Build, App Map source actions, and app
creation. Custom executable paths and commands are not supported.
The chosen editor must already be installed, with its CLI available where
required; Studio reports launch failures rather than opening another editor.
Changes in Settings update Build and app-creation actions together. External
launches are disabled while the preference is loading/saving; failed saves retain
the confirmed editor and surface an error. A small **About Build** info button
beside the page heading replaces the former footer explanation. Its tooltip is
available on hover, keyboard focus, or click, and dismisses with Escape.
Save changes in Files or the external editor, then return to Build. Focus and
visibility changes refresh saved source, as does re-entering Build.
**Refresh source** provides an explicit retry or refresh without leaving the
page. Area/project selection, preview expansion, keyboard focus, and page/preview scroll positions
are retained in the panel. Unchanged refreshes preserve the preview DOM and text
selection. Late refresh responses cannot replace another workspace or overwrite
newer results. Handoff feedback belongs to its own customization row, even when
different files open out of order. Refresh failures retain the previous guide
and show an error.

Build does not edit files, hold unsaved source drafts, or implement review/save
controls. Its former diff and source-write endpoints are removed. Native Files
and external editors own editing and saving; their changes do not pass through
the former Build stopped-app save gate. Restart the app or rebuild deployed
images when needed for saved runtime/code changes. No crash-recovery guarantee
is made by this preview.

Syntax highlighting ships as a licensed bundle in
`vendor/prism.mjs`; the preview needs no editor runtime. Installing or enabling the
plugin never runs `npm install`, restores dependencies, or fetches browser code
from a CDN. To update highlighting, maintainers change the pinned Prism
development dependency and lockfile, then regenerate and commit the shipped
files. These maintainer commands work in PowerShell and
macOS/Linux shells:

```shell
npm ci --prefix canvases/unity-studio
npm run vendor:syntax --prefix canvases/unity-studio
```

**Known discovery limitation (for design discussion):** this is best-effort
recognition, not a universal file catalog or language-aware parser. Component
directories can be arbitrary when mapped in `unity.app.yaml`, but Build selects
known per-tier filenames and source files matched by existing framework/code
patterns. A manifest path alone does not enumerate every file or identify its
role. Unfamiliar frameworks, filenames, external prompt/configuration storage,
or dynamically loaded implementations can be missed. Scans are also bounded
and skip dependencies, generated output, known `.env`/`local.settings.json`
files, and test files.
The document-processing profile still recognizes its specific canonical and
legacy layouts. "Not discovered" must not be interpreted as "not implemented."

**Discussion with Paul:** should an app explicitly declare Build artifacts
(path, role, component), with discovery used only as a
fallback? That would make custom-app coverage deterministic while preserving
app-root read/open authorization. This explicit-artifact
contract is a proposed direction, not an implemented capability.

Generated browser snapshots, Playwright reports, test results, and local runtime
state are excluded from source discovery. Captured UI text must not create
phantom components or make a real connection appear ambiguous. The map is
source-derived and remains connected when the app is stopped.

Preview geometry coverage uses the full workspace renderer in Chromium and
WebKit, including classic scrollbars and compact resizing. With `src/web`
dependencies installed, prepare both browser engines using:

```shell
cd src/web
npx playwright install chromium webkit
```

Run `npm test --prefix canvases/unity-studio` from the repository root.
The preview-layout test explicitly reports missing browser engines as skipped.

The document-processing app retains its instruction, validation-tool, contract,
policy, and runtime cards, including the legacy tool layout. Only this app
profile gets document-test actions and the ACA sandbox runtime selector.
Genuinely missing expected files are labeled as missing files, not as proof that
a capability is unimplemented. An unrelated `config/runtime.json` does not enable
document input or block deployment of Dealer, Empty, or custom apps.

For document-processing apps, the document contract and operator-owned policy are editable by the developer,
not the runtime model. JSON syntax is checked when saving from the canvas;
Python runtime validation remains authoritative.
The running agent must not receive a tool for changing either policy or tool
code. Developer changes require source review, enforcement tests, and rebuilding
cloud images; agent instructions are not an enforcement mechanism.
`src/policy/enforcement.py` loads policy JSON through Python's `json` module
and applies mandatory checks. The document validation tool reads contract limits and
extensions and validates requests explicitly; the agent harness independently validates
results. The contract's `$defs` describe schemas but are not automatically
executed by a JSON Schema validation library. Changing a schema definition alone
does not rewrite the corresponding Python validation.
**Test enforcement** sends a text/Markdown document to the tool-only endpoint
without calling a model. Both it and **Invoke agent** use the message and optional
document together in **Run/Debug**. Choose a `.txt`/`.md` file up to 64 KiB,
paste text, or remove the document to send only a message. Invalid files and
oversized UTF-8 text are reported before sending; there is no PDF/Word extraction.
Document input appears only for document-capable agents. Drafts survive readiness
polling and switching between Build and Run in the same panel, but are not saved
to disk. Build's **Test with a document** links directly to this shared Run input.
These HTTP operations appear in Commands without document payloads.
Local processing is explicitly a subprocess simulation, not an isolation
boundary. The optional Copilot SDK runtime selects a separate ACA agent sandbox
and document sandbox; selecting it does not prove cloud deployment or isolation.
Whole-app `azd` actions are blocked for this document POC to prevent inherited
Dealer deployment manifests from provisioning unrelated services.

**Components & endpoints** also lists source-discovered runtime projects with no
declared endpoint as **Source only**, with **Review source**. They are not counted
as required services or presented as running. Run's source actions open a recognized
file from that project in the native **Files** canvas, preferring implementation
code over configuration. They retain app/worktree boundaries and report unavailable
source or host support without launching a local IDE. Build still offers its explicit
external-editor option. A root `unity.app.yaml` scopes the
App Map, tools, and component inventory to its declared capability paths. Older
apps may still contain inherited Dealer files, but those files are neither shown
as app components nor deleted. Adding a capability must update the manifest.
Repositories without a root inventory retain broad source discovery.

Model connection discovers the saved/current Azure subscription and gateway
models across providers, not a hardcoded provider called `foundry`. New
connections skip empty gateways when choosing a default. Existing bindings are
preserved, while an empty gateway explains how to select another or create a
model in AI Gateway Studio. The selected model is passed to both POSIX and
PowerShell configuration scripts before they validate a Responses call.
Subscription, gateway, and model selections remain visible until validation
succeeds, then collapse into the active model/gateway summary. Refresh preserves
valid choices, coalesces duplicate requests, and rejects stale discovery results.
Configuration failures remain visible instead of leaving a busy indicator.

These interaction patterns are grounded in
[Functions Hosted Skills Studio](https://github.com/coreai-microsoft/canvases-cloud-foundation/tree/28664edc74095bfadbb7ffb751844d2febf688b1/canvases/intelligent-function-app-studio):
generation-guarded Azure selection, actual command activity, and a readable
agent digest. Unity keeps its own app orchestration and source-based tool evidence.

The App Map exposes deterministic lifecycle actions: **Run locally** and **Stop
local app** invoke the checked-in `dev-start`/`dev-stop` shell scripts
(or their `.ps1` equivalents on Windows), while **Provision
with azd** and **Deploy with azd up** run the corresponding commands in the app
worktree. Cloud actions are explicit and mutate Azure; review the selected
subscription and `azure.yaml` before using them.

Each created app persists a runtime profile in `.unity-studio/app.json`.
The profile defines the exact start arguments, expected entrypoints, and all
reserved ports. This lets an empty app run without cloud credentials and lets
the Dealer sample use a credential-free preview without mistaking another
worktree's listeners for its own services.

## First-class templates

For the Minimal template's complete file tree, token conventions, and generation
contract, see the [maintainer guide](MINIMAL-TEMPLATE.md).

For a finished output to compare with the template, see
[`samples/docagent/`](samples/docagent/README.md). The peer
[`samples/`](samples/README.md) directory contains a source-only snapshot of
the completed loan-document app, not another template.

- **Empty Unity app** is a versioned local template with web, agent, gateway,
  editable domain configuration, editable agent instructions, and exactly one
  intentionally empty Hosted Skill. It includes whole-app `dev-start` and
  `dev-stop` scripts and never asks a model to invent tools.
- **Sandbox & Gateway (Minimal)** is a versioned local template with the
  headless Minimal Building Blocks from the [Sandbox & Gateway
  pattern](../../docs/sandbox-gateway-pattern.md): an agent and its Python harness
  at `src/agent/`, a document validation tool at `src/tools/document-validation/`,
  and a remote model through AI Gateway. The tool returns bounded, sanitized
  text, not verified facts or comprehensively de-identified data.
  Local subprocess simulation is the default; separate ACA sandboxes for the
  Copilot SDK agent and document validation tool are optional. It
  has no web or Hosted Skill capability and a single `dev-start`/`dev-stop`
  entrypoint (`src/agent`). Try the focused
  [loan application document demo](./templates/sandbox-gateway-minimal/docs/demos/loan-application/README.md),
  which ships in every generated app alongside its how-it-works guide and
  synthetic input. The template stays reusable; loan-specific guidance applies
  only when processing a loan application.
- **Dealer sample** is the complete nine-capability reference application. Unity
  Studio selects the newest eligible pinned commit containing the web app,
  agent manifest, and whole-app lifecycle scripts, then extracts that entire
  commit into the destination instead of copying scanner matches piecemeal. Its
  archived lifecycle scripts and agent port wiring are upgraded from packaged,
  version-checked Dealer assets before port allocation, so older pinned samples
  receive the same local-port behavior without regenerating the application.
  Unsupported source layouts fail with a descriptive compatibility error.
  Its
  credential-free experience starts with
  `./scripts/dev-start.sh --skip-skills --skip-agent`; the full stack uses
  `./scripts/dev-start.sh` after worktree-local Azure settings are supplied.

`template-materializer.mjs` owns initial files for all local templates. The
model is not allowed to synthesize or manually copy them. New template worktrees
use `git worktree add --no-checkout`, so local templates start with only their own
files rather than an overlay on the Dealer app. Templates include their own
ignore rules for credentials, dependencies, and local runtime state.
For a complete Dealer sample, materialization copies the pinned archive, calls
`materializePortLoaders(destination)`, then calls
`prepareDealerPortOverrides(destination)` from
`dealer-port-materializer.mjs` before allocating ports. The helper validates
the known Dealer layout before replacing lifecycle scripts or adapting the
agent, so an unsupported pinned version is never partially upgraded.
Generation checks the Sandbox & Gateway catalog's full required-file list.
Scenario docs live inside the template as the single source of truth, and their
source links are rewritten to rendered files during materialization.
Existing apps are not regenerated or renamed: Build, **Open in &lt;editor&gt;**, and
document testing also support the earlier `src/sandbox/tool/` layout. New apps
use only `src/tools/document-validation/`; a partial new layout never silently
borrows a contract from the old folder.

See [DESIGN.md](./DESIGN.md) for the tier catalog, implementation inventory, action
semantics, safety boundaries, and tracing limitations.

## Dedicated studios

Unity Studio does not reimplement specialist experiences. `activate_tier`
checks canvases registered in the current session and directly opens or focuses
the preferred studio through `session.rpc.canvas.open()` with a stable instance
ID and tier context.

Current preferred studios include:

| Unity tier | Dedicated canvas | Purpose |
|---|---|---|
| Agent and gateway | `ai-gateway-studio` | Inspect governed model access and Foundry agent workflows |
| Skills | `intelligent-function-app-studio` | Work with hosted skills on Azure Functions |
| Self-awareness / SRE | `sre-agent-studio` | Operate SRE Agent investigations, incidents, memory, and workflows |

If no preferred studio is registered, the action returns discovered implementations
or a structured, non-mutating scaffold recipe. It does not claim availability
from static metadata. Candidate results identify what was found and replace the
discovery action with a concrete next step; Gateway candidates route directly
to the AI Gateway selector instead of repeating discovery.

## Actions

- `list_source_roots` inventories source projects across the current and sibling
  Git worktrees. The guided assembler can authorize an additional local folder
  for the current canvas instance.
- `discover_platform` inventories tier implementations from source projects and
  optional read-only Azure inventory in the active CLI subscription. Results
  include an implementation inventory grouped by tier.
- `request_app_workspace` validates a template or assembly request and resolves
  opaque source IDs immediately before execution. Template requests create a Git
  worktree, hydrate the pinned template, and optionally open a named child
  session through session RPC and launch the selected editor—without sending a creation
  prompt to chat. Older hosts without child-session RPC still receive the
  usable materialized worktree. Assemblies still use a structured model handoff
  because integrating independently built projects requires semantic decisions.

The exact materializer owns known template files. Model reasoning is reserved
for semantic domain rewrites, user-defined tool contracts, integrating
independently built source projects, adding non-template capabilities, and
troubleshooting—not known-file creation.
- `build_capability` adds or improves one tier in the current app worktree,
  updates `unity.app.yaml`, wires it to adjacent tiers, and runs focused tests.
  Add-to-app requests resolve or create the app's persisted child session and
  direct the parent agent to relay the implementation there, so source changes
  occur in the selected app rather than the Unity Studio worktree.
- App Map connection requests follow the same persisted app-session boundary.
  They validate portable component paths, distinguish new from already-discovered
  relationships, and require confirmation before requesting source/configuration
  changes and an updated `unity.app.yaml`.
- `open_in_editor` opens a workspace-confined source path in the saved supported
  editor, or an explicit supported `editorId`. `request_app_workspace` accepts
  `openInEditor` and an optional supported `editorId`.
- `open_in_vscode` and the legacy `openInVsCode` request option retain their
  explicit VS Code behavior for existing integrations.
- `activate_tier` opens a registered preferred studio, returns implementations to
  inspect, or returns a scaffold recipe when no implementation is observed.
- `trace_app` derives a generic App Map whose nodes and edges retain matched
  source locations, unresolved references, and diagnostics. Open its expanded
  Browser canvas to see a left-to-right **Request flow** across the experience,
  reasoning, models and capabilities, connected systems, and cross-cutting
  operations. Discovered request paths are shown by default; **Show other
  resources** reveals disconnected components and workflow internals without
  switching to a different map or moving the request-path cards.
  Search or filter nodes, inspect connection evidence, highlight one-hop
  relationships, and open safe navigation actions with one click. Click the
  selected card again or click empty map space to return to the Guide.
  A request-flow stage's **Add component** action can open its specialist studio or
  explicitly request a new source capability without provisioning Azure.
  **Connect** controls between adjacent stages expose existing evidence and a
  confirmation-gated path to create or improve real source wiring.
  The default **Guide** turns current app evidence into a progressive
  **Build → Connect → Run → Observe & manage** journey. It prioritizes missing
  foundations, uncertain connections, local readiness, and observability while
  keeping later suggestions collapsed.
- `run_doctor` remains a compatibility action backed by discovery probes; it
  reports repository and Azure discovery health rather than simulated platform
  status.

After local startup, the App Map derives component status from lifecycle state.
If Unity Studio reloads while the app is still live, its process registry or
root-owned web and agent listeners recover the running state even when the
in-memory launcher record is gone. Listeners from another app are not attributed
to the selected worktree. Run is idempotent and will not restart an
already-running or partially starting app.
While startup is active, Guide shows how many local services are ready instead
of presenting an indefinite spinner or generic in-progress message.
Detached lifecycle and configuration commands write to a private
`unity-studio-command-logs` directory under the system temporary directory, so
closing Studio does not terminate the operation or discard its diagnostics.
Ready endpoint URLs are actionable: the web surface opens in
the Browser canvas, Hosted Skill buttons open their MCP endpoints, and the
running agent offers **Invoke agent** with a message directly under
**Run/Debug → Try your app**, plus a specialist-studio handoff. Invocation
uses the app's supported source-backed HTTP contract, not a guessed endpoint.
Command output refreshes continuously while this panel is open. TCP-only
services are labeled Listening, not Healthy; web/agent/Functions HTTP checks
report their actual health, and all expected services must be ready before
the app is considered running.
Hosted Skills retain their Functions health checks and MCP links after port
reassignment. Runtime profiles can declare `kind: "function"` (or `type: "function"`)
for custom-named Functions endpoints; existing Dealer skill names
remain compatible without metadata.

**Cancel startup** stays available in the header and Run/Debug while services
are starting. It terminates the tracked startup command before running cleanup,
so the launcher cannot continue starting services afterward. If the launcher is
already gone but components remain, the header shows **Partial startup** with
**Stop partial startup**, rather than an indefinitely disabled Starting button.

Model connection defaults to the saved subscription, or the active Azure CLI
subscription, and a valid gateway in that subscription. A new default selection
is preselected in Settings, then validated and applied only when the user chooses
**Connect gateway** or **Apply or reconfigure** while the app is stopped. Opening
Run or Settings never applies model configuration. Failures stay visible and
require an explicit retry. The subscription and gateway remain editable,
and **Create or manage gateways** opens specialist setup if no gateway exists.
Once validated, Run shows the connected model/gateway summary. No Azure resources
are created automatically.

Discovery and scaffold results are informational. Workspace creation and
implementation happen in the app child session, not in the Unity Studio
worktree. Explicit gateway configuration retrieves the selected gateway key,
validates a real Responses request, and writes worktree-local agent settings;
the key is never returned to the browser.

## Run from this repository

The project wrapper at `.github/extensions/unity-studio/extension.mjs` imports
this extension. Reload extensions after checkout:

```text
extensions_reload
```

Then open the canvas with `canvasId` and stable `instanceId` set to
`unity-studio`.

## Marketplace plugin layout

The canvas also carries a plugin manifest and launcher skill under:

```text
.github/plugin/plugin.json
skills/unity-studio-canvas/SKILL.md
```

The manifest's `"extensions": "."` registers the installed payload directly.
Install and enable the plugin, then open Unity Studio: no manual `npm install`,
build, or bootstrap step is required. The host supplies the Copilot SDK. Runtime
modules and template assets ship inside this folder and resolve relative to
their module, not the user's working directory. Generated apps restore their
own dependencies through their separate setup/start flows.

If the canvas is unavailable, confirm the plugin is enabled, reload extensions,
and retry once. If it remains unavailable, inspect the extension log and repair
the installation; do not create a second copy under the user extensions folder.

Maintainers: run the dependency-free packaging smoke check with Node 24:

```shell
node --test canvases/unity-studio/plugin-portability.test.mjs
```

It copies only the plugin payload into a path containing spaces, excludes
`node_modules`, rejects non-bundled imports, opens the actual loopback UI from an
unrelated workspace, and materializes both local templates. Only the SDK host
registration boundary is stubbed; this does not replace testing actual plugin
installation in GitHub Copilot. CI runs it on Linux, macOS, and Windows.
Workspace authorization uses the canonical filesystem path, so aliases such as
Windows short paths do not reject the workspace itself. The smoke check also
exercises a noncanonical session path and verifies that parent directories and
unregistered subdirectories remain unauthorized.
