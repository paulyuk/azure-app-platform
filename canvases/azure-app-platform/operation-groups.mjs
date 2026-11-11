export function buildOperationGroups(nodes, edges) {
  const projects = nodes.filter((node) => node.kind === "project" && node.tierId === "workflows");
  const projectIds = new Set(projects.map((node) => node.id));
  const children = new Map(projects.map((node) => [node.id, []]));
  for (const node of nodes) {
    if (!["operation", "event"].includes(node.kind)) continue;
    const explicit = [...new Set(edges
      .filter((edge) => edge.kind === "contains" && edge.to === node.id && projectIds.has(edge.from))
      .map((edge) => edge.from))];
    const owners = explicit.length ? explicit : projects
      .filter((project) => node.projectPath && project.projectPath === node.projectPath)
      .map((project) => project.id);
    if (owners.length === 1) children.get(owners[0]).push(node.id);
  }
  return [...children].filter(([, nodeIds]) => nodeIds.length)
    .map(([parentId, nodeIds]) => ({ parentId, nodeIds }));
}
