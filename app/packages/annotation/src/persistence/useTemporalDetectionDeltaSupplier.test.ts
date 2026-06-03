import type { TemporalLabel, TemporalOverlay } from "@fiftyone/lighter";
import { describe, expect, it } from "vitest";
import { buildTemporalDetectionOverlayDeltas } from "./useTemporalDetectionDeltaSupplier";

const tdBaseline = (
  id: string,
  support: [number, number],
  extra: Record<string, unknown> = {}
) => ({
  _cls: "TemporalDetection",
  _id: id,
  label: "x",
  support,
  ...extra,
});

const field = (...detections: ReturnType<typeof tdBaseline>[]) => ({
  _cls: "TemporalDetections" as const,
  detections,
});

// Build a thin TemporalOverlay stand-in. The supplier only touches
// `.field` and `.label`; casting through `unknown` keeps the test free
// of full overlay scaffolding.
const overlay = (
  fieldPath: string,
  id: string,
  support: [number, number],
  extra: Partial<TemporalLabel> = {}
): TemporalOverlay =>
  ({
    field: fieldPath,
    label: {
      _cls: "TemporalDetection",
      _id: id,
      support,
      ...extra,
    } as TemporalLabel,
  } as unknown as TemporalOverlay);

describe("buildTemporalDetectionOverlayDeltas", () => {
  describe("support", () => {
    it("emits a replace when the overlay's support differs from baseline", () => {
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [5, 15], { label: "x" }),
      ]);
      expect(deltas).toEqual([
        { op: "replace", path: "/events/detections/0/support", value: [5, 15] },
      ]);
    });

    it("emits nothing when the overlay matches the baseline", () => {
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [1, 10], { label: "x" }),
      ]);
      expect(deltas).toEqual([]);
    });

    it("resolves index by detection _id, not by overlay order", () => {
      const sample = {
        events: field(
          tdBaseline("a", [1, 10]),
          tdBaseline("b", [20, 30]),
          tdBaseline("c", [40, 50])
        ),
      };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "c", [42, 60], { label: "x" }),
        overlay("events", "a", [1, 10], { label: "x" }),
        overlay("events", "b", [20, 30], { label: "x" }),
      ]);
      expect(deltas).toEqual([
        {
          op: "replace",
          path: "/events/detections/2/support",
          value: [42, 60],
        },
      ]);
    });
  });

  describe("label / confidence", () => {
    it("emits replace ops for label and confidence when they differ", () => {
      const sample = {
        events: field(tdBaseline("a", [1, 10], { confidence: 0.5 })),
      };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [1, 10], { label: "renamed", confidence: 0.9 }),
      ]);
      const paths = (deltas as { op: string; path: string }[]).map(
        (d) => `${d.op} ${d.path}`
      );
      expect(paths).toContain("replace /events/detections/0/label");
      expect(paths).toContain("replace /events/detections/0/confidence");
    });

    it("emits an add op for a confidence missing on the baseline", () => {
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [1, 10], { label: "x", confidence: 0.42 }),
      ]);
      expect(deltas).toEqual([
        {
          op: "add",
          path: "/events/detections/0/confidence",
          value: 0.42,
        },
      ]);
    });
  });

  describe("dynamic attributes", () => {
    it("emits an add op for a new attribute on the overlay", () => {
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [1, 10], {
          label: "x",
          reviewed: true,
        } as Partial<TemporalLabel>),
      ]);
      expect(deltas).toEqual([
        { op: "add", path: "/events/detections/0/reviewed", value: true },
      ]);
    });

    it("emits a replace op for an existing attribute on baseline", () => {
      const sample = {
        events: field(tdBaseline("a", [1, 10], { reviewed: false })),
      };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [1, 10], {
          label: "x",
          reviewed: true,
        } as Partial<TemporalLabel>),
      ]);
      expect(deltas).toEqual([
        { op: "replace", path: "/events/detections/0/reviewed", value: true },
      ]);
    });

    it("emits a remove op for an attribute the overlay no longer carries", () => {
      const sample = {
        events: field(tdBaseline("a", [1, 10], { reviewed: false })),
      };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        // overlay label lacks `reviewed`
        overlay("events", "a", [1, 10], { label: "x" }),
      ]);
      expect(deltas).toEqual([
        { op: "remove", path: "/events/detections/0/reviewed" },
      ]);
    });
  });

  describe("create / delete", () => {
    it("emits `add /-` when the overlay isn't on the sample", () => {
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [1, 10], { label: "x" }),
        overlay("events", "new-id", [20, 40], {
          label: "fresh",
          confidence: 0.5,
        }),
      ]);
      expect(deltas).toEqual([
        {
          op: "add",
          path: "/events/detections/-",
          value: {
            _cls: "TemporalDetection",
            _id: "new-id",
            support: [20, 40],
            label: "fresh",
            confidence: 0.5,
          },
        },
      ]);
    });

    it("emits `remove /N` when a baseline entry has no matching overlay", () => {
      const sample = {
        events: field(tdBaseline("a", [1, 10]), tdBaseline("b", [20, 30])),
      };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [1, 10], { label: "x" }),
      ]);
      expect(deltas).toEqual([{ op: "remove", path: "/events/detections/1" }]);
    });

    it("emits `add /-` for a declared field not yet populated on the sample", () => {
      // The field is in the schema (`declaredFields`) but absent on the
      // sample — creating the first event on a fresh dataset. The server
      // materializes the parent TemporalDetections before the add applies.
      const sample = { events: null };
      const deltas = buildTemporalDetectionOverlayDeltas(
        sample as unknown as Record<string, unknown>,
        [overlay("events", "first", [1, 30], { label: "fresh" })],
        ["events"]
      );
      expect(deltas).toEqual([
        {
          op: "add",
          path: "/events/detections/-",
          value: {
            _cls: "TemporalDetection",
            _id: "first",
            support: [1, 30],
            label: "fresh",
          },
        },
      ]);
    });

    it("still skips an undeclared field even when declaredFields is supplied", () => {
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      expect(
        buildTemporalDetectionOverlayDeltas(
          sample,
          [
            // The declared `events` baseline has a matching overlay (no change),
            // so the only field under test is the undeclared `ghost`.
            overlay("events", "a", [1, 10], { label: "x" }),
            overlay("ghost", "a", [5, 15], { label: "x" }),
          ],
          ["events"]
        )
      ).toEqual([]);
    });
  });

  describe("filtering", () => {
    it("skips overlays whose field doesn't exist on the sample", () => {
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      expect(
        buildTemporalDetectionOverlayDeltas(sample, [
          // The `events` baseline has a matching overlay (no change), leaving
          // only the `ghost` overlay — whose field isn't on the sample — to skip.
          overlay("events", "a", [1, 10], { label: "x" }),
          overlay("ghost", "a", [5, 15], { label: "x" }),
        ])
      ).toEqual([]);
    });

    it("skips overlays whose field isn't a TemporalDetections wrapper", () => {
      const sample = {
        events: { _cls: "Detections", detections: [] },
      };
      expect(
        buildTemporalDetectionOverlayDeltas(
          sample as unknown as Record<string, unknown>,
          [overlay("events", "a", [5, 15], { label: "x" })]
        )
      ).toEqual([]);
    });

    it("removes every baseline entry when all overlays are gone", () => {
      // Deleting the last TD(s) in a field leaves a populated baseline with no
      // matching overlays; each orphaned entry is diffed out (descending so the
      // earlier indices don't shift).
      const sample = {
        events: field(tdBaseline("a", [1, 10]), tdBaseline("b", [20, 30])),
      };
      expect(buildTemporalDetectionOverlayDeltas(sample, [])).toEqual([
        { op: "remove", path: "/events/detections/1" },
        { op: "remove", path: "/events/detections/0" },
      ]);
    });

    it("returns an empty array when the sample has no temporal detections", () => {
      expect(buildTemporalDetectionOverlayDeltas({}, [])).toEqual([]);
    });
  });
});
