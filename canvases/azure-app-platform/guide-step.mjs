export function getGuideStep(status, destination) {
  const step = (title, detail, action, attention = false) => ({ title, detail, action, attention });
  if (status.state === "failed") return step("Review failed task", status.description, "result", true);
  if (status.availabilityState === "unavailable") return step("Restore readiness checks", status.description, "run", true);
  if (status.runtimeError || status.availabilityState === "runtime-failed") {
    return step("Review runtime failure", status.runtimeError || status.description, "output", true);
  }
  if (status.state === "invoking") return step("Wait for task execution", status.description, "result");
  if (status.availabilityState === "prerequisites") return step("Install local prerequisites", status.description, "prereqs", true);
  if (status.availabilityState === "ports") return step("Resolve port conflict", status.description, "ports", true);
  if (["preview", "connection"].includes(status.availabilityState)) {
    return step("Connect model access", status.description, "connection", true);
  }
  if (status.availabilityState === "agent-unavailable") {
    return step("Check the agent endpoint", "The app is running, but the agent is not ready. Review Services and Output.", "services", true);
  }
  if (["checking", "starting", "stopping", "configuring", "provisioning", "deploying"].includes(status.availabilityState)) {
    return step(status.title, status.description, "run");
  }
  if (status.state === "succeeded") return step("Review result evidence", status.description, "result");
  if (destination === "build") return step("Customize the app", "Review behavior, source, model access and runtime configuration.", "build");
  if (destination === "connections") return step("Configure gateway access", "Choose a subscription, gateway, model and sandbox group, then apply the connection.", "connect");
  if (destination === "deploy") return step("Review deployment readiness", "Review infrastructure and access before provisioning or deploying to Azure.", "deploy");
  if (["map", "logs"].includes(destination)) return step("Inspect runtime evidence", "Compare discovered request paths with service health and logs; running is not proof of safety.", "observe");
  return step(status.availabilityState === "stopped" ? "Start an agent task" : "Dispatch an event or task", status.description, "run");
}
