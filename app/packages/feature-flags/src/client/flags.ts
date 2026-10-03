/**
 * Enumeration of active feature flags.
 */
export enum FeatureFlag {
  /**
   * Renders video Explore with the Lighter-backed `VideoTimelineSurface`
   * instead of the looker. Off unless `VFF_LIGHTER_VIDEO_EXPLORE` is set in
   * the server's environment.
   */
  VFF_LIGHTER_VIDEO_EXPLORE = "VFF_LIGHTER_VIDEO_EXPLORE",
}
