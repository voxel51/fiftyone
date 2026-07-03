/**
 * Module-level accounting of live WebGPU renderers, keyed by the surface
 * that mounted them ("modal-3d", "grid-preview", ...). One registered
 * renderer corresponds to one `GPUDevice`, so these counts are the page's
 * device footprint.
 *
 * Pure bookkeeping: registration never grants or denies anything (budget
 * policy is a later phase) — the registry exists so device counts are
 * observable and assertable instead of only visible to ad-hoc probe hooks.
 *
 * Layering: this is generic visualization machinery and must not import
 * from adapters/ (dependency-cruiser enforces it). Adapter layers may
 * import this module to mirror the stats into their own debug channels.
 */

/**
 * Soft ceiling on simultaneously live renderers. The product ceiling for
 * live `GPUDevice`s is 16–20 per page — browsers enforce unspecified
 * per-page device limits differently per platform — so we budget against
 * the conservative end. Crossing the budget only warns; it never throws.
 */
export const WEBGPU_DEVICE_BUDGET = 16;

/** Minimum interval between over-budget console warnings. */
const OVER_BUDGET_WARN_THROTTLE_MS = 10_000;

/**
 * Handle returned by {@link registerWebGpuRenderer}. `release` is
 * idempotent: the first call decrements the counts, later calls no-op.
 */
export interface WebGpuRendererRegistration {
  release(): void;
}

/** Immutable snapshot of the registry's counters. */
export interface WebGpuDeviceStats {
  readonly budget: number;
  readonly bySurface: Readonly<Record<string, number>>;
  readonly highWaterMark: number;
  readonly overBudget: boolean;
  readonly total: number;
  readonly totalRegistered: number;
  readonly totalReleased: number;
}

type WebGpuDeviceStatsSubscriber = (stats: WebGpuDeviceStats) => void;

const liveBySurface = new Map<string, number>();
const subscribers = new Set<WebGpuDeviceStatsSubscriber>();
let liveTotal = 0;
let highWaterMark = 0;
let totalRegistered = 0;
let totalReleased = 0;
let lastOverBudgetWarnMs: number | null = null;

/**
 * Records one live WebGPU renderer on `surface`. Call when the renderer
 * is constructed; call the returned `release` wherever that renderer
 * instance is disposed.
 */
export function registerWebGpuRenderer(
  surface: string,
): WebGpuRendererRegistration {
  liveTotal += 1;
  totalRegistered += 1;
  highWaterMark = Math.max(highWaterMark, liveTotal);
  liveBySurface.set(surface, (liveBySurface.get(surface) ?? 0) + 1);
  maybeWarnOverBudget();
  notifySubscribers();

  let released = false;
  return {
    release() {
      if (released) {
        return;
      }

      released = true;
      liveTotal -= 1;
      totalReleased += 1;
      const surfaceCount = liveBySurface.get(surface) ?? 0;
      if (surfaceCount <= 1) {
        liveBySurface.delete(surface);
      } else {
        liveBySurface.set(surface, surfaceCount - 1);
      }
      notifySubscribers();
    },
  };
}

/** Current registry counters as a plain serializable snapshot. */
export function webGpuDeviceStats(): WebGpuDeviceStats {
  return {
    budget: WEBGPU_DEVICE_BUDGET,
    bySurface: Object.fromEntries(liveBySurface),
    highWaterMark,
    overBudget: liveTotal > WEBGPU_DEVICE_BUDGET,
    total: liveTotal,
    totalRegistered,
    totalReleased,
  };
}

/**
 * Cheap change feed for debug publishers: `callback` is invoked
 * synchronously on every register and release (no polling, no dedupe —
 * deliberately dumb). Returns an unsubscribe function.
 */
export function subscribeWebGpuDeviceStats(
  callback: WebGpuDeviceStatsSubscriber,
): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Clears all counters, subscribers, and warn throttling. Tests only. */
export function resetWebGpuDeviceRegistryForTests(): void {
  liveBySurface.clear();
  subscribers.clear();
  liveTotal = 0;
  highWaterMark = 0;
  totalRegistered = 0;
  totalReleased = 0;
  lastOverBudgetWarnMs = null;
}

function maybeWarnOverBudget(): void {
  if (liveTotal <= WEBGPU_DEVICE_BUDGET) {
    return;
  }

  const nowMs = Date.now();
  if (
    lastOverBudgetWarnMs !== null &&
    nowMs - lastOverBudgetWarnMs < OVER_BUDGET_WARN_THROTTLE_MS
  ) {
    return;
  }

  lastOverBudgetWarnMs = nowMs;
  console.warn(
    `[webgpu-device-registry] ${liveTotal} live WebGPU renderers exceed the ` +
      `device budget of ${WEBGPU_DEVICE_BUDGET}`,
    webGpuDeviceStats(),
  );
}

function notifySubscribers(): void {
  if (subscribers.size === 0) {
    return;
  }

  const stats = webGpuDeviceStats();
  for (const subscriber of subscribers) {
    try {
      subscriber(stats);
    } catch {
      // Observers are debug-only; they must never break the bookkeeping
      // paths (renderer construction/disposal) that notify them.
    }
  }
}
