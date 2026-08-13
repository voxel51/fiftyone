import classes from "./LoadingAscii.module.css";

/**
 * Tiny falling-box ASCII animation shown while a grid preview loads.
 */
export function LoadingAscii() {
  return (
    <span
      aria-hidden="true"
      className={classes.fallingAsciiBox}
      data-testid="episode-loading-ascii"
    >
      <span className={classes.fallingAsciiBoxInner}>{"+--+\n|  |\n+--+"}</span>
    </span>
  );
}
