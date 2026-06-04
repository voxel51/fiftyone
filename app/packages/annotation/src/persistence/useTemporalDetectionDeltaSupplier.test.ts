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

    it("emits nothing when an array attribute is value-equal but a different instance", () => {
      // `tags` (and any list/dict attribute) round-trips as a fresh array on
      // every post-save refetch, so the baseline and overlay arrays are never
      // the same reference.
      const sample = {
        events: field(tdBaseline("a", [1, 10], { tags: [] })),
      };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        // a distinct, value-equal array instance
        overlay("events", "a", [1, 10], {
          label: "x",
          tags: [],
        } as Partial<TemporalLabel>),
      ]);
      expect(deltas).toEqual([]);
    });

    it("emits a replace when an array attribute's value actually changes", () => {
      const sample = {
        events: field(tdBaseline("a", [1, 10], { tags: ["old"] })),
      };
      const deltas = buildTemporalDetectionOverlayDeltas(sample, [
        overlay("events", "a", [1, 10], {
          label: "x",
          tags: ["new"],
        } as Partial<TemporalLabel>),
      ]);
      expect(deltas).toEqual([
        { op: "replace", path: "/events/detections/0/tags", value: ["new"] },
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

    it("emits `remove /N` for a tombstoned detection, resolved by _id", () => {
      const sample = {
        events: field(tdBaseline("a", [1, 10]), tdBaseline("b", [20, 30])),
      };
      const deltas = buildTemporalDetectionOverlayDeltas(
        sample,
        [overlay("events", "a", [1, 10], { label: "x" })],
        [{ field: "events", id: "b" }]
      );
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
        [],
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
          [overlay("ghost", "a", [5, 15], { label: "x" })],
          [],
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

    it("does NOT remove baseline entries when overlays are absent without a tombstone", () => {
      // The first-load / navigation case: the sample baseline is populated but
      // its TD overlays haven't hydrated into the scene yet. Without an explicit
      // tombstone this must emit nothing — inferring deletion from absence here
      // would silently delete every TD on a navigation autosave tick.
      const sample = {
        events: field(tdBaseline("a", [1, 10]), tdBaseline("b", [20, 30])),
      };
      expect(buildTemporalDetectionOverlayDeltas(sample, [])).toEqual([]);
    });

    it("returns an empty array when the sample has no temporal detections", () => {
      expect(buildTemporalDetectionOverlayDeltas({}, [])).toEqual([]);
    });
  });

  describe("tombstone removals", () => {
    it("removes every tombstoned detection, descending, when all overlays are gone", () => {
      // Deleting the last TD(s) in a field leaves no overlays, but the explicit
      // tombstones still drive the removals (descending so indices don't shift).
      const sample = {
        events: field(tdBaseline("a", [1, 10]), tdBaseline("b", [20, 30])),
      };
      expect(
        buildTemporalDetectionOverlayDeltas(
          sample,
          [],
          [
            { field: "events", id: "a" },
            { field: "events", id: "b" },
          ]
        )
      ).toEqual([
        { op: "remove", path: "/events/detections/1" },
        { op: "remove", path: "/events/detections/0" },
      ]);
    });

    it("skips a tombstone whose id is no longer in the baseline (idempotent)", () => {
      // Post-save refetch dropped the deleted TD — the lingering tombstone
      // resolves to nothing, so no `remove` is re-emitted against a shifted array.
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      expect(
        buildTemporalDetectionOverlayDeltas(
          sample,
          [],
          [{ field: "events", id: "gone" }]
        )
      ).toEqual([]);
    });

    it("does not emit an add/update for a tombstoned overlay still in the scene", () => {
      // If the deleted overlay momentarily lingers, its tombstone wins: only a
      // single `remove`, no competing add/update.
      const sample = { events: field(tdBaseline("a", [1, 10])) };
      expect(
        buildTemporalDetectionOverlayDeltas(
          sample,
          [overlay("events", "a", [5, 15], { label: "renamed" })],
          [{ field: "events", id: "a" }]
        )
      ).toEqual([{ op: "remove", path: "/events/detections/0" }]);
    });
  });
});
