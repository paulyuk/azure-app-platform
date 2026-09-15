# Samples

Finished apps created with Unity Studio. The reusable starters live next door
in [`templates/`](../templates/).

## Loan document sample

[See the code and try it](docagent/README.md).

The loan agent checks a document, hides some personal details, and uses a model
through AI Gateway to summarize the application. It does not approve loans.
This is the `docs-agent5` app shown in the [demo preview](../../../docs/demos/unity-studio-preview.md).

The folder includes the agent, document validation tool, settings, tests,
start/stop scripts, and a fake loan application. It does **not** include
credentials, installed packages, logs, or saved ports.

The agent, tool code, and lockfile still match the captured app. The start/stop
scripts have later safety fixes, and the main README has been rewritten for
readers with a link to the shared Minimal pattern diagram.
The [file record](docagent.snapshot.json) keeps the source details, current
file hashes, and these follow-up changes separately from the original capture.
Its base commit identifies the template checkout, not the finished app.

Run your own copy using the README. Nothing here starts automatically or
changes the original running demo.
