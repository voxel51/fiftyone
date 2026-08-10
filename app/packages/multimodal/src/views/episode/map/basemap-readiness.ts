export const BASEMAP_READINESS_TIMEOUT_MS = 8_000;
export const BASEMAP_PROVIDER_ERROR_LIMIT = 3;
export const BASEMAP_RETRY_DELAYS_MS = [500, 1_500] as const;

interface BasemapEventLike {
  readonly coord?: unknown;
  readonly error?: { readonly sourceId?: unknown };
  readonly isSourceLoaded?: unknown;
  readonly source?: { readonly id?: unknown };
  readonly sourceDataType?: unknown;
  readonly sourceId?: unknown;
  readonly tile?: { readonly source?: unknown } | unknown;
}

interface BasemapReadinessScheduler {
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
}

/** One provider/style attempt's monotonic first-tile readiness gate. */
export class BasemapReadinessGate {
  private disposed = false;
  private failed = false;
  private providerErrorCount = 0;
  private ready = false;
  private readonly sourceIds: ReadonlySet<string>;
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  constructor({
    onFailure,
    onReady,
    scheduler = browserScheduler,
    sourceIds,
    timeoutMs = BASEMAP_READINESS_TIMEOUT_MS,
  }: {
    readonly onFailure: (reason: "provider-errors" | "timeout") => void;
    readonly onReady: () => void;
    readonly scheduler?: BasemapReadinessScheduler;
    readonly sourceIds: readonly string[];
    readonly timeoutMs?: number;
  }) {
    this.sourceIds = new Set(sourceIds);
    this.onFailure = onFailure;
    this.onReady = onReady;
    this.clearWatchdog = () => {
      if (this.watchdog === undefined) return;
      scheduler.clearTimeout(this.watchdog);
      this.watchdog = undefined;
    };
    if (this.sourceIds.size === 0) {
      this.ready = true;
      onReady();
      return;
    }
    this.watchdog = scheduler.setTimeout(() => {
      this.watchdog = undefined;
      if (this.disposed || this.ready || this.failed) return;
      this.failed = true;
      onFailure("timeout");
    }, timeoutMs);
  }

  handleError(event: unknown): void {
    if (this.disposed || this.ready || this.failed) return;
    if (!basemapEventSourceId(event, this.sourceIds)) return;
    this.providerErrorCount += 1;
    if (this.providerErrorCount < BASEMAP_PROVIDER_ERROR_LIMIT) return;
    this.failed = true;
    this.clearWatchdog();
    this.onFailure("provider-errors");
  }

  handleSourceData(event: unknown): void {
    if (this.disposed || this.ready || this.failed) return;
    const sourceId = basemapEventSourceId(event, this.sourceIds);
    if (!sourceId || !isFirstTileSuccess(event)) return;
    this.ready = true;
    this.clearWatchdog();
    this.onReady();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearWatchdog();
  }

  private clearWatchdog: () => void = () => undefined;
  private readonly onFailure: (reason: "provider-errors" | "timeout") => void;
  private readonly onReady: () => void;
}

/** Delay for an automatic retry index, or null after the bounded attempts. */
export function basemapRetryDelayMs(retryIndex: number): number | null {
  return BASEMAP_RETRY_DELAYS_MS[retryIndex] ?? null;
}

function basemapEventSourceId(
  event: unknown,
  activeSourceIds: ReadonlySet<string>,
): string | null {
  if (!event || typeof event !== "object") return null;
  const candidate = event as BasemapEventLike;
  const tileSource =
    candidate.tile && typeof candidate.tile === "object"
      ? (candidate.tile as { readonly source?: unknown }).source
      : undefined;
  for (const value of [
    candidate.sourceId,
    candidate.source?.id,
    candidate.error?.sourceId,
    tileSource,
  ]) {
    if (typeof value === "string" && activeSourceIds.has(value)) return value;
  }
  return null;
}

function isFirstTileSuccess(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const candidate = event as BasemapEventLike;
  return (
    candidate.sourceDataType === "content" &&
    (candidate.tile !== undefined ||
      candidate.coord !== undefined ||
      candidate.isSourceLoaded === true)
  );
}

const browserScheduler: BasemapReadinessScheduler = {
  clearTimeout: (timer) => clearTimeout(timer),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};
