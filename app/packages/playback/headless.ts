/**
 * Public React-free playback surface for workers and data-plane runtimes.
 *
 * UI consumers should use the package root or `runtime` entrypoint. Keeping
 * this entry narrow lets dependency rules distinguish store access from React
 * context, hooks, and timeline views.
 */
export * from "./src/lib/playback/atoms";
export * from "./src/lib/playback/store-access";
export type { PlaybackStore } from "./src/lib/playback/types";
