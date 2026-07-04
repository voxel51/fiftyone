import React from "react";

// ---------------------------------------------------------------------------
// TEMPORARY: inline split icons, mirroring tiling-header-icons.tsx.
// `IconName` does not include split variants yet. When it does, replace
// these with the design-system names and delete this file.
//
// Cast as `React.FC` so they satisfy voodo's `Button.leadingIcon`
// (`IconName | FC<{}>`). The `as unknown as React.FC` is needed because
// voodo's published types were compiled against React 17, whose FC generic
// diverges from React 18's on the children constraint.
// TODO: Remove as unknown as React.FC once Icons are part of Voodoo
// ---------------------------------------------------------------------------

/** A rectangle split by a vertical center line — new pane to the right. */
export const SplitRightIcon = ((): React.ReactElement => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="20" height="18" x="2" y="3" rx="2" />
    <path d="M12 3v18" />
  </svg>
)) as unknown as React.FC;

/** A rectangle split by a horizontal center line — new pane below. */
export const SplitDownIcon = ((): React.ReactElement => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="20" height="18" x="2" y="3" rx="2" />
    <path d="M2 12h20" />
  </svg>
)) as unknown as React.FC;

/**
 * A rectangle split both ways — the direction-neutral resting glyph that
 * advertises the split actions before hover resolves it into the
 * directional pair.
 */
export const SplitTileIcon = ((): React.ReactElement => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="20" height="18" x="2" y="3" rx="2" />
    <path d="M12 3v18" />
    <path d="M2 12h20" />
  </svg>
)) as unknown as React.FC;
