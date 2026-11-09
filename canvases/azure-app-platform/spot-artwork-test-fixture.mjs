import assert from "node:assert/strict";

export async function inspectSpotArtwork(page, source, sizes = [512, 224, 160, 74, 40]) {
  const result = await page.evaluate(async ({ source, sizes }) => {
    const problems = [];
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) problems.push("Active XML declaration");
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    if (doc.querySelector("parsererror")) return { problems: ["Invalid SVG XML"] };
    const allowed = new Set(["svg", "title", "desc", "g", "path", "rect", "circle"]);
    const ids = [], references = [];
    for (const node of doc.querySelectorAll("*")) {
      if (!allowed.has(node.localName)) problems.push(`Unexpected element ${node.localName}`);
      if (node.id) ids.push(node.id);
      for (const { name, value } of node.attributes) {
        if (/^on/i.test(name) || ["style", "href", "xlink:href", "src"].includes(name) || /url\(|var\(|currentColor/i.test(value)) {
          problems.push(`Nonportable or active attribute ${name}`);
        }
        if (name === "aria-labelledby") references.push(...value.split(/\s+/));
        if (name === "fill" && value !== "none" && node.localName !== "circle") problems.push("Only intentional circular details may be filled");
      }
    }
    if (new Set(ids).size !== ids.length) problems.push("Duplicate IDs");
    for (const id of references) if (!doc.getElementById(id)?.textContent.trim()) problems.push(`Missing label ${id}`);
    const root = doc.documentElement;
    if (root.getAttribute("role") !== "img" || root.getAttribute("viewBox") !== "0 0 512 512"
      || references.length !== 2) problems.push("Missing standalone geometry or accessible label");
    for (const role of ["outline", "supporting-detail", "accent"]) {
      const group = root.querySelector(`[data-spot-role="${role}"]`);
      if (!group || group.getAttribute("fill") !== "none" || !/^#[a-f\d]{6}$/i.test(group.getAttribute("stroke") || "")
        || group.getAttribute("stroke-linecap") !== "round" || group.getAttribute("stroke-linejoin") !== "round") {
        problems.push(`Missing portable ${role} presentation`);
      }
    }
    if (problems.length) return { problems };
    const live = document.importNode(root, true);
    document.body.append(live);
    const bounds = live.getBBox();
    const maxStroke = Math.max(...[...live.querySelectorAll("[stroke-width]")].map(node => Number(node.getAttribute("stroke-width"))));
    if (bounds.x - maxStroke / 2 <= 0 || bounds.y - maxStroke / 2 <= 0
      || bounds.x + bounds.width + maxStroke / 2 >= 512 || bounds.y + bounds.height + maxStroke / 2 >= 512) {
      problems.push("Artwork strokes reach the view box edge");
    }
    live.remove();
    const image = new Image();
    image.src = "data:image/svg+xml," + encodeURIComponent(source);
    await image.decode();
    const samples = sizes.map(size => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      let alpha = 0, edge = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const opacity = pixels[(y * size + x) * 4 + 3];
        alpha += opacity / 255;
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) edge += opacity;
      }
      return { size, coverage: alpha / (size * size), edge };
    });
    const geometry = [...root.querySelectorAll("g, path, rect, circle")].map(node => ({
      tag: node.localName,
      attributes: [...node.attributes].filter(attribute => !["id", "fill", "stroke"].includes(attribute.name))
        .map(attribute => [attribute.name, attribute.value]),
    }));
    return { problems, samples, geometry };
  }, { source, sizes });
  assert.deepEqual(result.problems, []);
  for (const sample of result.samples) {
    assert.ok(sample.coverage > 0.02 && sample.coverage < 0.2,
      `At ${sample.size}px, line artwork must paint visible strokes without becoming a filled tile: ${sample.coverage}`);
    assert.equal(sample.edge, 0, `At ${sample.size}px, every edge must remain transparent`);
  }
  return result;
}
