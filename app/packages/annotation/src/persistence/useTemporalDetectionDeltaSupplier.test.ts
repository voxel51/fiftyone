import type { TemporalDetectionEditFields } from "@fiftyone/video-annotation";
import { describe, expect, it } from "vitest";
import { buildTemporalDetectionDeltas } from "./useTemporalDetectionDeltaSupplier";

const td = (
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

const field = (...detections: ReturnType<typeof td>[]) => ({
  _cls: "TemporalDetections" as const,
  detections,
});

const pendingMap = (
  ...entries: Array<[string, TemporalDetectionEditFields]>
): ReadonlyMap<string, TemporalDetectionEditFields> => new Map(entries);

describe("buildTemporalDetectionDeltas", () => {
  describe("support", () => {
    it("emits a replace op when support already exists on the baseline", () => {
      const sample = { events: field(td("a", [1, 10])) };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap(["events|a", { support: [5, 15] }])
      );
      expect(deltas).toEqual([
        { op: "replace", path: "/events/detections/0/support", value: [5, 15] },
      ]);
    });

    it("resolves index by detection _id, not by edit order", () => {
      const sample = {
        events: field(td("a", [1, 10]), td("b", [20, 30]), td("c", [40, 50])),
      };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap(["events|c", { support: [42, 60] }])
      );
      expect(deltas).toHaveLength(1);
      expect(deltas[0]).toMatchObject({
        path: "/events/detections/2/support",
      });
    });
  });

  describe("label / confidence", () => {
    it("emits replace ops for label and confidence when the keys exist", () => {
      const sample = {
        events: field(td("a", [1, 10], { confidence: 0.5 })),
      };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap(["events|a", { label: "renamed", confidence: 0.9 }])
      );
      const paths = (deltas as { op: string; path: string }[]).map(
        (d) => `${d.op} ${d.path}`
      );
      expect(paths).toContain("replace /events/detections/0/label");
      expect(paths).toContain("replace /events/detections/0/confidence");
    });

    it("emits an add op for a field missing on the baseline", () => {
      // td here has no `confidence` key on the baseline doc.
      const sample = { events: field(td("a", [1, 10])) };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap(["events|a", { confidence: 0.42 }])
      );
      expect(deltas).toEqual([
        {
          op: "add",
          path: "/events/detections/0/confidence",
          value: 0.42,
        },
      ]);
    });
  });

  describe("attributes", () => {
    it("emits an add op for a new attribute", () => {
      const sample = { events: field(td("a", [1, 10])) };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap(["events|a", { attributes: { reviewed: true } }])
      );
      expect(deltas).toEqual([
        {
          op: "add",
          path: "/events/detections/0/reviewed",
          value: true,
        },
      ]);
    });

    it("emits a replace op for an existing attribute", () => {
      const sample = {
        events: field(td("a", [1, 10], { reviewed: false })),
      };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap(["events|a", { attributes: { reviewed: true } }])
      );
      expect(deltas).toEqual([
        {
          op: "replace",
          path: "/events/detections/0/reviewed",
          value: true,
        },
      ]);
    });

    it("emits a remove op for a null-valued attribute that exists", () => {
      const sample = {
        events: field(td("a", [1, 10], { reviewed: false })),
      };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap(["events|a", { attributes: { reviewed: null } }])
      );
      expect(deltas).toEqual([
        { op: "remove", path: "/events/detections/0/reviewed" },
      ]);
    });

    it("skips a null-valued attribute that's already absent (idempotent)", () => {
      const sample = { events: field(td("a", [1, 10])) };
      expect(
        buildTemporalDetectionDeltas(
          sample,
          pendingMap(["events|a", { attributes: { reviewed: null } }])
        )
      ).toEqual([]);
    });
  });

  describe("multi-field edit", () => {
    it("emits one op per defined field in a single edit", () => {
      const sample = {
        events: field(td("a", [1, 10], { confidence: 0.5 })),
      };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap([
          "events|a",
          {
            support: [5, 15],
            label: "renamed",
            confidence: 0.9,
            attributes: { reviewed: true },
          },
        ])
      );
      expect(deltas).toHaveLength(4);
    });
  });

  describe("filtering", () => {
    it("skips edits whose field doesn't exist on the sample", () => {
      const sample = { events: field(td("a", [1, 10])) };
      expect(
        buildTemporalDetectionDeltas(
          sample,
          pendingMap(["ghost|a", { support: [5, 15] }])
        )
      ).toEqual([]);
    });

    it("skips edits whose field isn't a TemporalDetections wrapper", () => {
      const sample = { events: { _cls: "Detections", detections: [] } };
      expect(
        buildTemporalDetectionDeltas(
          sample,
          pendingMap(["events|a", { support: [5, 15] }])
        )
      ).toEqual([]);
    });

    it("skips edits whose TD has disappeared from the array", () => {
      const sample = { events: field(td("a", [1, 10])) };
      expect(
        buildTemporalDetectionDeltas(
          sample,
          pendingMap(["events|ghost", { support: [5, 15] }])
        )
      ).toEqual([]);
    });

    it("returns an empty array when no edits are pending", () => {
      const sample = { events: field(td("a", [1, 10])) };
      expect(buildTemporalDetectionDeltas(sample, new Map())).toEqual([]);
    });

    it("drops the bad edit and keeps the good one in the same flush", () => {
      const sample = { events: field(td("a", [1, 10])) };
      const deltas = buildTemporalDetectionDeltas(
        sample,
        pendingMap(
          ["events|ghost", { support: [99, 100] }],
          ["events|a", { support: [5, 15] }]
        )
      );
      expect(deltas).toHaveLength(1);
      expect((deltas[0] as { value: [number, number] }).value).toEqual([5, 15]);
    });
  });
});
