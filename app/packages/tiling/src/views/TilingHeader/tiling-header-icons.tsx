import React from "react";

// ---------------------------------------------------------------------------
// TEMPORARY: inline sidebar-toggle icons.
// `IconName` does not include sidebar variants yet. When it does, replace
// these with the design-system names and delete this file.
//
// Cast as `React.FC` so they satisfy voodo's `Button.leadingIcon`
// (`IconName | FC<{}>`). The `as unknown as React.FC` is needed because
// voodo's published types were compiled against React 17, whose FC generic
// diverges from React 18's on the children constraint.
// TODO: Remove as unknown as React.FC once Icons are part of Voodoo
// ---------------------------------------------------------------------------

/** A rectangle with a vertical bar near the LEFT edge — implies a left panel. */
export const SidebarLeftIcon = ((): React.ReactElement => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="20" height="18" x="2" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
)) as unknown as React.FC;

/** Mirror — vertical bar near the RIGHT edge for the right-side panel. */
export const SidebarRightIcon = ((): React.ReactElement => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="20" height="18" x="2" y="3" rx="2" />
    <path d="M15 3v18" />
  </svg>
)) as unknown as React.FC;
