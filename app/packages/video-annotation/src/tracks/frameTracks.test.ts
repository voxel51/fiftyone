import { describe, expect, it, vi } from "vitest";
import { buildPerInstanceTracks, type PerInstanceLabel } from "./frameTracks";
import type { SyntheticBox } from "../streams/SyntheticLabelStream";
import type { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";

const FPS = 30;

/**
 * Minimal stream stub: `buildPerInstanceTracks` only reads `totalFrames`,
 * `fps`, and `getValue(time) -> { detections }`. `frames` maps a 1-indexed
 * frame number to the detections present on it.
 */
function makeStream(
  totalFrames: number,
  frames: Record<number, Partial<SyntheticBox>[]>
): VideoFrameLabelsStream {
  return {
    totalFrames,
    fps: FPS,
    getValue: (time: number) => {
      const frame = Math.round(time * FPS) + 1;
      return { detections: (frames[frame] ?? []) as SyntheticBox[] };
    },
  } as unknown as VideoFrameLabelsStream;
}

describe("buildPerInstanceTracks", () => {
  it("resolves row color from the real detection index + instance, not the display ordinal", () => {
    // An instance-keyed box whose persisted index (7) differs from the
    // display ordinal it would be assigned. The color hash must use 7 +
    // the instance so it matches the bbox overlay under color-by-instance.
    const det: Partial<SyntheticBox> = {
      id: "instance-abc123",
      label: "person",
      index: 7,
      instance: { _cls: "Instance", _id: "abc123" },
      keyframe: false,
      bounding_box: [0, 0, 0.1, 0.1],
    };
    const stream = makeStream(2, { 1: [det], 2: [det] });

    const resolveColor = vi.fn<(l: PerInstanceLabel) => string>(() => "#fff");
    const tracks = buildPerInstanceTracks({ stream, resolveColor });

    expect(tracks).toHaveLength(1);
    expect(resolveColor).toHaveBeenCalledWith({
      label: "person",
      index: 7,
      instance: { _cls: "Instance", _id: "abc123" },
    });
    // Display text still uses the persisted index as the ordinal.
    expect(tracks[0].label).toBe("person 7");
  });

  it("passes the numeric index with no instance for legacy track-keyed boxes", () => {
    const det: Partial<SyntheticBox> = {
      id: "track-3",
      label: "vehicle",
      index: 3,
      keyframe: false,
      bounding_box: [0, 0, 0.1, 0.1],
    };
    const stream = makeStream(1, { 1: [det] });

    const resolveColor = vi.fn<(l: PerInstanceLabel) => string>(() => "#fff");
    buildPerInstanceTracks({ stream, resolveColor });

    expect(resolveColor).toHaveBeenCalledWith({
      label: "vehicle",
      index: 3,
      instance: undefined,
    });
  });
});
