import { runCommand } from "./discovery.mjs";

export function allowsActiveLifecycle(operation, state) {
  return operation === "run-local" || (operation === "stop-local" && state?.state === "starting");
}

export async function cancelStartupProcess(child, {
  platform = process.platform,
  signal = (pid) => process.kill(pid, "SIGTERM"),
  run = runCommand,
  timeoutMs = 5000,
} = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return false;
  if (!Number.isInteger(child.pid) || child.pid <= 1) throw new Error("Cannot verify the startup process identity.");
  let timer;
  let onExit;
  const exited = new Promise((resolve) => {
    onExit = () => resolve(true);
    child.once("exit", onExit);
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    if (platform === "win32") {
      const result = await run("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
      if (!result.ok && child.exitCode === null && child.signalCode === null) {
        throw new Error(`Cannot cancel startup: ${result.stderr || result.error || "taskkill failed."}`);
      }
    } else {
      // startAppCommand creates a detached process group owned by this ChildProcess.
      try { signal(-child.pid); }
      catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    if (!await exited) throw new Error("Startup has not exited after cancellation. Review command output and retry Stop.");
    return true;
  } finally {
    clearTimeout(timer);
    child.removeListener("exit", onExit);
  }
}
