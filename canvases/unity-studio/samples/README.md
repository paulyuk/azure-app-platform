# Generated samples

`samples/` holds finished application output. Its peer, `templates/`, holds the
reusable inputs that Unity Studio materializes.

## Docagent: loan-document processing

[Browse the finished app](docagent/) or start with its
[generated README](docagent/README.md). This is a source-only snapshot of
**docs-agent5**, the latest completed docagent app used in the
[illustrated preview](../../../docs/demos/unity-studio-preview.md).
It was copied from the working app, not regenerated from today's template.

```text
samples/
  README.md
  docagent.snapshot.json          # Origin and SHA-256 hashes of copied files
  docagent/
    README.md                    # Generated setup, runtime, and test instructions
    unity.app.yaml               # App purpose and capability wiring
    config/                      # Runtime, domain, and enforcement settings
    src/agent/                   # Agent harness, instructions, image, and tests
    src/tools/document-validation/ # Tool implementation, contract, image, and tests
    src/policy/                  # Independent enforcement
    scripts/                     # POSIX/PowerShell start, stop, and port helpers
    infra-ai-gateway/             # Gateway setup guidance
    docs/demos/loan-application/  # Generated walkthrough and how-it-works guide
    examples/loan-application.txt # Fictional input
```

The generated app still calls itself `docs-agent5`; `docagent/` is its stable
sample folder. The [snapshot manifest](docagent.snapshot.json) records the
template checkout and hashes of the actual generated files. The source app was
uncommitted generated output, so the recorded base commit is **not** a commit
containing this finished app.

All copied files are unchanged, including the generated instructions and
dependency lockfile. This is a frozen example, not another template to keep in
automatic sync. Older **Run & manage** wording in its docs refers to today's
**Run/Debug** view.

## What is intentionally absent

No `.env` credentials, Azure account state, virtual environments, caches, logs,
PIDs, saved ports, or machine-specific `.unity-studio` metadata are included.
The original app and its running processes are untouched. This folder is not
automatically registered as a new Studio app or added to the template picker.

To exercise it, work from `docagent/` and follow its generated README. Choose
an unused `AGENT_PORT`; the original app's saved port assignment is not copied.
Configure your own AI Gateway for model calls. The Python tests and
`/test-document` do not need model credentials.

The default tool subprocess is **not isolation**. Use synthetic documents.
The original app purpose is preserved, but **Policy checks passed** remains a
scoped result for sanitized text, not identity verification or loan approval.
Live ACA deployment and isolation are not established by this snapshot.
