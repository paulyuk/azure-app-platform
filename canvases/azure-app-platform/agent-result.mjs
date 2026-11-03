export function summarizeAgentResult(response) {
  const tools = [];
  const text = [];
  if (typeof response === "string") return { text: response, tools };
  if (!response || typeof response !== "object") return { text: "", tools };
  if (typeof response.output_text === "string") text.push(response.output_text);
  for (const item of Array.isArray(response.output) ? response.output : []) {
    if (item?.type === "message" && !response.output_text) {
      for (const content of Array.isArray(item.content) ? item.content : []) {
        if (content?.type === "output_text" && typeof content.text === "string") text.push(content.text);
      }
    }
    if (["function_call", "mcp_call"].includes(item?.type)) {
      tools.push({
        name: String(item.name || "Unnamed tool"),
        status: item.error ? "Failed" : item.type === "mcp_call" && item.status === "completed"
          ? "Completed" : "Call reported",
      });
    }
  }
  if (!text.length && typeof response.message === "string") text.push(response.message);
  if (!text.length && typeof response.response === "string") text.push(response.response);
  for (const item of Array.isArray(response.tool_calls) ? response.tool_calls : []) {
    tools.push({ name: String(item?.function?.name || item?.name || "Unnamed tool"), status: "Call reported" });
  }
  if (response.toolResult != null) tools.push({
    name: "Document validation tool", status: response.toolResult.error ? "Failed" : "Result returned",
  });
  return { text: text.join("\n\n").slice(0, 100_000), tools: tools.slice(0, 100) };
}
