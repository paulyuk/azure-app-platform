import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const source = await readFile(new URL("./extension.mjs", import.meta.url), "utf8");
const command = JSON.parse(source.match(/^const ACA_INSTALL_POSIX = (".*");$/m)[1]);

test("ACA installer uses an existing user-local directory without sudo", {
  skip: process.platform === "win32",
}, async () => {
  const home = await mkdtemp(join(tmpdir(), "aca-install-"));
  try {
    const bin = join(home, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "curl"), `#!/bin/sh
cat <<'INSTALLER'
set -e
test "$INSTALL_DIR" = "$HOME/.local/bin"
test -d "$INSTALL_DIR"
printf '#!/bin/sh\\necho aca-test-version\\n' > "$INSTALL_DIR/aca"
chmod +x "$INSTALL_DIR/aca"
INSTALLER
`, { mode: 0o755 });
    await writeFile(join(bin, "sudo"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
    const { stdout } = await run("bash", ["-o", "pipefail", "-e", "-c", command], {
      env: { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin` },
    });
    assert.match(stdout, /aca-test-version/);
    assert.equal((source.match(/: ACA_INSTALL_POSIX,/g) || []).length, 3);
    await writeFile(join(bin, "curl"), "#!/bin/sh\nexit 22\n", { mode: 0o755 });
    await assert.rejects(run("bash", ["-o", "pipefail", "-e", "-c", command], {
      env: { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin` },
    }), (error) => error.code === 22 && !error.stdout.includes("aca-test-version"));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("ACA install failures offer CLI setup instead of model connection settings", async () => {
  const ui = await readFile(new URL("./interactive-app-map.mjs", import.meta.url), "utf8");
  assert.match(ui, /command\?\.includes\("aka\.ms\/aca-cli-install"\)[\s\S]*?"Review CLI setup", \(\) => openAppSettings\("prereqs"\)/);
});
