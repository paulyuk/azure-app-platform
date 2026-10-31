# GitHub app presentation profile

Use the opt-in `github-app` profile for a Primer Product UI-based canvas.
This is the toolkit's public presentation contract, not a claim that every
component reproduces the host application's private implementation.

## Sources and scope

Reviewed against the public [Primer size and spacing specification](https://primer-docs-preview.github.com/product/primitives/size/),
[typography guidance](https://primer-docs-preview.github.com/product/primitives/typography/)
and [Button guidance](https://primer-docs-preview.github.com/product/components/button/),
with the dialog role checked against the public
[Primer React Dialog stylesheet](https://github.com/primer/react/blob/main/packages/react/src/Dialog/Dialog.module.css),
on 2026-10-28. Component-specific guidance takes precedence over a single
global radius or padding value.

The profile supplies structural roles and maps them to the shared Button and
MessageBar hooks. Product-owned cards, forms and dialogs should consume these
roles rather than repeat numeric Primer values or override toolkit classes.
Other toolkit compositions retain their existing component-specific geometry;
this profile is not a full Primer component library.

## Public roles

Values below are nominal at a 16px document root. Keep the root rem scale intact.

| Role | Property | Value |
| --- | --- | --- |
| Small corners | `--canvas-radius-small` | `0.1875rem` / 3px |
| Controls | `--canvas-radius-control` | `0.375rem` / 6px |
| Standard surfaces | `--canvas-radius-surface` | `0.375rem` / 6px |
| Dialog corners | `--canvas-radius-dialog` | Large corners / 12px |
| Large corners | `--canvas-radius-large` | `0.75rem` / 12px |
| Condensed spacing | `--canvas-spacing-condensed` | `0.5rem` / 8px |
| Normal spacing | `--canvas-spacing-normal` | `1rem` / 16px |
| Spacious spacing | `--canvas-spacing-spacious` | `1.5rem` / 24px |
| Border | `--canvas-border-width` | `0.0625rem` / 1px |
| Regular control minimum height | `--canvas-control-height` | `2rem` / 32px |
| Regular control block/inline padding | `--canvas-control-padding-block`, `--canvas-control-padding-inline` | `0.3125rem` / 5px, `0.75rem` / 12px |

Buttons map small, medium and large minimum heights to 28px, 32px and 40px,
with 3px/8px, 5px/12px and 9px/16px block/inline padding respectively.
They retain wrapping rather than clipping long or translated labels; minimum
heights are not fixed-height promises. Button weight follows
`--font-weight-medium`, falling back to 500. MessageBar uses normal spacing,
standard surface corners and the host's body line height.

## Composition and acceptance

Use the host font stack and type ramp. Do not introduce Aptos, bundle a new
font to imitate the host, or shrink the root font size for density.
Keep body text and form labels normal weight, with a restrained heading hierarchy.

Use consistent same-row action sizes and concise labels. Keep focus visible,
preserve keyboard behavior and drafts, and provide distinct loading, empty,
error and disabled states. Status needs text as well as color.

Verify computed dimensions in narrow and wide layouts, light and dark modes,
and with live host typography. Check wrapping, overflow, action alignment,
focus and retained drafts against the actual packaged assets.
Synthetic token tests establish consumption, not native host delivery.

See [theme delivery](theming.md) before calling a canvas host-themed, and the
package's `ui-components.md` for scoped structural hooks and unchanged defaults.
