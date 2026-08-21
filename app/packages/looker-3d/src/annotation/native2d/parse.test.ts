import { describe, expect, it } from "vitest";
import { extractNative2dLabels } from "./parse";
import type { Native2dDetection, Native2dPolyline } from "./types";

const detections = (items: Record<string, unknown>[]) => ({
  _cls: "Detections",
  detections: items,
});

const polylines = (items: Record<string, unknown>[]) => ({
  _cls: "Polylines",
  polylines: items,
});

const detection = (overrides: Record<string, unknown> = {}) => ({
  _id: "det-1",
  _cls: "Detection",
  label: "car",
  bounding_box: [0.1, 0.2, 0.3, 0.4],
  ...overrides,
});

const polyline = (overrides: Record<string, unknown> = {}) => ({
  _id: "poly-1",
  _cls: "Polyline",
  label: "lane",
  points: [
    [
      [0, 0],
      [1, 1],
    ],
  ],
  ...overrides,
});

describe("extractNative2dLabels", () => {
  it("returns nothing for missing slice data", () => {
    expect(extractNative2dLabels(null)).toEqual([]);
    expect(extractNative2dLabels(undefined)).toEqual([]);
  });

  it("discovers label fields from the payload's own _cls", () => {
    // The whole point of payload-driven discovery: no schema path list is
    // supplied, yet both fields are found.
    const labels = extractNative2dLabels({
      filepath: "/data/img.png",
      ground_truth: detections([detection()]),
      lanes: polylines([polyline()]),
    });

    expect(labels).toHaveLength(2);
    expect(labels.map((l) => l.path).sort()).toEqual(["ground_truth", "lanes"]);
  });

  it("tags each label with the field path it came from", () => {
    const [label] = extractNative2dLabels({
      predictions: detections([detection()]),
    });
    // Coloring is by field, so the path has to survive.
    expect(label.path).toBe("predictions");
  });

  it("flattens a Detections list", () => {
    const labels = extractNative2dLabels({
      gt: detections([
        detection({ _id: "a" }),
        detection({ _id: "b" }),
        detection({ _id: "c" }),
      ]),
    });
    expect(labels.map((l) => l._id)).toEqual(["a", "b", "c"]);
  });

  it("handles a singular Detection field", () => {
    const labels = extractNative2dLabels({ gt: detection({ _id: "solo" }) });
    expect(labels).toHaveLength(1);
    expect(labels[0]._id).toBe("solo");
  });

  it("handles Polylines and singular Polyline", () => {
    const list = extractNative2dLabels({ a: polylines([polyline()]) });
    const single = extractNative2dLabels({ b: polyline({ _id: "solo" }) });
    expect(list).toHaveLength(1);
    expect(single).toHaveLength(1);
    expect(single[0]._cls).toBe("Polyline");
  });

  it("normalizes the bounding box into a 4-tuple", () => {
    const [label] = extractNative2dLabels({
      gt: detections([detection({ bounding_box: [0.1, 0.2, 0.3, 0.4, 0.5] })]),
    });
    // Extra trailing values are dropped rather than passed through.
    expect((label as Native2dDetection).boundingBox).toEqual([
      0.1, 0.2, 0.3, 0.4,
    ]);
  });

  it("accepts extended-JSON ids as well as plain strings", () => {
    // The group endpoint serializes nested ids as { $oid: ... } while
    // top-level ids come back as plain strings.
    const labels = extractNative2dLabels({
      gt: detections([
        detection({ _id: { $oid: "deadbeef" } }),
        detection({ _id: "plain" }),
      ]),
    });
    expect(labels.map((l) => l._id)).toEqual(["deadbeef", "plain"]);
  });

  it("falls back to `id` when `_id` is absent", () => {
    const labels = extractNative2dLabels({
      gt: detections([{ id: "from-id", bounding_box: [0, 0, 1, 1] }]),
    });
    expect(labels).toHaveLength(1);
    expect(labels[0]._id).toBe("from-id");
  });

  it("drops labels with no usable id", () => {
    const labels = extractNative2dLabels({
      gt: detections([detection({ _id: undefined, id: undefined })]),
    });
    expect(labels).toEqual([]);
  });

  it("drops detections with a missing or short bounding box", () => {
    const labels = extractNative2dLabels({
      gt: detections([
        detection({ _id: "no-bbox", bounding_box: undefined }),
        detection({ _id: "short", bounding_box: [0.1, 0.2] }),
        detection({ _id: "ok" }),
      ]),
    });
    expect(labels.map((l) => l._id)).toEqual(["ok"]);
  });

  it("drops polylines with no points array", () => {
    const labels = extractNative2dLabels({
      a: polylines([polyline({ _id: "bad", points: undefined })]),
    });
    expect(labels).toEqual([]);
  });

  it("carries the polyline's closed/filled flags", () => {
    const [label] = extractNative2dLabels({
      a: polylines([polyline({ closed: true, filled: true })]),
    });
    expect((label as Native2dPolyline).closed).toBe(true);
    expect((label as Native2dPolyline).filled).toBe(true);
  });

  it("skips filepath, id and underscore-prefixed keys", () => {
    // Those aren't labels, and _cls on the sample itself must not be mistaken
    // for a label field.
    const labels = extractNative2dLabels({
      _cls: "Sample",
      _media_type: "image",
      id: "sample-1",
      filepath: "/data/img.png",
      gt: detections([detection()]),
    });
    expect(labels).toHaveLength(1);
    expect(labels[0].path).toBe("gt");
  });

  it("ignores fields that aren't label types", () => {
    const labels = extractNative2dLabels({
      metadata: { width: 100, height: 50, _cls: "ImageMetadata" },
      tags: ["a", "b"],
      confidence: 0.9,
      segmentation: { _cls: "Segmentation", mask_path: "/m.png" },
      gt: detections([detection()]),
    });
    expect(labels).toHaveLength(1);
  });

  it("honours an explicit path restriction when given", () => {
    const labels = extractNative2dLabels(
      {
        wanted: detections([detection({ _id: "yes" })]),
        ignored: detections([detection({ _id: "no" })]),
      },
      ["wanted"],
    );
    expect(labels.map((l) => l._id)).toEqual(["yes"]);
  });

  it("falls back to scanning everything when the restriction is empty", () => {
    // An empty schema-derived list must not mean "no labels" — that was the
    // bug that left the overlays blank.
    const labels = extractNative2dLabels({ gt: detections([detection()]) }, []);
    expect(labels).toHaveLength(1);
  });
});
