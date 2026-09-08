/**
 * Maximum retained samples emitted for one gap-preserving M4 bucket.
 *
 * Producers and consumers share this bound so requested point budgets remain
 * hard limits even when a bucket must preserve endpoints, extrema, and gaps.
 */
export const NUMERIC_SERIES_MAX_BUCKET_SURVIVORS = 5;
