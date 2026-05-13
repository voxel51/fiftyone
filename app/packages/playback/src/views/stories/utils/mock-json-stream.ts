import { IconName } from "@voxel51/voodo";
import React from "react";
import { PlaybackStreamBase } from "../../../lib/playback/stream-base";
import type { BufferReadiness } from "../../../lib/playback/types";
import JsonDataTile from "../../tiles/test_tiles/JsonDataTile/JsonDataTile";
import type { MockStreamBundle, MockStreamFactoryOptions } from "./types";

/** Mock metadata payload — looks like a sensor / system snapshot. */
export interface MockJsonRecord {
  timestamp: number;
  pose: { x: number; y: number; z: number; yaw: number };
  velocity: { linear: number; angular: number };
  status: "ok" | "degraded" | "buffering";
}

export interface MockJsonOptions extends MockStreamFactoryOptions {
  /** Sample rate in Hz. @default 10 */
  hz?: number;
}

class MockJsonStream extends PlaybackStreamBase<MockJsonRecord> {
  constructor(id: string, duration: number, hz: number, title: string) {
    super(id, {
      blocking: false,
      duration,
      nativeStepSeconds: 1 / hz,
      tile: {
        title,
        icon: IconName.JSON,
        Tile: () => React.createElement(JsonDataTile, { streamId: id }),
      },
    });
  }

  bufferState(): BufferReadiness {
    return "ready";
  }

  prefetch(): void {
    // No-op.
  }

  getValue(time: number): MockJsonRecord {
    // Slightly varying values so consumers see live updates.
    const x = Math.sin(time * 0.3) * 4;
    const y = Math.cos(time * 0.2) * 3;
    return {
      timestamp: Number(time.toFixed(3)),
      pose: {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        z: 0.83,
        yaw: Number((Math.sin(time * 0.1) * Math.PI).toFixed(4)),
      },
      velocity: {
        linear: Number((1 + Math.sin(time) * 0.5).toFixed(2)),
        angular: Number((Math.cos(time * 0.7) * 0.05).toFixed(3)),
      },
      status: "ok",
    };
  }
}

/**
 * Build a JSON-tile stream. Publishes a small system-status record
 * (pose, velocity, status) per commit. Pairs with `JsonDataTile`,
 * which currently renders a placeholder object — once it consumes
 * `useStream(id)`, the rendered JSON will track the playhead.
 */
export function createMockJsonStream(opts: MockJsonOptions): MockStreamBundle {
  const { id, title = id, duration = 10, hz = 10 } = opts;
  const stream = new MockJsonStream(id, duration, hz, title);
  return {
    id,
    kind: "json",
    title,
    icon: IconName.JSON,
    stream,
    Tile: stream.tile!.Tile,
  };
}
