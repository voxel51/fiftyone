import type { TimeInt, TimeRange } from "../types";

/**
 * Sorted, deduplicated registry of event times.
 *
 * Used for event-based stepping: step forward/back jumps to the next/previous
 * actual event time rather than blindly incrementing by 1.
 */
export class TimeIndex {
  private _times: TimeInt[] = [];

  /** Number of registered event times. */
  get size(): number {
    return this._times.length;
  }

  /** Whether the index is empty. */
  get isEmpty(): boolean {
    return this._times.length === 0;
  }

  /**
   * Merge new event times into the index (dedup + sort).
   */
  addTimes(newTimes: TimeInt[]): void {
    if (newTimes.length === 0) return;

    const combined = new Set(this._times);
    for (const t of newTimes) {
      combined.add(t);
    }
    this._times = Array.from(combined).sort((a, b) => a - b);
  }

  /**
   * Get the smallest registered time strictly greater than `after`.
   * Returns undefined if none exists.
   */
  getNextTime(after: TimeInt): TimeInt | undefined {
    const times = this._times;
    if (times.length === 0) return undefined;

    // Binary search for first element > after
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (times[mid] <= after) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return lo < times.length ? times[lo] : undefined;
  }

  /**
   * Get the largest registered time strictly less than `before`.
   * Returns undefined if none exists.
   */
  getPrevTime(before: TimeInt): TimeInt | undefined {
    const times = this._times;
    if (times.length === 0) return undefined;

    // Binary search for last element < before
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (times[mid] < before) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // lo points to the first element >= before, so lo-1 is the last < before
    return lo > 0 ? times[lo - 1] : undefined;
  }

  /** Smallest registered time, or undefined if empty. */
  getMinTime(): TimeInt | undefined {
    return this._times.length > 0 ? this._times[0] : undefined;
  }

  /** Largest registered time, or undefined if empty. */
  getMaxTime(): TimeInt | undefined {
    return this._times.length > 0
      ? this._times[this._times.length - 1]
      : undefined;
  }

  /** The full range of registered times, or undefined if empty. */
  getRange(): TimeRange | undefined {
    if (this._times.length === 0) return undefined;
    return [this._times[0], this._times[this._times.length - 1]] as const;
  }

  /** Remove all registered times. */
  clear(): void {
    this._times = [];
  }

  /** Read-only view of the sorted times array. */
  get times(): readonly TimeInt[] {
    return this._times;
  }
}
