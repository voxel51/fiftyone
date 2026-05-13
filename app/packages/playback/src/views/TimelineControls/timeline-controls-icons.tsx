import React from "react";

// ---------------------------------------------------------------------------
// TEMPORARY: inline Play/Pause SVG icons.
// The design-system `IconName` enum does not include Play/Pause. When it
// does, replace usages of these with `IconName.Play` / `IconName.Pause`
// and delete this file.
//
// Typed as plain `FC` so they slot into voodo's `Button.leadingIcon`
// (which expects `IconName | FC<{}>`) without a cast.
// ---------------------------------------------------------------------------

export const PlayIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2.5v11l10-5.5z" />
  </svg>
);

export const PauseIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <rect x="3.5" y="2.5" width="3" height="11" rx="0.5" />
    <rect x="9.5" y="2.5" width="3" height="11" rx="0.5" />
  </svg>
);
