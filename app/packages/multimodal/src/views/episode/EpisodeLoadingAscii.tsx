import classes from "./EpisodeLoadingAscii.module.css";

/**
 * Tiny falling-box ASCII animation shown while a grid preview loads.
 */
export function EpisodeLoadingAscii() {
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
