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

  it("assigns instance-only ordinals as the next free integer above the per-class max", () => {
    const tracked: Partial<SyntheticBox> = {
      id: "track-3",
      label: "person",
      index: 3,
      bounding_box: [0, 0, 0.1, 0.1],
    };
    const drawn: Partial<SyntheticBox> = {
      id: "instance-fresh",
      label: "person",
      instance: { _cls: "Instance", _id: "fresh" },
      bounding_box: [0, 0, 0.1, 0.1],
    };
    const stream = makeStream(1, { 1: [tracked, drawn] });

    const tracks = buildPerInstanceTracks({
      stream,
      resolveColor: () => "#fff",
    });

    // Sorted by ordinal: persisted 3, then the next free (4).
    expect(tracks.map((t) => t.label)).toEqual(["person 3", "person 4"]);
  });

  it("emits one presence interval per contiguous run", () => {
    const det: Partial<SyntheticBox> = {
      id: "track-1",
      label: "person",
      index: 1,
      bounding_box: [0, 0, 0.1, 0.1],
    };
    // Present 1-2, absent 3, present 4-5.
    const stream = makeStream(5, { 1: [det], 2: [det], 4: [det], 5: [det] });

    const tracks = buildPerInstanceTracks({
      stream,
      resolveColor: () => "#fff",
    });

    const intervals = tracks[0].events.filter((e) => e.endSec !== undefined);
    expect(intervals).toHaveLength(2);
  });
});
