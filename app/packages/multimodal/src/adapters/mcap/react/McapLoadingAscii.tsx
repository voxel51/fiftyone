import classes from "./McapLoadingAscii.module.css";

/**
 * Tiny falling-box ASCII animation shown while a grid preview loads.
 */
export function McapLoadingAscii() {
  return (
    <span
      aria-hidden="true"
      className={classes.fallingAsciiBox}
      data-testid="mcap-loading-ascii"
    >
      <span className={classes.fallingAsciiBoxInner}>{"+--+\n|  |\n+--+"}</span>
    </span>
  );
}
