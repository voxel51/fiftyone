/**
 * Lease pool bounding how many LIVE grid renderers may exist at once. A
 * live grid renderer owns a `WebGPUCanvas` (one `GPUDevice` each), so an
 * unbounded hover sweep would re-open the per-cell device zoo the grid
 * just escaped; the pool caps that footprint and steals from the oldest
 * holder instead of ever exceeding the cap.
 *
 * Semantics:
 * - Under cap: acquire grants immediately.
 * - At cap: the OLDEST lease (LRU by grant time; re-acquire refreshes
 *   recency) is revoked — its `onRevoked` runs synchronously and must
 *   mark that holder as no-longer-live — then the new holder is granted.
 * - Re-acquire by a holder that already holds a lease is idempotent: it
 *   returns the existing lease and refreshes recency (StrictMode's
 *   double-invoked effects never double-count).
 *
 * Layering: generic visualization machinery — no adapters/ imports
 * (dependency-cruiser enforces it).
 */

import { canAcquireWebGpuDevice } from "./graphics-renderer-registry";

/**
 * Bounds simultaneous live grid renderers (and so grid `GPUDevice`s).
 * The plan's page-level budget math is: modal devices +
 * `GRID_LIVE_RENDERER_CAP` + 1 shared snapshot renderer.
 */
export const GRID_LIVE_RENDERER_CAP = 2;

/**
 * Handle returned by {@link acquireGridLiveLease}. `release` is
 * idempotent, and a no-op if the lease was already revoked by a steal.
 */
export interface GridLiveLease {
  release(): void;
}

/** Immutable snapshot of the pool's counters. */
export interface GridLiveLeaseStats {
  /** Leases currently held (never exceeds the cap). */
  readonly active: number;
  readonly cap: number;
  /** Acquires denied outright by the global device-budget policy. */
  readonly denied: number;
  /** Fresh grants (idempotent re-acquires by a holder do not count). */
  readonly granted: number;
  /** Leases stolen from their holder to make room at the cap. */
  readonly revoked: number;
}

interface GridLiveLeaseRecord {
  readonly holderId: string;
  readonly lease: GridLiveLease;
  onRevoked: () => void;
  /** True once released or revoked; settles exactly once. */
  settled: boolean;
}

// Map insertion order doubles as the LRU order: fresh grants append, and
// re-acquires delete + re-insert to refresh recency.
const leasesByHolder = new Map<string, GridLiveLeaseRecord>();
let grantedCount = 0;
let revokedCount = 0;
let deniedCount = 0;

/**
 * Acquires (or refreshes) the live-renderer lease for `holderId`.
 * Returns null when the global device budget denies the grant
 * ({@link canAcquireWebGpuDevice} for class "grid-live"); callers treat
 * null as "stay on the snapshot". Re-acquires by an existing holder are
 * never denied — that holder already owns its device, so refreshing
 * recency adds nothing to the footprint.
 *
 * `onRevoked` fires synchronously if the lease is later stolen; it must
 * synchronously mark the holder as no-longer-live (unmount its live
 * renderer) so the pool never exceeds the cap. The latest callback wins
 * on re-acquire.
 */
export function acquireGridLiveLease(
  holderId: string,
  onRevoked: () => void,
): GridLiveLease | null {
  const existing = leasesByHolder.get(holderId);
  if (existing) {
    // Idempotent re-acquire: refresh LRU recency and adopt the caller's
    // latest revoke callback (StrictMode re-runs pass a fresh closure).
    leasesByHolder.delete(holderId);
    leasesByHolder.set(holderId, existing);
    existing.onRevoked = onRevoked;
    return existing.lease;
  }

  const lease = tryGrant(holderId, onRevoked);
  if (lease === null) {
    deniedCount += 1;
  }
  return lease;
}

/** Current pool counters as a plain serializable snapshot. */
export function gridLiveLeaseStats(): GridLiveLeaseStats {
  return {
    active: leasesByHolder.size,
    cap: GRID_LIVE_RENDERER_CAP,
    denied: deniedCount,
    granted: grantedCount,
    revoked: revokedCount,
  };
}

/**
 * Clears all leases (without firing their revoke callbacks) and zeroes
 * the counters. Tests only.
 */
export function resetGridLiveLeasesForTests(): void {
  for (const record of leasesByHolder.values()) {
    record.settled = true;
  }
  leasesByHolder.clear();
  grantedCount = 0;
  revokedCount = 0;
  deniedCount = 0;
}

/**
 * The single grant path: every fresh lease flows through here (re-acquires
 * short-circuit earlier and never re-grant).
 */
function tryGrant(
  holderId: string,
  onRevoked: () => void,
): GridLiveLease | null {
  // Budget policy gates BEFORE the steal, so a denied acquire never
  // evicts an existing holder — over budget, the live set is frozen as-is
  // rather than churned.
  if (!canAcquireWebGpuDevice("grid-live")) {
    return null;
  }

  if (leasesByHolder.size >= GRID_LIVE_RENDERER_CAP) {
    revokeOldest();
  }

  const record: GridLiveLeaseRecord = {
    holderId,
    lease: {
      release() {
        if (record.settled) {
          // Already released, or revoked by a steal: no-op.
          return;
        }
        record.settled = true;
        leasesByHolder.delete(holderId);
      },
    },
    onRevoked,
    settled: false,
  };
  leasesByHolder.set(holderId, record);
  grantedCount += 1;
  return record.lease;
}

function revokeOldest(): void {
  const oldest = leasesByHolder.values().next();
  if (oldest.done) {
    return;
  }

  const record = oldest.value;
  leasesByHolder.delete(record.holderId);
  record.settled = true;
  revokedCount += 1;
  try {
    // Must synchronously mark the holder as no-longer-live; see
    // acquireGridLiveLease.
    record.onRevoked();
  } catch {
    // A holder's fallback failing must not block the new grant — the
    // pool's bookkeeping (the eviction above) already happened.
  }
}
