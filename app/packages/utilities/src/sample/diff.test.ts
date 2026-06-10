import { describe, expect, it } from "vitest";
import { JSONDeltas } from "../types";
import {
  buildJsonPatch,
  defaultDeltaSuppliers,
  fieldDeltas,
  firstEditedLabel,
  SampleSnapshot,
} from "./diff";
import { LabelType } from "./labels";

const suppliers = defaultDeltaSuppliers();

/** Build a SampleSnapshot with sensible defaults; override per test. */
const snap = (o: Partial<SampleSnapshot> = {}): SampleSnapshot => ({
  sourceData: {},
  transientData: {},
  transientDeletes: new Set<string>(),
  getLabelType: () => LabelType.Unknown,
  getSupplier: (t) => suppliers[t],
  ...o,
});

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

describe("buildJsonPatch — deletes", () => {
  it("emits a remove for a transient delete present in source", () => {
    const deltas = buildJsonPatch(
      snap({
        sourceData: { notes: "hi" },
        transientDeletes: new Set(["notes"]),
      })
    );
    expect(deltas).toEqual([{ op: "remove", path: "/notes" }]);
  });

  it("skips a delete for a path absent from source", () => {
    const deltas = buildJsonPatch(
      snap({ sourceData: {}, transientDeletes: new Set(["notes"]) })
    );
    expect(deltas).toEqual([]);
  });
});

describe("buildJsonPatch — label fields", () => {
  const sourceData = {
    gt: {
      _cls: "Detections",
      detections: [{ _id: "d1", label: "a", tags: [] }],
    },
  };

  it("skips a path whose transient equals source", () => {
    const deltas = buildJsonPatch(
      snap({
        sourceData,
        transientData: { gt: sourceData.gt },
        getLabelType: () => LabelType.Detections,
      })
    );
    expect(deltas).toEqual([]);
  });

  it("merge-then-diffs a partial label without removing omitted server fields", () => {
    const deltas = buildJsonPatch(
      snap({
        sourceData,
        // partial update: omits `tags`, which must NOT be removed
        transientData: { gt: { detections: [{ _id: "d1", label: "b" }] } },
        getLabelType: () => LabelType.Detections,
      })
    );
    expect(deltas).toEqual([
      { op: "replace", path: "/gt/detections/0/label", value: "b" },
    ]);
  });

  it("emits a label-rooted diff for generated views", () => {
    const deltas = buildJsonPatch(
      snap({
        sourceData,
        transientData: { gt: { detections: [{ _id: "d1", label: "b" }] } },
        getLabelType: () => LabelType.Detections,
      }),
      { isGenerated: true }
    );
    // rooted at the label — no `/gt/detections/0` field prefix
    expect(deltas).toEqual([{ op: "replace", path: "/label", value: "b" }]);
  });

  it("does not mutate a frozen snapshot", () => {
    const frozenSource = deepFreeze({
      gt: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "a", tags: [] }],
      },
    });
    const frozenTransient = deepFreeze({
      gt: { detections: [{ _id: "d1", label: "b" }] },
    });

    expect(() =>
      buildJsonPatch(
        snap({
          sourceData: frozenSource,
          transientData: frozenTransient,
          getLabelType: () => LabelType.Detections,
        })
      )
    ).not.toThrow();
  });
});

describe("fieldDeltas — supplier resolution", () => {
  it("routes through the snapshot's getSupplier", () => {
    const sentinel: JSONDeltas = [{ op: "replace", path: "/x", value: 1 }];
    const deltas = fieldDeltas(
      snap({
        getLabelType: () => LabelType.Detection,
        getSupplier: () => () => sentinel,
      }),
      "gt",
      { a: 1 },
      { a: 2 }
    );
    expect(deltas).toEqual([{ op: "replace", path: "/gt/x", value: 1 }]);
  });

  it("uses the unknown supplier for primitive fields", () => {
    const deltas = fieldDeltas(snap({}), "uuid", "old", "new");
    expect(deltas).toEqual([{ op: "replace", path: "/uuid", value: "new" }]);
  });
});

describe("firstEditedLabel", () => {
  const sourceData = {
    gt: { _cls: "Detections", detections: [{ _id: "d1", label: "a" }] },
  };

  it("returns the first changed list element id", () => {
    expect(
      firstEditedLabel(
        snap({
          sourceData,
          transientData: { gt: { detections: [{ _id: "d1", label: "b" }] } },
          getLabelType: () => LabelType.Detections,
        })
      )
    ).toEqual({ labelId: "d1", labelPath: "gt" });
  });

  it("appends the list child to labelPath for generated views", () => {
    expect(
      firstEditedLabel(
        snap({
          sourceData,
          transientData: { gt: { detections: [{ _id: "d1", label: "b" }] } },
          getLabelType: () => LabelType.Detections,
        }),
        { isGenerated: true }
      )
    ).toEqual({ labelId: "d1", labelPath: "gt.detections" });
  });

  it("returns undefined when nothing changed", () => {
    expect(
      firstEditedLabel(
        snap({
          sourceData,
          transientData: { gt: sourceData.gt },
          getLabelType: () => LabelType.Detections,
        })
      )
    ).toBeUndefined();
  });
});
