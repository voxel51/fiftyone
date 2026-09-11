/**
 * Diamond glyph for the Mark Keyframe toolbar button, matching the lane's
 * keyframe marker. Filled when a keyframe sits at the playhead.
 */
export const KeyframeDiamondIcon = ({ filled }: { filled: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    aria-hidden="true"
    focusable="false"
    style={{ display: "block" }}
  >
    <rect
      x="3.05"
      y="3.05"
      width="7.9"
      height="7.9"
      transform="rotate(45 7 7)"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="miter"
    />
  </svg>
);
