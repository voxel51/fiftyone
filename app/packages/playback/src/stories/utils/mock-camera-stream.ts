import { IconName } from "@voxel51/voodo";
import { PlaybackStreamBase } from "../../lib/playback/stream-base";
import type { BufferReadiness } from "../../lib/playback/types";
import CameraTile from "../../views/PlaybackTiles/CameraTile/CameraTile";
import type { MockStreamBundle, MockStreamFactoryOptions } from "./types";

/** Synthetic "frame" the mock camera publishes each commit. */
export interface MockCameraFrame {
  frameNumber: number;
  timestampSec: number;
  /** Pretend image label — a real impl would put a URL or ImageBitmap here. */
  label: string;
}

export interface MockCameraOptions extends MockStreamFactoryOptions {
  /** Sample rate in frames per second. @default 30 */
  fps?: number;
}

class MockCameraStream extends PlaybackStreamBase<MockCameraFrame> {
  constructor(
    id: string,
    duration: number,
    private readonly fps: number
  ) {
    // Camera is non-blocking by default for demo purposes — a real
    // implementation would block until the frame at the target time
    // has been fetched. `nativeStepSeconds = 1/fps` so the engine's
    // step interval lands on actual frame boundaries.
    super(id, {
      blocking: false,
      duration,
      nativeStepSeconds: 1 / fps,
    });
  }

  bufferState(): BufferReadiness {
    return "ready";
  }

  prefetch(): void {
    // No-op — mock data is computed lazily.
  }

  getValue(time: number): MockCameraFrame {
    const frameNumber = Math.floor(time * this.fps);
    return {
      frameNumber,
      timestampSec: time,
      label: `${this.id} #${frameNumber}`,
    };
  }
}

/**
 * Build a camera-tile stream. Publishes a synthetic "frame number +
 * timestamp" payload every commit; the existing `CameraTile` body just
 * renders a placeholder, but `useStream("<id>")` consumers will see the
 * live payload.
 */
export function createMockCameraStream(opts: MockCameraOptions): MockStreamBundle {
  const { id, title = id, duration = 10, fps = 30 } = opts;
  const stream = new MockCameraStream(id, duration, fps);
  return {
    id,
    type: "camera",
    typeLabel: "Camera",
    title,
    icon: IconName.GridView,
    stream,
    Tile: CameraTile,
  };
}
