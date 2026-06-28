import type { Track } from "@fiftyone/playback";
import type { LabelData } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
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
    // Inclusive frame run [A, B] → startSec (A-1)/fps, endSec B/fps,
    // matching the walk-based builder and `resolveTrackExtentEdit`.
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
    // Frame run [1,1] → endSec 1/fps; [3,3] → endSec 3/fps.
    expect(bars[0].endSec).toBeCloseTo(1 / FPS);
    expect(bars[1].startSec).toBeCloseTo(2 / FPS);
    expect(bars[1].endSec).toBeCloseTo(3 / FPS);
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

  // Regression: the index path's seconds mapping must round-trip through the
  // resize handler. Previously `end: (B - 1) / fps` shipped `endSec`
  // one frame short, and `resolveTrackExtentEdit`'s `lastFrameOf(endSec)`
  // saw `B - 1` — dragging the end handle back trimmed `B - 1` and stranded
  // a phantom at `B`; dragging forward extended onto `B` itself (a no-op the
  // user perceived as "snap back").
  it("end-handle seconds round-trip to the inclusive last frame", () => {
    const tracks = build([indexInstance({ segments: [[1, 5]] })]);
    const bars = presence(tracks[0]);
    expect(bars).toHaveLength(1);

    // Inversion mirrors `lastFrameOf` in `trackExtentEdit.ts`.
    const lastFrame = Math.round((bars[0].endSec as number) * FPS);
    expect(lastFrame).toBe(5);
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

  // B21: marking a dynamic attribute (e.g. `occluded`) on a frame must not
  // strip the parent track's keyframe diamonds. The overlay covers every
  // loaded frame (the engine's frame store post-`warmupAll`), so the merge's
  // `dirtySet` includes EVERY frame the instance is present on. Previously
  // the merge filtered every baseline keyframe out as "dirty" and replaced
  // them with only the frames whose overlay label carried a truthy
  // `keyframe` field — so any overlay label missing the `keyframe` key (the
  // sidebar's commit path stamps from `overlay.label`, which doesn't carry
  // `keyframe`; updateLabel merges, but the resulting label may still echo
  // an unset flag on frames the user never marked) caused the diamonds to
  // disappear from the lane.
  //
  // The fix preserves a baseline keyframe at a dirty frame UNLESS the overlay
  // explicitly says `keyframe: false` (a removal) OR the instance is absent
  // there. Pure "no opinion" overlay frames fall through to baseline.
  it("preserves baseline keyframes at dirty frames where the overlay is silent about the keyframe flag", () => {
    // Baseline says the instance has a keyframe at F=2. The overlay covers
    // F=1..3 (e.g. a `warmupAll` clip) but its labels carry no `keyframe`
    // field at all (typical post-attribute-write shape: `{label, index,
    // bounding_box, instance, occluded}` — the sidebar's overlay.label has
    // no `keyframe`, and the engine's merged result need not surface one).
    const silent = (extra: Partial<LabelData> = {}): LabelData => {
      const label = det(extra) as LabelData & { keyframe?: boolean };
      delete label.keyframe;
      return label;
    };
    const overlay: FrameOverlay = new Map([
      [1, [silent()]],
      [2, [silent({ occluded: true } as Partial<LabelData>)]],
      [3, [silent()]],
    ]);

    const tracks = build(
      [indexInstance({ segments: [[1, 3]], keyframes: [2] })],
      overlay,
      ["occluded"],
    );

    const kf = keyframes(tracks[0]);
    expect(kf).toHaveLength(1);
    expect(kf[0].startSec).toBeCloseTo(1 / FPS);
  });

  it("still drops a baseline keyframe when the overlay explicitly clears it (keyframe: false)", () => {
    // The opposite direction: a user-driven keyframe-toggle off should still
    // make the diamond vanish. We keep the explicit-removal semantics so
    // `markKeyframe` (toolbar) still rounds-trips.
    const overlay: FrameOverlay = new Map([
      [1, [det({ keyframe: false })]],
      [2, [det({ keyframe: false })]],
      [3, [det({ keyframe: false })]],
    ]);

    const tracks = build(
      [indexInstance({ segments: [[1, 3]], keyframes: [2] })],
      overlay,
    );

    expect(keyframes(tracks[0])).toHaveLength(0);
  });

  it("dirty-overlay keyframe at a frame the baseline didn't have still surfaces", () => {
    // Sanity: a freshly drawn track's keyframes are overlay-only.
    const overlay: FrameOverlay = new Map([
      [1, [det({ keyframe: true })]],
      [2, [det({ keyframe: false })]],
      [3, [det({ keyframe: true })]],
    ]);

    const tracks = build([], overlay);
    const kf = keyframes(tracks[0]);
    expect(kf.map((e) => e.startSec)).toEqual([0, 2 / FPS]);
  });
});
