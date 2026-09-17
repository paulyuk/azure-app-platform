export function buildDiffFixture({ baseSha, before, after }) {
  if (before === after) return { baseSha, additions: 0, deletions: 0, hunks: [] };
  const lines = (value) => {
    const content = value.endsWith("\n") ? value.slice(0, -1) : value;
    return content ? content.split("\n") : [];
  };
  const removed = lines(before);
  const added = lines(after);
  return {
    baseSha,
    additions: added.length,
    deletions: removed.length,
    hunks: [{
      oldStart: 1,
      oldCount: removed.length,
      newStart: 1,
      newCount: added.length,
      lines: [
        ...removed.map((text, index) => ({
          kind: "removed", oldLine: index + 1, newLine: null, text,
        })),
        ...added.map((text, index) => ({
          kind: "added", oldLine: null, newLine: index + 1, text,
        })),
      ],
    }],
  };
}
