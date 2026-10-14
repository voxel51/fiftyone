import type { Track } from "@fiftyone/playback";
import type { LabelData } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import { singletonAddressId } from "../streams/framesData";
import {
  buildTracksFromIndex,
  parseSubTrackId,
  type FrameOverlay,
  type IndexInstance,
} from "./frameTracks";

const FPS = 30;

function indexInstance(over: Partial<IndexInstance> = {}): IndexInstance {
  return {
    instanceId: "inst-a",
    classLabel: "person",
    persistedIndex: 1,
    instance: { _cls: "Instance", _id: "inst-a" },
    segments: [[1, 3]],
    keyframes: [],
    ...over,
  };
}

function det(over: Partial<LabelData> = {}): LabelData {
  return {
    _id: "doc",
    _cls: "Detection",
    label: "person",
    index: 1,
    instance: { _cls: "Instance", _id: "inst-a" },
    keyframe: false,
    ...over,
  } as LabelData;
}

function build(
  index: IndexInstance[],
  overlay: FrameOverlay = new Map(),
  dynamicAttributes: string[] = [],
) {
  return buildTracksFromIndex({
    path: "frames.detections",
    index,
    overlay,
    fps: FPS,
    resolveColor: () => "#fff",
    dynamicAttributes,
  });
}

function subTracks(tracks: Track[]) {
  return tracks.filter((t) => parseSubTrackId(t.id) !== null);
}

function presence(track: Track) {
  return track.events.filter((e) => e.label === "in frame");
}

function keyframes(track: Track) {
  return track.events.filter((e) => e.label === "Keyframe");
}

describe("buildTracksFromIndex", () => {
  it("builds tracks from the baseline index with no overlay", () => {
    const tracks = build([
      indexInstance({
        segments: [
          [1, 3],
          [5, 6],
        ],
        keyframes: [2],
      }),
    ]);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe("inst-a");

    const bars = presence(tracks[0]);
    expect(bars).toHaveLength(2);
    expect(bars[0].startSec).toBeCloseTo(0);
    expect(bars[0].endSec).toBeCloseTo(3 / FPS);
    expect(bars[1].startSec).toBeCloseTo(4 / FPS);
    expect(bars[1].endSec).toBeCloseTo(6 / FPS);

    const kf = keyframes(tracks[0]);
    expect(kf).toHaveLength(1);
    expect(kf[0].startSec).toBeCloseTo(1 / FPS);
  });

  it("adds an instance present only in the overlay (newly drawn track)", () => {
    const overlay: FrameOverlay = new Map([
      [4, [det({ instance: { _cls: "Instance", _id: "inst-b" } })]],
      [5, [det({ instance: { _cls: "Instance", _id: "inst-b" } })]],
    ]);

    const tracks = build([indexInstance()], overlay);
    const ids = tracks.map((t) => t.id).sort();

    expect(ids).toEqual(["inst-a", "inst-b"]);
    const b = tracks.find((t) => t.id === "inst-b")!;
    const bars = presence(b);
    expect(bars).toHaveLength(1);
    expect(bars[0].startSec).toBeCloseTo(3 / FPS);
    expect(bars[0].endSec).toBeCloseTo(5 / FPS);
  });

  it("shrinks presence where the overlay deleted the label at a dirty frame", () => {
    // Frame 2 is dirty and the overlay no longer has inst-a there.
    const overlay: FrameOverlay = new Map([[2, []]]);

    const tracks = build(
      [indexInstance({ segments: [[1, 3]], keyframes: [2] })],
      overlay,
    );

    const bars = presence(tracks[0]);
    expect(bars).toHaveLength(2);
    expect(bars[0].endSec).toBeCloseTo(1 / FPS);
    expect(bars[1].startSec).toBeCloseTo(2 / FPS);
    // The baseline keyframe at the now-dirty, now-absent frame is gone.
    expect(keyframes(tracks[0])).toHaveLength(0);
  });

  it("takes class and index from the live overlay label when present", () => {
    const overlay: FrameOverlay = new Map([
      [2, [det({ label: "car", index: 9, keyframe: true })]],
    ]);

    const tracks = build(
      [indexInstance({ classLabel: "person", persistedIndex: 1 })],
      overlay,
    );

    // Row label combines the live class with its persisted index.
    expect(tracks[0].label).toBe("car 9");
    // The keyframe flag from the dirty overlay frame shows.
    expect(keyframes(tracks[0])).toHaveLength(1);
  });

  it("drops an instance the overlay fully removed", () => {
    const overlay: FrameOverlay = new Map([
      [1, []],
      [2, []],
      [3, []],
    ]);

    expect(build([indexInstance({ segments: [[1, 3]] })], overlay)).toEqual([]);
  });

  it("builds one row named after the field for a Segmentation", () => {
    const id = singletonAddressId("frames.seg");
    const resolveColor = vi.fn(() => "#fff");
    const overlay: FrameOverlay = new Map([
      [5, [{ _id: id, _cls: "Segmentation" } as LabelData]],
    ]);

    const tracks = buildTracksFromIndex({
      path: "frames.seg",
      index: [
        indexInstance({
          instanceId: id,
          classLabel: null,
          persistedIndex: null,
          instance: null,
          segments: [
            [1, 2],
            [4, 4],
          ],
        }),
      ],
      overlay,
      fps: FPS,
      resolveColor,
      dynamicAttributes: [],
    });

    expect(tracks).toHaveLength(1);
    expect(tracks[0].label).toBe("seg");
    // the field's color, not a class's
    expect(resolveColor).toHaveBeenCalledWith(null, "frames.seg");
    // frames 4 (index) and 5 (overlay) coalesce; frame 3 stays a hole
    expect(
      presence(tracks[0]).map(({ startSec, endSec }) => [startSec, endSec]),
    ).toEqual([
      [0 / FPS, 2 / FPS],
      [3 / FPS, 5 / FPS],
    ]);
  });
});

describe("buildTracksFromIndex dynamic-attribute sub-tracks", () => {
  it("emits a sub-track from the index value runs after its parent", () => {
    const tracks = build(
      [
        indexInstance({
          segments: [[1, 4]],
          attributeSegments: {
            signal: [
              [1, 2, "off"],
              [3, 4, "left"],
            ],
          },
        }),
      ],
      new Map(),
      ["signal"],
    );

    expect(tracks).toHaveLength(2);
    const [parent, child] = tracks;
    expect(parent.id).toBe("inst-a");
    expect(parseSubTrackId(child.id)).toEqual({
      parentId: "inst-a",
      attr: "signal",
    });
    expect(child.events.map((e) => e.label)).toEqual(["off", "left"]);
    expect(child.events[0]).toMatchObject({
      startSec: 0,
      endSec: 2 / FPS,
      data: { value: "off" },
    });
  });

  it("overlays the live value at a dirty frame onto the baseline runs", () => {
    // Baseline says "off" across 1–4; the overlay edits frame 3 to "left",
    // so the run splits at the dirty frame without a whole-clip walk.
    const overlay: FrameOverlay = new Map([
      [3, [det({ signal: "left" } as Partial<LabelData>)]],
    ]);

    const tracks = build(
      [
        indexInstance({
          segments: [[1, 4]],
          attributeSegments: { signal: [[1, 4, "off"]] },
        }),
      ],
      overlay,
      ["signal"],
    );

    const [, child] = tracks;
    expect(child.events.map((e) => e.label)).toEqual(["off", "left", "off"]);
    // Each event carries its value plus the parent's field path, so a sub-track
    // row click resolves the parent's `(path, instanceId)` ref.
    expect(child.events.map((e) => e.data)).toEqual([
      { value: "off", path: "frames.detections" },
      { value: "left", path: "frames.detections" },
      { value: "off", path: "frames.detections" },
    ]);
  });

  it("emits no sub-tracks when no dynamic attributes are requested", () => {
    const tracks = build([
      indexInstance({ attributeSegments: { signal: [[1, 3, "off"]] } }),
    ]);

    expect(subTracks(tracks)).toHaveLength(0);
  });
});
