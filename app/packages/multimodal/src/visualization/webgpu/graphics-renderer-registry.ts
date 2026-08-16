import type {
  GraphicsBackend,
  GraphicsBackendRequest,
} from "./graphics-backend";
import {
  GRAPHICS_POWER_PREFERENCE,
  requestedGraphicsBackend,
} from "./graphics-backend";

/** Conservative soft ceiling on reserved-or-live WebGPU devices per page. */
export const WEBGPU_DEVICE_BUDGET = 16;

const OVER_BUDGET_WARN_THROTTLE_MS = 10_000;
const FALLBACK_REASON = "webgpu-unavailable-or-init-failed";

/** Renderer classes that participate in the page's WebGPU device budget. */
export type WebGpuAcquisitionClass = "modal" | "grid-live" | "snapshot";
/** Lifecycle states recorded for one graphics renderer. */
export type GraphicsRendererState =
  | "initializing"
  | "ready"
  | "failed"
  | "lost"
  | "disposed";

/** Active renderer counts for one named canvas surface. */
export interface GraphicsSurfaceStats {
  readonly initializing: number;
  readonly webgl2: number;
  readonly webgpu: number;
}

/** Page-wide renderer lifecycle and backend diagnostics. */
export interface GraphicsRendererStats {
  /** Most recent init or loss error; retained until diagnostics are reset. */
  readonly lastError: string | null;
  readonly requestedBackend: GraphicsBackendRequest;
  readonly requestedPowerPreference: typeof GRAPHICS_POWER_PREFERENCE;
  readonly renderers: {
    readonly byBackend: Readonly<Record<GraphicsBackend, number>>;
    readonly bySurface: Readonly<Record<string, GraphicsSurfaceStats>>;
    readonly created: number;
    readonly deviceLosses: number;
    readonly disposed: number;
    readonly highWaterMark: number;
    readonly initFailures: number;
    readonly initializing: number;
    readonly live: number;
    readonly webGlFallbackReason: typeof FALLBACK_REASON;
    readonly webGlFallbacks: number;
    readonly webGlOverrides: number;
  };
  readonly webGpuDevices: {
    readonly budget: number;
    readonly highWaterMark: number;
    readonly live: number;
    readonly overBudget: boolean;
    readonly reserved: number;
  };
}

/** Mutable lifecycle handle owned by one renderer instance. */
export interface GraphicsRendererRegistration {
  readonly state: GraphicsRendererState;
  markFailed(error: unknown): void;
  markLost(info: unknown): void;
  markReady(backend: GraphicsBackend): void;
  release(): void;
}

type GraphicsStatsSubscriber = (stats: GraphicsRendererStats) => void;
type MutableSurfaceStats = {
  initializing: number;
  webgl2: number;
  webgpu: number;
};

const bySurface = new Map<string, MutableSurfaceStats>();
const subscribers = new Set<GraphicsStatsSubscriber>();
let initializing = 0;
let liveRenderers = 0;
let liveWebGpuDevices = 0;
let liveWebGlRenderers = 0;
let webGpuReservations = 0;
let rendererHighWaterMark = 0;
let webGpuDeviceHighWaterMark = 0;
let created = 0;
let disposed = 0;
let webGlFallbacks = 0;
let webGlOverrides = 0;
let initFailures = 0;
let deviceLosses = 0;
let lastError: string | null = null;
let lastOverBudgetWarnMs: number | null = null;

/**
 * Registers a renderer request. Automatic requests reserve a possible WebGPU
 * device until `markReady` reveals the backend or the request fails/releases;
 * an explicit WebGL2 diagnostic request never consumes that budget.
 */
export function registerGraphicsRenderer(
  surface: string,
  backendRequest: GraphicsBackendRequest = requestedGraphicsBackend(),
): GraphicsRendererRegistration {
  let state: GraphicsRendererState = "initializing";
  let backend: GraphicsBackend | null = null;
  const reservesWebGpu = backendRequest === "auto";
  initializing += 1;
  if (reservesWebGpu) {
    webGpuReservations += 1;
  }
  liveRenderers += 1;
  created += 1;
  rendererHighWaterMark = Math.max(rendererHighWaterMark, liveRenderers);
  adjustSurface(surface, "initializing", 1);
  maybeWarnOverBudget();
  notifySubscribers();

  const leaveLiveState = () => {
    liveRenderers -= 1;
    if (state === "initializing") {
      initializing -= 1;
      if (reservesWebGpu) {
        webGpuReservations -= 1;
      }
      adjustSurface(surface, "initializing", -1);
    } else if (state === "ready" && backend) {
      if (backend === "webgpu") {
        liveWebGpuDevices -= 1;
      } else {
        liveWebGlRenderers -= 1;
      }
      adjustSurface(surface, backend, -1);
    }
  };

  return {
    get state() {
      return state;
    },
    markFailed(error) {
      if (state !== "initializing") return;
      leaveLiveState();
      state = "failed";
      initFailures += 1;
      lastError = normalizedRendererError(error);
      notifySubscribers();
    },
    markLost(info) {
      // Three can report device loss after acquiring a device but before its
      // init promise resolves. An initializing registration still owns the
      // only reservation for that renderer, so retire it and preserve the
      // loss instead of letting the later init rejection erase the event.
      if (state !== "initializing" && state !== "ready") {
        return;
      }
      leaveLiveState();
      state = "lost";
      deviceLosses += 1;
      lastError = normalizedDeviceLoss(info);
      notifySubscribers();
    },
    markReady(resolvedBackend) {
      if (state !== "initializing") return;
      initializing -= 1;
      if (reservesWebGpu) {
        webGpuReservations -= 1;
      }
      adjustSurface(surface, "initializing", -1);
      backend = resolvedBackend;
      state = "ready";
      adjustSurface(surface, resolvedBackend, 1);
      if (resolvedBackend === "webgpu") {
        liveWebGpuDevices += 1;
        webGpuDeviceHighWaterMark = Math.max(
          webGpuDeviceHighWaterMark,
          liveWebGpuDevices,
        );
      } else {
        liveWebGlRenderers += 1;
        if (backendRequest === "webgl2") {
          webGlOverrides += 1;
        } else {
          webGlFallbacks += 1;
        }
      }
      // Usually a reservation simply becomes a live device. Keep the warning
      // correct even if a renderer resolves to WebGPU after a WebGL2 request.
      maybeWarnOverBudget();
      notifySubscribers();
    },
    release() {
      if (state === "disposed") return;
      if (state === "initializing" || state === "ready") {
        leaveLiveState();
      }
      state = "disposed";
      disposed += 1;
      notifySubscribers();
    },
  };
}

/**
 * Returns whether a renderer class may reserve another possible WebGPU device.
 * Grid-live surfaces are budgeted; the UI permits one modal at a time, and
 * snapshot jobs share one serialized renderer, so those bounded classes may
 * acquire outside the grid budget.
 */
export function canAcquireWebGpuDevice(cls: WebGpuAcquisitionClass): boolean {
  if (cls === "modal" || cls === "snapshot") return true;
  return reservedOrLiveWebGpuDevices() < WEBGPU_DEVICE_BUDGET;
}

/** Returns a detached snapshot of current graphics renderer diagnostics. */
export function graphicsRendererStats(): GraphicsRendererStats {
  return {
    lastError,
    requestedBackend: requestedGraphicsBackend(),
    requestedPowerPreference: GRAPHICS_POWER_PREFERENCE,
    renderers: {
      byBackend: { webgl2: liveWebGlRenderers, webgpu: liveWebGpuDevices },
      bySurface: Object.fromEntries(
        Array.from(bySurface, ([surface, stats]) => [surface, { ...stats }]),
      ),
      created,
      deviceLosses,
      disposed,
      highWaterMark: rendererHighWaterMark,
      initFailures,
      initializing,
      live: liveRenderers,
      webGlFallbackReason: FALLBACK_REASON,
      webGlFallbacks,
      webGlOverrides,
    },
    webGpuDevices: {
      budget: WEBGPU_DEVICE_BUDGET,
      highWaterMark: webGpuDeviceHighWaterMark,
      live: liveWebGpuDevices,
      overBudget: reservedOrLiveWebGpuDevices() > WEBGPU_DEVICE_BUDGET,
      reserved: webGpuReservations,
    },
  };
}

/** Subscribes a debug observer to graphics lifecycle transitions. */
export function subscribeGraphicsRendererStats(
  callback: GraphicsStatsSubscriber,
): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/** Clears registry state. Tests only. */
export function resetGraphicsRendererRegistryForTests(): void {
  bySurface.clear();
  subscribers.clear();
  initializing = 0;
  liveRenderers = 0;
  liveWebGpuDevices = 0;
  liveWebGlRenderers = 0;
  webGpuReservations = 0;
  rendererHighWaterMark = 0;
  webGpuDeviceHighWaterMark = 0;
  created = 0;
  disposed = 0;
  webGlFallbacks = 0;
  webGlOverrides = 0;
  initFailures = 0;
  deviceLosses = 0;
  lastError = null;
  lastOverBudgetWarnMs = null;
}

function adjustSurface(
  surface: string,
  field: keyof MutableSurfaceStats,
  delta: 1 | -1,
): void {
  const stats = bySurface.get(surface) ?? {
    initializing: 0,
    webgl2: 0,
    webgpu: 0,
  };
  stats[field] += delta;
  if (stats.initializing === 0 && stats.webgl2 === 0 && stats.webgpu === 0) {
    bySurface.delete(surface);
  } else {
    bySurface.set(surface, stats);
  }
}

function reservedOrLiveWebGpuDevices(): number {
  return webGpuReservations + liveWebGpuDevices;
}

function normalizedRendererError(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const message = (value as { readonly message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown renderer error";
}

function normalizedDeviceLoss(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const info = value as {
      readonly api?: unknown;
      readonly message?: unknown;
      readonly reason?: unknown;
    };
    const api = typeof info.api === "string" ? info.api : "WebGPU";
    const reason = typeof info.reason === "string" ? ` (${info.reason})` : "";
    const message =
      typeof info.message === "string" ? info.message : "unknown reason";
    return `${api} device lost${reason}: ${message}`;
  }
  return "Unknown renderer error";
}

function maybeWarnOverBudget(): void {
  const total = reservedOrLiveWebGpuDevices();
  if (total <= WEBGPU_DEVICE_BUDGET) return;
  const nowMs = Date.now();
  if (
    lastOverBudgetWarnMs !== null &&
    nowMs - lastOverBudgetWarnMs < OVER_BUDGET_WARN_THROTTLE_MS
  ) {
    return;
  }
  lastOverBudgetWarnMs = nowMs;
  console.warn(
    `[graphics-renderer-registry] ${total} reserved or live WebGPU devices ` +
      `exceed the budget of ${WEBGPU_DEVICE_BUDGET}`,
    graphicsRendererStats(),
  );
}

function notifySubscribers(): void {
  if (subscribers.size === 0) return;
  const stats = graphicsRendererStats();
  for (const subscriber of subscribers) {
    try {
      subscriber(stats);
    } catch {
      // Debug observers must never break renderer lifecycle accounting.
    }
  }
}
