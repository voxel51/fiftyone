import React from "react";

// ---------------------------------------------------------------------------
// TEMPORARY: inline Play/Pause SVG icons.
// voodo now exports `PlayIcon` / `PauseIcon` components; replace usages of
// these with the design-system components (once the glyphs match) and
// delete this file.
//
// Typed as plain `FC` so they slot into voodo's `Button.leadingIcon`
// (which expects `FC<IconProps>`) without a cast.
// ---------------------------------------------------------------------------

// Decorative — the surrounding button's `aria-label` already names the
// action, so hide the SVGs from assistive tech.
export const PlayIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
    <path d="M4 2.5v11l10-5.5z" />
  </svg>
);

export const PauseIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
    <rect x="3.5" y="2.5" width="3" height="11" rx="0.5" />
    <rect x="9.5" y="2.5" width="3" height="11" rx="0.5" />
  </svg>
);
