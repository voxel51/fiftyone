import { IconName } from "@voxel51/voodo";
import { PlaybackStreamBase } from "../../lib/playback/stream-base";
import type { BufferReadiness } from "../../lib/playback/types";
import GraphTile from "../../views/PlaybackTiles/GraphTile/GraphTile";
import type { MockStreamBundle, MockStreamFactoryOptions } from "./types";

/** A single sample from a multi-series mock graph stream. */
export interface MockGraphSample {
  timestampSec: number;
  /** Series values keyed by name (e.g. velocity, accel). */
  values: Record<string, number>;
}

export interface MockGraphOptions extends MockStreamFactoryOptions {
  /** Sample rate in Hz. @default 50 */
  hz?: number;
  /**
   * Map of series name → frequency in cycles/second. Each entry gets a
   * sine signal at the given frequency. Defaults to two stylized series
   * matching the existing GraphTile placeholder lines.
   */
  series?: Record<string, number>;
}

const DEFAULT_SERIES: Record<string, number> = {
  velocity: 0.7,
  accel: 1.3,
};

class MockGraphStream extends PlaybackStreamBase<MockGraphSample> {
  constructor(
    id: string,
    duration: number,
    private readonly series: Record<string, number>,
    hz: number
  ) {
    super(id, {
      blocking: false,
      duration,
      nativeStepSeconds: 1 / hz,
    });
  }

  bufferState(): BufferReadiness {
    return "ready";
  }

  prefetch(): void {
    // No-op.
  }

  getValue(time: number): MockGraphSample {
    const values: Record<string, number> = {};
    for (const [name, freq] of Object.entries(this.series)) {
      values[name] = Math.sin(time * Math.PI * 2 * freq);
    }
    return { timestampSec: time, values };
  }
}

/**
 * Build a graph-tile stream. Publishes a multi-series sample (named
 * sines) every commit — defaults are `velocity` (0.7 Hz) and `accel`
 * (1.3 Hz) to mirror the labels in the existing GraphTile placeholder.
 */
export function createMockGraphStream(opts: MockGraphOptions): MockStreamBundle {
  const {
    id,
    title = id,
    duration = 10,
    series = DEFAULT_SERIES,
    hz = 50,
  } = opts;
  if (!Number.isFinite(hz) || hz <= 0) {
    throw new Error(`mock-graph-stream: invalid hz ${hz}`);
  }
  // GraphTile doesn't yet consume per-tick samples (the chart would
  // need a rolling history). Stream still publishes data for future
  // consumers; tile renders its existing playhead-driven animation.
  const stream = new MockGraphStream(id, duration, series, hz);
  return {
    id,
    type: "graph",
    typeLabel: "Graph",
    title,
    icon: IconName.Logs,
    stream,
    Tile: GraphTile,
  };
}
