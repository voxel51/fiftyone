import React from "react";

// ---------------------------------------------------------------------------
// TEMPORARY: inline sidebar-toggle icons.
// `IconName` does not include sidebar variants yet. When it does, replace
// these with the design-system names and delete this file.
//
// Typed as plain `FC` so they slot into voodo's `Button.leadingIcon`
// (which expects `IconName | FC<{}>`) without a cast.
// ---------------------------------------------------------------------------

/** A rectangle with a vertical bar near the LEFT edge — implies a left panel. */
export const SidebarLeftIcon: React.FC = () => (
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
);

/** Mirror — vertical bar near the RIGHT edge for the right-side panel. */
export const SidebarRightIcon: React.FC = () => (
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
);
