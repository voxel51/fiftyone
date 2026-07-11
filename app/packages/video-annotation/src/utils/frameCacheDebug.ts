/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * DEBUG ONLY — URL overrides for the decoded-frame bitmap cache, used to make
 * the (otherwise eviction-gated, intermittent) "image source is detached"
 * crash reliably reproducible for validation.
 *
 * - `?frame-cache-bytes=<n>` shrinks the cache budget so eviction fires on
 *   nearly every frame instead of only after ~1 GB of playback.
 * - `?frame-cache-unsafe=1` disables the eviction protections (the on-screen
 *   frame pin AND the draw-time guard), restoring the pre-fix behaviour so the
 *   crash reproduces. Without it the protections stay on and playback is clean
 *   even under constant eviction.
 *
 * Not wired to any UI; intended to be dropped once validation is done.
 */
export interface FrameCacheDebugOverrides {
  /** Cache budget in bytes; forces frequent eviction when small. */
  maxBytes?: number;
  /** Disable eviction protections to reproduce the pre-fix crash. */
  unsafe?: boolean;
}

export function parseFrameCacheDebug(search: string): FrameCacheDebugOverrides {
  const params = new URLSearchParams(search);
  const overrides: FrameCacheDebugOverrides = {};

  const bytes = params.get("frame-cache-bytes");
  if (bytes !== null) {
    const parsed = Number(bytes);
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides.maxBytes = parsed;
    }
  }

  if (params.get("frame-cache-unsafe") === "1") {
    overrides.unsafe = true;
  }

  return overrides;
}

/** Read the overrides from the current window URL (empty when no `window`). */
export function readFrameCacheDebug(): FrameCacheDebugOverrides {
  if (typeof window === "undefined") {
    return {};
  }

  return parseFrameCacheDebug(window.location.search);
}
