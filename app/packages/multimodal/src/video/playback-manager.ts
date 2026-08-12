import { copyVideoFramePresentation } from "./presentation";
import { VideoSeekAdmissionScheduler } from "./admission-scheduler";
import { VideoStreamEngine } from "./stream-engine";
import type {
  VideoAccessUnitReader,
  VideoEngineDependencies,
  VideoPlaybackIntent,
  VideoStreamSnapshot,
} from "./types";
import { WebCodecsH264Decoder } from "./webcodecs-decoder";

interface RegisteredEngine {
  readonly engine: VideoStreamEngine;
  references: number;
}

export interface VideoStreamLease {
  readonly getSnapshot: () => VideoStreamSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  request(intent: VideoPlaybackIntent): void;
  release(): void;
}

export interface VideoPlaybackManagerStats {
  readonly engineCount: number;
  readonly historicalSeekCount: number;
  readonly ownerCount: number;
  readonly waitingSeekCount: number;
}

const DEFAULT_DEPENDENCIES: VideoEngineDependencies = {
  copyPresentation: copyVideoFramePresentation,
  createDecoder: () => new WebCodecsH264Decoder(),
  nowMs: () => performance.now(),
};

/** Source-scoped owner of all per-stream engines and historical admission. */
export class VideoPlaybackManager {
  private closed = false;
  private readonly engines = new Map<string, RegisteredEngine>();
  private reader: VideoAccessUnitReader | null = null;
  private readonly scheduler: VideoSeekAdmissionScheduler;

  constructor(
    readonly sourceKey: string,
    private readonly dependencies: VideoEngineDependencies = DEFAULT_DEPENDENCIES,
    historicalSeekCapacity = 2,
  ) {
    this.scheduler = new VideoSeekAdmissionScheduler(
      historicalSeekCapacity,
      dependencies.nowMs,
    );
  }

  get isClosed(): boolean {
    return this.closed;
  }

  setReader(reader: VideoAccessUnitReader | null): void {
    if (!this.closed) this.reader = reader;
  }

  acquire(stream: string): VideoStreamLease {
    if (this.closed) throw new Error("Video playback manager closed");
    let registered = this.engines.get(stream);
    if (!registered) {
      registered = {
        engine: new VideoStreamEngine(
          stream,
          this.scheduler,
          () => this.reader,
          this.dependencies,
        ),
        references: 0,
      };
      this.engines.set(stream, registered);
    }
    registered.references += 1;
    const owned = registered;
    let released = false;
    return {
      getSnapshot: owned.engine.getSnapshot,
      release: () => {
        if (released) return;
        released = true;
        const current = this.engines.get(stream);
        if (current !== owned) return;
        current.references -= 1;
        if (current.references > 0) return;
        current.engine.close();
        this.engines.delete(stream);
      },
      request: (intent) => owned.engine.request(intent),
      subscribe: owned.engine.subscribe,
    };
  }

  stats(): VideoPlaybackManagerStats {
    let ownerCount = 0;
    for (const engine of this.engines.values()) ownerCount += engine.references;
    return {
      engineCount: this.engines.size,
      historicalSeekCount: this.scheduler.activeCount,
      ownerCount,
      waitingSeekCount: this.scheduler.waitingCount,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reader = null;
    for (const registered of this.engines.values()) registered.engine.close();
    this.engines.clear();
    this.scheduler.close();
  }
}
