import { createReviewRuntime } from "./vendor/codemirror.mjs";

export function createBuildReviewEditor(runtime) {
  const {
    EditorState, EditorSelection, EditorView, GutterMarker, gutter, lineNumbers,
    keymap, defaultKeymap, history, historyKeymap, drawSelection,
    unifiedMergeView, getChunks, getOriginalDoc,
  } = runtime;

  class LineMarker extends GutterMarker {
    constructor(first, count = 1, symbol = "") {
      super();
      this.first = first;
      this.count = count;
      this.symbol = symbol;
    }
    eq(other) {
      return this.first === other.first && this.count === other.count && this.symbol === other.symbol;
    }
    toDOM() {
      const node = document.createElement("span");
      for (let i = 0; i < this.count; i++) {
        const line = document.createElement("span");
        line.style.display = "block";
        line.textContent = this.symbol || String(this.first + i);
        node.append(line);
      }
      return node;
    }
  }
  function precedingChunk(state, position) {
    const chunks = getChunks(state)?.chunks ?? [];
    let low = 0, high = chunks.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (chunks[mid].fromB <= position) low = mid + 1;
      else high = mid;
    }
    return chunks[low - 1];
  }
  function deletedMarker(view, _widget, block, symbol = "") {
    // Deleted text is a zero-length block widget; collapsed context occupies a range.
    if (block.from !== block.to) return null;
    const chunk = precedingChunk(view.state, block.from);
    if (!chunk || chunk.fromB !== block.from || chunk.fromA === chunk.toA) return null;
    const original = getOriginalDoc(view.state);
    const first = original.lineAt(chunk.fromA).number;
    return new LineMarker(first, original.lineAt(chunk.endA).number - first + 1, symbol);
  }

  return function mountReview({ parent, original, content, label, selection, onChange, onError, onComposition }) {
    let interacted = false;
    let destroyed = false;
    function makeContextAccessible() {
      for (const node of parent.querySelectorAll(".cm-collapsedLines:not([role])")) {
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", "Expand " + node.textContent);
        node.tabIndex = 0;
        node.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          const position = view.posAtDOM(node);
          node.click();
          view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
          view.focus();
        });
      }
    }
    const anchor = Math.min(content.length, selection.direction === "backward" ? selection.end : selection.start);
    const head = Math.min(content.length, selection.direction === "backward" ? selection.start : selection.end);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: content,
        selection: EditorSelection.single(anchor, head),
        extensions: [
          history(), drawSelection(), keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorState.tabSize.of(4),
          EditorView.contentAttributes.of({
            "aria-label": label, "aria-multiline": "true", spellcheck: "false",
            autocorrect: "off", autocapitalize: "off",
          }),
          gutter({
            class: "build-review-original-gutter",
            initialSpacer: (view) => new LineMarker(getOriginalDoc(view.state).lines),
            lineMarker: (view, line) => {
              const chunk = precedingChunk(view.state, line.from);
              if (chunk && line.from < chunk.toB) return null;
              const original = getOriginalDoc(view.state);
              const position = line.from + (chunk ? chunk.toA - chunk.toB : 0);
              return position <= original.length ? new LineMarker(original.lineAt(position).number) : null;
            },
            widgetMarker: deletedMarker,
            lineMarkerChange: (update) => update.docChanged,
          }),
          lineNumbers(),
          gutter({
            class: "build-review-change-gutter",
            initialSpacer: () => new LineMarker(0, 1, "+"),
            lineMarker: (view, line) => {
              const chunk = precedingChunk(view.state, line.from);
              return chunk && line.from < chunk.toB ? new LineMarker(0, 1, "+") : null;
            },
            widgetMarker: (view, widget, block) => deletedMarker(view, widget, block, "-"),
            lineMarkerChange: (update) => update.docChanged,
          }),
          unifiedMergeView({
            original, mergeControls: false, gutter: false, allowInlineDiffs: false,
            syntaxHighlightDeletions: false, collapseUnchanged: { margin: 3, minSize: 4 },
            diffConfig: { scanLimit: 500, timeout: 50 },
          }),
          EditorView.domEventHandlers({
            compositionstart: () => { onComposition(true); },
            compositionend: () => { onComposition(false); },
          }),
          EditorView.exceptionSink.of(onError),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || (update.selectionSet && update.view.hasFocus)) interacted = true;
            if (update.docChanged) onChange(update.state.doc.toString());
            makeContextAccessible();
          }),
        ],
      }),
    });
    makeContextAccessible();
    return {
      getValue: () => view.state.doc.toString(),
      setValue(value) {
        if (destroyed || value === view.state.doc.toString()) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      },
      getEditingState() {
        if (!interacted) return selection;
        const range = view.state.selection.main;
        const line = view.state.doc.lineAt(range.head);
        const cursor = view.coordsAtPos(range.head);
        const offset = cursor ? cursor.top - view.scrollDOM.getBoundingClientRect().top : 0;
        return {
          start: range.from, end: range.to, direction: range.anchor > range.head ? "backward" : "forward",
          scrollTop: Math.max(0, (line.number - 1) * view.defaultLineHeight - offset),
          scrollLeft: view.scrollDOM.scrollLeft,
        };
      },
      destroy() {
        destroyed = true;
        view.destroy();
      },
    };
  };
}

export const BUILD_REVIEW_SCRIPT = `const createBuildReview = (${createBuildReviewEditor.toString()})((${createReviewRuntime.toString()})());`
  .replace(/<\/script/gi, "<\\/script");

export const BUILD_REVIEW_CSS = `
#details[data-mode="build"] .build-review-engine { flex:1; min-height:0; }
#details[data-mode="build"] .build-diff .cm-editor { height:100%; min-width:0; font:12px/1.6 var(--font-mono,monospace); color:var(--text-color-default,#222); background:var(--background-color-default,#fff); }
#details[data-mode="build"] .build-diff .cm-scroller { overflow:auto; font:inherit; }
#details[data-mode="build"] .build-diff .cm-content { padding:8px 0; caret-color:var(--text-color-default,#222); }
#details[data-mode="build"] .build-diff :is(.cm-line,.cm-deletedLine) { padding:0 12px; }
#details[data-mode="build"] .build-diff .cm-deletedChunk { padding:0; background:color-mix(in srgb,var(--true-color-red,#c43232) 14%,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-diff .cm-changedLine { background:color-mix(in srgb,var(--true-color-green,#137333) 14%,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-diff .cm-changedText { background:color-mix(in srgb,var(--true-color-green,#137333) 28%,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-diff .cm-deletedText { background:color-mix(in srgb,var(--true-color-red,#c43232) 28%,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-diff .cm-gutters { color:var(--text-color-muted,#6a6775); background:var(--surface-muted,var(--background-color-default,#fff)); border-inline-end:1px solid var(--border-color-default,#ddd); }
#details[data-mode="build"] .build-diff .cm-gutterElement { padding:0 5px; text-align:right; }
#details[data-mode="build"] .build-diff .build-review-change-gutter { color:var(--text-color-default,#222); font-weight:700; }
#details[data-mode="build"] .build-diff .cm-cursor { border-left-color:var(--text-color-default,#222); }
#details[data-mode="build"] .build-diff .cm-selectionBackground { background:color-mix(in srgb,var(--true-color-blue,#007acc) 25%,transparent); }
#details[data-mode="build"] .build-diff .cm-collapsedLines { margin:0; padding:4px 10px; border-block:1px dashed var(--border-color-default,#ddd); color:var(--text-color-muted,#6a6775); background:var(--surface-muted,var(--background-color-default,#fff)); font:11px/1.5 var(--font-sans,system-ui); text-align:center; }
#details[data-mode="build"] .build-diff .cm-collapsedLines:hover { color:var(--true-color-blue,#007acc); background:var(--true-color-blue-muted,#e4f1fc); }
#details[data-mode="build"] .build-diff .cm-focused { outline:none; }
#details[data-mode="build"] .build-diff .cm-collapsedLines:focus-visible { outline:2px solid var(--true-color-blue,#007acc); outline-offset:-2px; }
#details[data-mode="build"] .build-diff-notice { margin:0; padding:4px 8px; border-top:1px solid var(--border-color-default,#ddd); color:var(--text-color-muted,#6a6775); font:11px/1.5 var(--font-sans,system-ui); }
@media (forced-colors:active) {
  #details[data-mode="build"] .build-diff :is(.cm-deletedChunk,.cm-changedLine,.cm-changedText,.cm-deletedText) { background:Canvas; }
  #details[data-mode="build"] .build-diff :is(.cm-content,.cm-gutters) { color:CanvasText; caret-color:CanvasText; }
  #details[data-mode="build"] .build-diff .cm-selectionBackground { background:Highlight; }
  #details[data-mode="build"] .build-diff .cm-cursor { border-left-color:CanvasText; }
}
`;
