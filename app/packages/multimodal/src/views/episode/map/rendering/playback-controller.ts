const DEFAULT_MAX_UPDATES_PER_SECOND = 30;

/** Timing primitives used by the map playback controller. */
export interface MapPlaybackScheduler {
  cancelAnimationFrame(frame: number): void;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
  now(): number;
  requestAnimationFrame(callback: (now: number) => void): number;
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
}

/** Configuration for a capped imperative map playback controller. */
export interface MapPlaybackControllerOptions {
  readonly maxUpdatesPerSecond?: number;
  readonly onPaint: (playheadNs: bigint | null, nowMs: number) => void;
  readonly scheduler?: MapPlaybackScheduler;
}

/**
 * Coalesces display-cadence playback notifications into a capped imperative
 * map paint. Paused seeks paint immediately; inactive surfaces retain only the
 * newest playhead and paint it once when they become visible again.
 */
export class MapPlaybackController {
  private active = true;
  private animationFrame: number | null = null;
  private disposed = false;
  private lastPaintAt = Number.NEGATIVE_INFINITY;
  private latestPlayheadNs: bigint | null = null;
  private latestVersion = 0;
  private paintedVersion = 0;
  private readonly intervalMs: number;
  private readonly onPaint: (playheadNs: bigint | null, nowMs: number) => void;
  private readonly scheduler: MapPlaybackScheduler;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MapPlaybackControllerOptions) {
    const maxUpdatesPerSecond =
      options.maxUpdatesPerSecond ?? DEFAULT_MAX_UPDATES_PER_SECOND;
    if (!Number.isFinite(maxUpdatesPerSecond) || maxUpdatesPerSecond <= 0) {
      throw new Error("maxUpdatesPerSecond must be a positive finite number");
    }
    this.intervalMs = 1_000 / maxUpdatesPerSecond;
    this.onPaint = options.onPaint;
    this.scheduler = options.scheduler ?? browserPlaybackScheduler();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelScheduledPaint();
  }

  flushLatest(): void {
    if (
      this.disposed ||
      !this.active ||
      this.latestVersion === this.paintedVersion
    ) {
      return;
    }
    this.cancelScheduledPaint();
    this.paint(this.scheduler.now());
  }

  invalidate(): void {
    if (this.disposed) return;
    this.latestVersion += 1;
    if (this.active) this.flushLatest();
  }

  setSurfaceActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (!active) {
      this.cancelScheduledPaint();
      return;
    }
    if (this.latestVersion !== this.paintedVersion) this.flushLatest();
  }

  updatePlayhead(playheadNs: bigint | null, immediate = false): void {
    if (this.disposed) return;
    this.latestPlayheadNs = playheadNs;
    this.latestVersion += 1;
    if (!this.active) return;
    if (immediate) {
      this.flushLatest();
      return;
    }
    this.schedulePaint();
  }

  private cancelScheduledPaint(): void {
    if (this.animationFrame !== null) {
      this.scheduler.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private paint(nowMs: number): void {
    if (this.disposed || !this.active) return;
    const version = this.latestVersion;
    this.lastPaintAt = nowMs;
    try {
      this.onPaint(this.latestPlayheadNs, nowMs);
    } catch (error) {
      console.error("Failed to paint the episode map playback frame", error);
    } finally {
      this.paintedVersion = version;
    }
    if (this.latestVersion !== version) {
      this.schedulePaint();
    }
  }

  private scheduleAnimationFrame(): void {
    if (this.animationFrame !== null || this.disposed || !this.active) return;
    this.animationFrame = this.scheduler.requestAnimationFrame((nowMs) => {
      this.animationFrame = null;
      if (this.latestVersion !== this.paintedVersion) {
        this.paint(nowMs);
      }
    });
  }

  private schedulePaint(): void {
    if (
      this.disposed ||
      !this.active ||
      this.animationFrame !== null ||
      this.timer !== null ||
      this.latestVersion === this.paintedVersion
    ) {
      return;
    }
    const delayMs = Math.max(
      0,
      this.lastPaintAt + this.intervalMs - this.scheduler.now(),
    );
    if (delayMs === 0) {
      this.scheduleAnimationFrame();
      return;
    }
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      this.scheduleAnimationFrame();
    }, delayMs);
  }
}

function browserPlaybackScheduler(): MapPlaybackScheduler {
  return {
    cancelAnimationFrame: (frame) => cancelAnimationFrame(frame),
    clearTimeout: (timer) => clearTimeout(timer),
    now: () => performance.now(),
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  };
}
