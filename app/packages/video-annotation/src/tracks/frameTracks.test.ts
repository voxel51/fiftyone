import type { LabelData } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import {
  buildPerInstanceTracks,
  type FrameLabelReader,
  type PerInstanceLabel,
} from "./frameTracks";

const FPS = 30;
const SAMPLE = "sample-1";
const PATH = "frames.detections";

type ColorResolver = (l: PerInstanceLabel, path: string) => string;

/**
 * Minimal engine stub: `buildPerInstanceTracks` only calls
 * `listLabels({ sample, path, frame })`. `frames` maps a 1-indexed frame
 * number to the labels the engine projects for it (path-agnostic).
 */
function makeEngine(frames: Record<number, LabelData[]>): FrameLabelReader {
  return {
    listLabels: ({ frame }) => (frame ? frames[frame] ?? [] : []),
  };
}

/**
 * Path-aware engine stub for multi-field tests: `byPath` maps a field path to
 * its per-frame labels.
 */
function makeMultiFieldEngine(
  byPath: Record<string, Record<number, LabelData[]>>
): FrameLabelReader {
  return {
    listLabels: ({ path, frame }) => (frame ? byPath[path]?.[frame] ?? [] : []),
  };
}

function build(
  totalFrames: number,
  frames: Record<number, LabelData[]>,
  resolveColor: ColorResolver = () => "#fff"
) {
  return buildPerInstanceTracks({
    engine: makeEngine(frames),
    sample: SAMPLE,
    paths: [PATH],
    totalFrames,
    fps: FPS,
    resolveColor,
  });
}

describe("buildPerInstanceTracks", () => {
  it("resolves row color from the real detection index + instance, not the display ordinal", () => {
    // An instance-keyed box whose persisted index (7) differs from the
    // display ordinal it would be assigned. The color hash must use 7 +
    // the instance so it matches the bbox overlay under color-by-instance.
    const det: LabelData = {
      _id: "doc-1",
      _cls: "Detection",
      label: "person",
      index: 7,
      instance: { _cls: "Instance", _id: "abc123" },
      keyframe: false,
    };

    const resolveColor = vi.fn<ColorResolver>(() => "#fff");
    const tracks = build(2, { 1: [det], 2: [det] }, resolveColor);

    expect(tracks).toHaveLength(1);
    // Track id IS the engine instanceId (instance._id), no synthetic prefix.
    expect(tracks[0].id).toBe("abc123");
    expect(resolveColor).toHaveBeenCalledWith(
      {
        label: "person",
        index: 7,
        instance: { _cls: "Instance", _id: "abc123" },
      },
      PATH
    );
    // Display text still uses the persisted index as the ordinal.
    expect(tracks[0].label).toBe("person 7");
  });

  it("addresses legacy instance-less detections by their doc _id", () => {
    const det: LabelData = {
      _id: "doc-3",
      _cls: "Detection",
      label: "vehicle",
      index: 3,
      keyframe: false,
    };

    const resolveColor = vi.fn<ColorResolver>(() => "#fff");
    const tracks = build(1, { 1: [det] }, resolveColor);

    expect(tracks[0].id).toBe("doc-3");
    expect(resolveColor).toHaveBeenCalledWith(
      {
        label: "vehicle",
        index: 3,
        instance: null,
      },
      PATH
    );
  });

  it("assigns instance-only ordinals as the next free integer above the per-class max", () => {
    const tracked: LabelData = {
      _id: "doc-a",
      _cls: "Detection",
      label: "person",
      index: 3,
      instance: { _cls: "Instance", _id: "tracked" },
    };
    const drawn: LabelData = {
      _id: "doc-b",
      _cls: "Detection",
      label: "person",
      instance: { _cls: "Instance", _id: "fresh" },
    };

    const tracks = build(1, { 1: [tracked, drawn] });

    // Sorted by ordinal: persisted 3, then the next free (4).
    expect(tracks.map((t) => t.label)).toEqual(["person 3", "person 4"]);
  });

  it("builds a track per instance across multiple fields, colored by each field's path", () => {
    const POLY_PATH = "frames.polylines";
    const box: LabelData = {
      _id: "doc-box",
      _cls: "Detection",
      label: "vehicle",
      index: 1,
      instance: { _cls: "Instance", _id: "box-inst" },
    };
    const poly: LabelData = {
      _id: "doc-poly",
      _cls: "Polyline",
      label: "lane",
      index: 1,
      instance: { _cls: "Instance", _id: "poly-inst" },
    };

    const resolveColor = vi.fn<ColorResolver>((_l, path) =>
      path === POLY_PATH ? "#0f0" : "#00f"
    );

    const tracks = buildPerInstanceTracks({
      engine: makeMultiFieldEngine({
        [PATH]: { 1: [box] },
        [POLY_PATH]: { 1: [poly] },
      }),
      sample: SAMPLE,
      paths: [PATH, POLY_PATH],
      totalFrames: 1,
      fps: FPS,
      resolveColor,
    });

    expect(tracks.map((t) => t.id).sort()).toEqual(["box-inst", "poly-inst"]);
    const byId = Object.fromEntries(tracks.map((t) => [t.id, t]));
    // Each row's color comes from its own field path.
    expect(byId["box-inst"].color).toBe("#00f");
    expect(byId["poly-inst"].color).toBe("#0f0");
  });

  it("emits one presence interval per contiguous run", () => {
    const det: LabelData = {
      _id: "doc-1",
      _cls: "Detection",
      label: "person",
      index: 1,
      instance: { _cls: "Instance", _id: "runner" },
    };
    // Present 1-2, absent 3, present 4-5.
    const tracks = build(5, { 1: [det], 2: [det], 4: [det], 5: [det] });

    const intervals = tracks[0].events.filter((e) => e.endSec !== undefined);
    expect(intervals).toHaveLength(2);
  });
});
