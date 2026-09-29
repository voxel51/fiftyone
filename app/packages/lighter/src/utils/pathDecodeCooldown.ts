/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * How long a failed path decode is left alone before another attempt.
 *
 * Long enough that a persistent failure costs one request a second rather than
 * one per frame, short enough that a transient one repairs itself well inside
 * the time it takes to notice.
 */
export const FAILED_PATH_DECODE_COOLDOWN_MS = 1_000;

/**
 * The paths whose decode just failed, and when they may be tried again.
 *
 * `decodeMaskPath` caches nothing on failure, and the overlays deliberately do
 * not record a failed path as decoded — doing that would pin the overlay to one
 * transient network error for the life of the clip. The cost of that choice is
 * that every repaint starts another fetch, which during playback is thirty a
 * second for a path that is not going to resolve. This holds the middle: the
 * failure is remembered, but only briefly.
 */
export class PathDecodeCooldown {
  readonly #retryAfter = new Map<string, number>();

  /** Whether `path` failed recently enough that it should not be retried yet. */
  blocked(path: string, now: number = Date.now()): boolean {
    const at = this.#retryAfter.get(path);

    if (at === undefined) {
      return false;
    }

    if (now >= at) {
      this.#retryAfter.delete(path);
      return false;
    }

    return true;
  }

  /** Records a failure, starting the cooldown for `path`. */
  fail(path: string, now: number = Date.now()): void {
    // Expired entries are only dropped when their own path is asked about, so
    // a clip whose paths change every frame would otherwise accumulate one per
    // frame. Sweeping on write keeps this to the paths actually cooling down.
    for (const [key, at] of this.#retryAfter) {
      if (now >= at) this.#retryAfter.delete(key);
    }

    this.#retryAfter.set(path, now + FAILED_PATH_DECODE_COOLDOWN_MS);
  }

  /** Forgets every recorded failure. */
  clear(): void {
    this.#retryAfter.clear();
  }
}
