import { IconName } from "@voxel51/voodo";
import { PlaybackStreamBase } from "../../../lib/playback/stream-base";
import type { BufferReadiness } from "../../../lib/playback/types";
import LidarTile from "../../tiles/test_tiles/LidarTile/LidarTile";
import type { MockStreamBundle, MockStreamFactoryOptions } from "./types";

/** Synthetic point cloud the mock lidar publishes each commit. */
export interface MockLidarFrame {
  timestampSec: number;
  /** Array of [x, y, z] points in meters relative to the sensor. */
  points: Array<[number, number, number]>;
}

export interface MockLidarOptions extends MockStreamFactoryOptions {
  /** Sample rate in scans per second. @default 10 */
  hz?: number;
  /** Number of points per scan. @default 64 */
  pointsPerScan?: number;
}

class MockLidarStream extends PlaybackStreamBase<MockLidarFrame> {
  constructor(
    id: string,
    duration: number,
    private readonly pointsPerScan: number,
    hz: number,
    title: string
  ) {
    super(id, {
      blocking: false,
      duration,
      nativeStepSeconds: 1 / hz,
      tile: {
        kind: "lidar",
        kindLabel: "Lidar",
        title,
        icon: IconName.Embeddings,
        Tile: LidarTile,
      },
    });
  }

  bufferState(): BufferReadiness {
    return "ready";
  }

  prefetch(): void {
    // No-op.
  }

  getValue(time: number): MockLidarFrame {
    // Generate a synthetic point ring that rotates with time so the
    // data is visibly distinct frame-to-frame.
    const points: Array<[number, number, number]> = [];
    const baseAngle = time * 0.5;
    for (let i = 0; i < this.pointsPerScan; i++) {
      const u = i / this.pointsPerScan;
      const angle = baseAngle + u * Math.PI * 2;
      const r = 2 + Math.sin(angle * 3) * 0.4;
      points.push([
        Math.cos(angle) * r,
        Math.sin(angle * 2) * 0.3,
        Math.sin(angle) * r,
      ]);
    }
    return { timestampSec: time, points };
  }
}

/**
 * Build a lidar-tile stream. The published payload is a synthetic ring
 * of points that rotates with playback time — purely visual mock data
 * so the demo has something time-varying to render once tiles start
 * consuming `useStream`.
 */
export function createMockLidarStream(opts: MockLidarOptions): MockStreamBundle {
  const { id, title = id, duration = 10, pointsPerScan = 64, hz = 10 } = opts;
  const stream = new MockLidarStream(id, duration, pointsPerScan, hz, title);
  return {
    id,
    kind: "lidar",
    title,
    icon: IconName.Embeddings,
    stream,
    Tile: stream.tile!.Tile,
  };
}
