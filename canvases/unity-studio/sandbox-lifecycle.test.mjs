import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  access, chmod, cp, mkdtemp, mkdir, readFile, rm, writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const TEST_PREFIX = fileURLToPath(new URL("./.sandbox-lifecycle-test-", import.meta.url));
const TEMPLATE_SCRIPTS = fileURLToPath(new URL("./templates/sandbox-gateway-minimal/scripts/", import.meta.url));
const SAMPLE_SCRIPTS = fileURLToPath(new URL("./samples/docagent/scripts/", import.meta.url));
const PID = 4242;
const OLD_POSIX_START = "Mon Sep 15 12:00:00 2026";
const NEW_POSIX_START = "Mon Sep 15 12:01:00 2026";
const OLD_PS_START = "2026-09-15T16:00:00.0000000Z";
const NEW_PS_START = "2026-09-15T16:01:00.0000000Z";

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function makePosixFixture(t, {
  recordedStart = OLD_POSIX_START,
  currentStart = OLD_POSIX_START,
  killMode = "success",
  protectTracked = false,
} = {}) {
  const root = await mkdtemp(TEST_PREFIX);
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, "scripts"), { recursive: true }),
    mkdir(join(root, ".dev-run"), { recursive: true }),
    mkdir(join(root, "mock-bin"), { recursive: true }),
  ]);
  await cp(join(TEMPLATE_SCRIPTS, "dev-stop.sh"), join(root, "scripts", "dev-stop.sh"));
  await writeFile(
    join(root, ".dev-run", "processes.posix.tsv"),
    `agent\t8088\t${PID}\t${recordedStart}\n`,
  );
  await writeFile(join(root, ".dev-run", "agent.log"), "keep on failed cleanup\n");
  await writeFile(join(root, "mock-bin", "ps"), `#!/usr/bin/env bash
if [[ "$*" == *"lstart="* ]]; then
  [[ -f "$MOCK_EXITED_FILE" ]] || printf '%s\\n' "$MOCK_CURRENT_START"
elif [[ "$*" == *"ppid="* ]]; then
  if [[ "$MOCK_PROTECT_TRACKED" == "true" ]]; then printf '${PID}\\n'; else printf '1\\n'; fi
fi
`);
  await writeFile(join(root, "mock-bin", "pgrep"), "#!/usr/bin/env bash\nexit 0\n");
  await writeFile(join(root, "mock-bin", "sleep"), "#!/usr/bin/env bash\nexit 0\n");
  await writeFile(join(root, "mock-bin", "kill"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$MOCK_SIGNAL_LOG"
if [[ "$MOCK_KILL_MODE" == "success" ]]; then
  : >"$MOCK_EXITED_FILE"
  exit 0
fi
exit 1
`);
  await Promise.all(["dev-stop.sh", "../mock-bin/ps", "../mock-bin/pgrep", "../mock-bin/sleep", "../mock-bin/kill"]
    .map((path) => chmod(join(root, "scripts", path), 0o755)));

  const signalLog = join(root, "signals.log");
  const result = spawnSync(join(root, "scripts", "dev-stop.sh"), [], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      UNITY_PS_COMMAND: join(root, "mock-bin", "ps"),
      UNITY_PGREP_COMMAND: join(root, "mock-bin", "pgrep"),
      UNITY_KILL_COMMAND: join(root, "mock-bin", "kill"),
      UNITY_SLEEP_COMMAND: join(root, "mock-bin", "sleep"),
      MOCK_CURRENT_START: currentStart,
      MOCK_EXITED_FILE: join(root, "exited"),
      MOCK_SIGNAL_LOG: signalLog,
      MOCK_KILL_MODE: killMode,
      MOCK_PROTECT_TRACKED: String(protectTracked),
    },
  });
  return { root, result, signalLog };
}

function psQuote(value) {
  return value.replaceAll("'", "''");
}

async function makePowerShellFixture(t, {
  recordedStart = OLD_PS_START,
  currentStart = OLD_PS_START,
  killMode = "success",
  protectTracked = false,
} = {}) {
  const root = await mkdtemp(TEST_PREFIX);
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, "scripts"), { recursive: true }),
    mkdir(join(root, ".dev-run"), { recursive: true }),
  ]);
  await cp(join(SAMPLE_SCRIPTS, "dev-stop.ps1"), join(root, "scripts", "dev-stop.ps1"));
  await writeFile(join(root, ".dev-run", "processes.json"), `${JSON.stringify([{
    name: "agent", port: 8088, pid: PID, startedAt: recordedStart || null,
  }])}\n`);
  await writeFile(join(root, ".dev-run", "agent.log"), "keep on failed cleanup\n");
  const signalLog = join(root, "taskkill.log");
  const wrapper = join(root, "run-stop.ps1");
  await writeFile(wrapper, `
$global:MockLive = $true
$global:MockStart = [DateTime]::Parse('${psQuote(currentStart)}').ToUniversalTime()
$global:AncestorCalls = 0
function Get-CimInstance {
  param([string] $ClassName, [string] $Filter, $ErrorAction)
  if ('${protectTracked}' -eq 'true' -and $global:AncestorCalls++ -eq 0) {
    return [pscustomobject]@{ ParentProcessId = ${PID} }
  }
  [pscustomobject]@{ ParentProcessId = 0 }
}
function Get-Process {
  param([int] $Id, $ErrorAction)
  if ($Id -ne ${PID} -or -not $global:MockLive) { return $null }
  [pscustomobject]@{ StartTime = $global:MockStart; ProcessName = "mock-agent" }
}
function Start-Sleep { param([int] $Milliseconds) }
function taskkill.exe {
  Add-Content -Path '${psQuote(signalLog)}' -Value ($args -join " ")
  if ('${killMode}' -eq 'success') { $global:MockLive = $false }
}
& '${psQuote(join(root, "scripts", "dev-stop.ps1"))}'
exit $LASTEXITCODE
`);
  const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", wrapper], {
    cwd: root,
    encoding: "utf8",
  });
  return { root, result, signalLog };
}

async function signals(path) {
  return (await exists(path)) ? await readFile(path, "utf8") : "";
}

test("launchers persist start identity immediately and checked-in copies stay aligned", async () => {
  for (const [templateName, sampleName] of [
    ["dev-start.sh", "dev-start.sh"],
    ["dev-stop.sh", "dev-stop.sh"],
    ["dev-start.ps1.template", "dev-start.ps1"],
    ["dev-stop.ps1.template", "dev-stop.ps1"],
  ]) {
    const template = (await readFile(join(TEMPLATE_SCRIPTS, templateName), "utf8"))
      .replaceAll("__APP_NAME__", "docs-agent5");
    const sample = await readFile(join(SAMPLE_SCRIPTS, sampleName), "utf8");
    assert.equal(sample, template);
  }
  const posix = await readFile(join(TEMPLATE_SCRIPTS, "dev-start.sh"), "utf8");
  assert.match(posix, /started_at="\$\(process_started_at "\$pid"\)"[\s\S]*printf[\s\S]*wait_port/);
  const powershell = await readFile(join(TEMPLATE_SCRIPTS, "dev-start.ps1.template"), "utf8");
  assert.match(powershell, /StartTime\.ToUniversalTime\(\)\.ToString\("O"\)[\s\S]*startedAt = \$StartedAt[\s\S]*Wait-Port/);
  assert.match(posix, /if ! "\$ROOT\/scripts\/dev-stop\.sh"/);
  assert.match(powershell, /if \(\$LASTEXITCODE -ne 0\)/);
});

test("mocked PID reuse is discarded without sending a signal", async (t) => {
  const posix = await makePosixFixture(t, { currentStart: NEW_POSIX_START });
  assert.equal(posix.result.status, 0, posix.result.stderr);
  assert.match(posix.result.stdout, /PID was reused/);
  assert.equal(await signals(posix.signalLog), "");
  assert.equal(await exists(join(posix.root, ".dev-run")), false);

  const powershell = await makePowerShellFixture(t, { currentStart: NEW_PS_START });
  assert.equal(powershell.result.status, 0, powershell.result.stderr);
  assert.match(powershell.result.stdout, /PID was reused/);
  assert.equal(await signals(powershell.signalLog), "");
  assert.equal(await exists(join(powershell.root, ".dev-run")), false);
});

test("failed termination returns nonzero and retains retry ownership", async (t) => {
  const posix = await makePosixFixture(t, { killMode: "fail" });
  assert.equal(posix.result.status, 1);
  assert.match(posix.result.stderr, /registry was preserved for retry/);
  assert.match(await readFile(join(posix.root, ".dev-run", "processes.posix.tsv"), "utf8"), new RegExp(`\\t${PID}\\t${OLD_POSIX_START}`));
  assert.equal(await exists(join(posix.root, ".dev-run", "agent.log")), true);

  const powershell = await makePowerShellFixture(t, { killMode: "fail" });
  assert.equal(powershell.result.status, 1);
  assert.match(powershell.result.stderr, /registry was preserved for retry/);
  const retained = JSON.parse(await readFile(join(powershell.root, ".dev-run", "processes.json"), "utf8"));
  assert.equal((Array.isArray(retained) ? retained[0] : retained).startedAt, OLD_PS_START);
  assert.equal(await exists(join(powershell.root, ".dev-run", "agent.log")), true);
});

test("normal cleanup confirms exit and removes the run registry", async (t) => {
  const posix = await makePosixFixture(t);
  assert.equal(posix.result.status, 0, posix.result.stderr);
  assert.match(posix.result.stdout, /stopped tracked PID/);
  assert.equal((await signals(posix.signalLog)).trim(), `${PID}`);
  assert.equal(await exists(join(posix.root, ".dev-run")), false);

  const powershell = await makePowerShellFixture(t);
  assert.equal(powershell.result.status, 0, powershell.result.stderr);
  assert.match(powershell.result.stdout, /stopped tracked PID/);
  assert.equal((await signals(powershell.signalLog)).trim(), `/PID ${PID} /T /F`);
  assert.equal(await exists(join(powershell.root, ".dev-run")), false);
});

test("timestamp-less live records fail closed without a stale PID signal", async (t) => {
  const posix = await makePosixFixture(t, { recordedStart: "" });
  assert.equal(posix.result.status, 1);
  assert.match(posix.result.stderr, /no recorded start identity[\s\S]*Refusing to signal/);
  assert.equal(await signals(posix.signalLog), "");
  assert.equal(await exists(join(posix.root, ".dev-run", "processes.posix.tsv")), true);

  const powershell = await makePowerShellFixture(t, { recordedStart: "" });
  assert.equal(powershell.result.status, 1);
  assert.match(powershell.result.stderr, /no recorded start identity[\s\S]*Refusing to signal/);
  assert.equal(await signals(powershell.signalLog), "");
  assert.equal(await exists(join(powershell.root, ".dev-run", "processes.json")), true);
});

test("tracked shell ancestors are protected and retained without signals", async (t) => {
  const posix = await makePosixFixture(t, { protectTracked: true });
  assert.equal(posix.result.status, 1);
  assert.match(posix.result.stderr, /this shell or an ancestor/);
  assert.equal(await signals(posix.signalLog), "");
  assert.equal(await exists(join(posix.root, ".dev-run", "processes.posix.tsv")), true);

  const powershell = await makePowerShellFixture(t, { protectTracked: true });
  assert.equal(powershell.result.status, 1);
  assert.match(powershell.result.stderr, /PowerShell process or an ancestor/);
  assert.equal(await signals(powershell.signalLog), "");
  assert.equal(await exists(join(powershell.root, ".dev-run", "processes.json")), true);
});
