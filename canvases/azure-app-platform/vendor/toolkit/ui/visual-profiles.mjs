export const COREAI_AZURE_VISUAL_PROFILE = Object.freeze({
    id: "coreai-azure",
    className: "canvas-profile-coreai-azure",
    stylesheet: "canvas-ui/profiles/coreai-azure.css",
});

export const GITHUB_APP_VISUAL_PROFILE = Object.freeze({
    id: "github-app",
    className: "canvas-profile-github-app",
    stylesheet: "canvas-ui/profiles/github-app.css",
    designGuide: "canvas-ui/hosts/github-app/design.md",
    themingGuide: "canvas-ui/hosts/github-app/theming.md",
});

export const canvasVisualProfiles = Object.freeze({
    [COREAI_AZURE_VISUAL_PROFILE.id]: COREAI_AZURE_VISUAL_PROFILE,
    [GITHUB_APP_VISUAL_PROFILE.id]: GITHUB_APP_VISUAL_PROFILE,
});

export function getCanvasVisualProfile(id) {
    if (typeof id !== "string" || !Object.hasOwn(canvasVisualProfiles, id)) {
        throw new RangeError(`Unknown canvas visual profile: ${id}.`);
    }
    return canvasVisualProfiles[id];
}
