import { IconName } from "@voxel51/voodo";
import { PlaybackStreamBase } from "../../lib/playback/stream-base";
import type { BufferReadiness } from "../../lib/playback/types";
import SceneTile from "../../views/PlaybackTiles/SceneTile/SceneTile";
import type { MockStreamBundle, MockStreamFactoryOptions } from "./types";

/** Pose payload for a single tracked object in a scene. */
export interface MockScenePose {
  timestampSec: number;
  position: [number, number, number];
  /** Rotation about the Y axis in radians. */
  rotation: number;
}

export interface MockSceneOptions extends MockStreamFactoryOptions {
  /** Radius of the synthetic orbit (meters). @default 2 */
  radius?: number;
  /** Orbit period in seconds. @default 6 */
  periodSec?: number;
}

class MockSceneStream extends PlaybackStreamBase<MockScenePose> {
  constructor(
    id: string,
    duration: number,
    private readonly radius: number,
    private readonly periodSec: number
  ) {
    // Scene mock publishes at 30 Hz — matches the typical render loop
    // cadence; nothing in the scene is intrinsically rate-limited.
    super(id, {
      blocking: false,
      duration,
      nativeStepSeconds: 1 / 30,
    });
  }

  bufferState(): BufferReadiness {
    return "ready";
  }

  prefetch(): void {
    // No-op.
  }

  getValue(time: number): MockScenePose {
    const u = (time % this.periodSec) / this.periodSec;
    const angle = u * Math.PI * 2;
    return {
      timestampSec: time,
      position: [
        Math.cos(angle) * this.radius,
        Math.sin(angle * 2) * 0.6,
        Math.sin(angle) * this.radius,
      ],
      rotation: angle,
    };
  }
}

/**
 * Build a scene-tile stream. Publishes a single object pose orbiting a
 * circular path — pairs with `SceneTile`'s animated box visualization
 * but as actual stream data instead of a closed-form animation in the
 * tile.
 */
export function createMockSceneStream(opts: MockSceneOptions): MockStreamBundle {
  const { id, title = id, duration = 10, radius = 2, periodSec = 6 } = opts;
  if (!Number.isFinite(periodSec) || periodSec <= 0) {
    throw new Error(`mock-scene-stream: invalid periodSec ${periodSec}`);
  }
  const stream = new MockSceneStream(id, duration, radius, periodSec);
  return {
    id,
    type: "scene",
    typeLabel: "3D Scene",
    title,
    icon: IconName.Workspaces,
    stream,
    Tile: SceneTile,
  };
}
