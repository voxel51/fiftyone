/**
 * Enumeration of active feature flags.
 */
export enum FeatureFlag {
  VFF_MULTIMODAL = "VFF_MULTIMODAL",
  /**
   * Renders the clean-room rewrite of the dataset view bar
   * (`NewViewBar`) instead of the legacy xstate-driven `ViewBar`.
   */
  VFF_NEW_VIEW_BAR = "VFF_NEW_VIEW_BAR",
}
