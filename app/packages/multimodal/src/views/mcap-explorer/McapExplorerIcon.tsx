import React from "react";

/**
 * Panel icon for the MCAP explorer: a recording container with a play
 * glyph, drawn inline because neither voodo nor this package's deps ship
 * a playback/telemetry icon.
 */
const McapExplorerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    focusable="false"
    height="1em"
    viewBox="0 0 24 24"
    width="1em"
    {...props}
  >
    <path
      d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H6Z"
      fillRule="evenodd"
    />
    <path d="M10 8.2a.6.6 0 0 1 .9-.52l6.1 3.8a.6.6 0 0 1 0 1.04l-6.1 3.8a.6.6 0 0 1-.9-.52V8.2Z" />
  </svg>
);

export default McapExplorerIcon;
