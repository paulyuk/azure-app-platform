import icons from "./vendor/octicons/icons.json" with { type: "json" };

export const OCTICONS = icons;

export function renderOcticon(name, { size = 16, className = "" } = {}) {
  const icon = icons[name];
  if (!icon) throw new Error(`Unknown shipped Octicon: ${name}`);
  if (!Number.isFinite(size) || size <= 0 || !/^[a-zA-Z0-9 _-]*$/.test(className)) {
    throw new Error("Invalid Octicon presentation.");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="octicon${className ? ` ${className}` : ""}" data-octicon="${name}" viewBox="0 0 ${icon.width} ${icon.height}" width="${size * icon.width / icon.height}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false">${icon.path}</svg>`;
}

export function octiconMask(name) {
  return `url("data:image/svg+xml,${encodeURIComponent(renderOcticon(name)).replaceAll("'", "%27")}")`;
}

export const OCTICON_MARKUP = Object.fromEntries(Object.keys(icons).map((name) => [name, renderOcticon(name)]));

export const OCTICON_CSS = `
  .octicon { display:inline-block; flex:none; fill:currentColor; stroke:none; vertical-align:text-bottom; }
`;
