import { describe, expect, it } from "vitest";
import { buildTemporalDetectionSupportDeltas } from "./useTemporalDetectionDeltaSupplier";

const td = (id: string, support: [number, number]) => ({
  _cls: "TemporalDetection",
  _id: id,
  label: "x",
  support,
});

const field = (...detections: ReturnType<typeof td>[]) => ({
  _cls: "TemporalDetections" as const,
  detections,
});

describe("buildTemporalDetectionSupportDeltas", () => {
  it("emits a replace op at /<fieldPath>/detections/<index>/support", () => {
    const sample = { events: field(td("a", [1, 10])) };
    const pending = new Map<string, [number, number]>([["events|a", [5, 15]]]);

    expect(buildTemporalDetectionSupportDeltas(sample, pending)).toEqual([
      { op: "replace", path: "/events/detections/0/support", value: [5, 15] },
    ]);
  });

  it("resolves index by detection _id, not by edit order", () => {
    const sample = {
      events: field(td("a", [1, 10]), td("b", [20, 30]), td("c", [40, 50])),
    };
    const pending = new Map<string, [number, number]>([["events|c", [42, 60]]]);
    const deltas = buildTemporalDetectionSupportDeltas(sample, pending);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      path: "/events/detections/2/support",
      value: [42, 60],
    });
  });

  it("falls back to `id` when `_id` is missing on the detection", () => {
    const sample = {
      events: {
        _cls: "TemporalDetections" as const,
        detections: [{ _cls: "TemporalDetection", id: "x", support: [1, 5] }],
      },
    };
    const pending = new Map<string, [number, number]>([["events|x", [2, 6]]]);
    const deltas = buildTemporalDetectionSupportDeltas(sample, pending);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      path: "/events/detections/0/support",
    });
  });

  it("emits one op per staged edit and preserves insertion order", () => {
    const sample = {
      events: field(td("a", [1, 10]), td("b", [20, 30])),
    };
    const pending = new Map<string, [number, number]>([
      ["events|b", [22, 28]],
      ["events|a", [5, 15]],
    ]);
    const deltas = buildTemporalDetectionSupportDeltas(sample, pending);
    expect(deltas).toHaveLength(2);
    // Insertion order of `pending` (b, then a).
    expect((deltas[0] as { path: string }).path).toBe(
      "/events/detections/1/support"
    );
    expect((deltas[1] as { path: string }).path).toBe(
      "/events/detections/0/support"
    );
  });

  it("handles edits spanning multiple fields", () => {
    const sample = {
      events: field(td("a", [1, 10])),
      highlights: field(td("h", [20, 30])),
    };
    const pending = new Map<string, [number, number]>([
      ["events|a", [5, 15]],
      ["highlights|h", [22, 28]],
    ]);
    const deltas = buildTemporalDetectionSupportDeltas(sample, pending);
    expect(deltas).toHaveLength(2);
    const paths = (deltas as { path: string }[]).map((d) => d.path);
    expect(paths).toContain("/events/detections/0/support");
    expect(paths).toContain("/highlights/detections/0/support");
  });

  it("skips edits whose field doesn't exist on the sample", () => {
    const sample = { events: field(td("a", [1, 10])) };
    const pending = new Map<string, [number, number]>([["ghost|a", [5, 15]]]);
    expect(buildTemporalDetectionSupportDeltas(sample, pending)).toEqual([]);
  });

  it("skips edits whose field isn't a TemporalDetections wrapper", () => {
    const sample = {
      events: { _cls: "Detections", detections: [] },
    };
    const pending = new Map<string, [number, number]>([["events|a", [5, 15]]]);
    expect(buildTemporalDetectionSupportDeltas(sample, pending)).toEqual([]);
  });

  it("skips edits whose field is null / undefined / non-object", () => {
    const pending = new Map<string, [number, number]>([["events|a", [5, 15]]]);
    expect(
      buildTemporalDetectionSupportDeltas({ events: null }, pending)
    ).toEqual([]);
    expect(
      buildTemporalDetectionSupportDeltas(
        { events: undefined } as unknown as Record<string, unknown>,
        pending
      )
    ).toEqual([]);
    expect(
      buildTemporalDetectionSupportDeltas({ events: "string" }, pending)
    ).toEqual([]);
  });

  it("skips edits whose TD has disappeared from the array", () => {
    const sample = { events: field(td("a", [1, 10])) };
    const pending = new Map<string, [number, number]>([
      ["events|ghost", [5, 15]],
    ]);
    expect(buildTemporalDetectionSupportDeltas(sample, pending)).toEqual([]);
  });

  it("returns an empty array when no edits are pending", () => {
    const sample = { events: field(td("a", [1, 10])) };
    expect(buildTemporalDetectionSupportDeltas(sample, new Map())).toEqual([]);
  });

  it("emits the bad edit dropped but keeps the good one in the same flush", () => {
    const sample = { events: field(td("a", [1, 10])) };
    const pending = new Map<string, [number, number]>([
      ["events|ghost", [99, 100]],
      ["events|a", [5, 15]],
    ]);
    const deltas = buildTemporalDetectionSupportDeltas(sample, pending);
    expect(deltas).toHaveLength(1);
    expect((deltas[0] as { value: [number, number] }).value).toEqual([5, 15]);
  });
});
