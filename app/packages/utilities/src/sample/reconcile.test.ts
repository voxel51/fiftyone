import { describe, expect, it } from "vitest";
import { JSONDeltas } from "../types";
import { SampleSnapshot } from "./diff";
import { LabelType } from "./labels";
import { reconcilePersisted } from "./reconcile";

const MASK = new Set(["mask", "mask_path"]);

/** A snapshot whose `ai_seg` field is a Detections list. */
const snap = (o: Partial<SampleSnapshot> = {}): SampleSnapshot => ({
  sourceData: {},
  transientData: {},
  transientDeletes: new Set<string>(),
  getLabelType: (p) =>
    p === "ai_seg" ? LabelType.Detections : LabelType.Unknown,
  ...o,
});

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

describe("reconcilePersisted", () => {
  it("returns null when no op carries a server-owned field", () => {
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/label", value: "x" },
    ];
    expect(
      reconcilePersisted(
        snap({ transientData: { ai_seg: { detections: [{ _id: "d1" }] } } }),
        deltas,
        MASK,
      ),
    ).toBeNull();
  });

  it("returns null for remove-only deltas", () => {
    const deltas: JSONDeltas = [{ op: "remove", path: "/ai_seg/detections/0" }];
    expect(reconcilePersisted(snap({}), deltas, MASK)).toBeNull();
  });

  it("releases a persisted mask leaf and drops the now-no-op entry", () => {
    // server owns the mask: source has the detection without it
    const sourceData = {
      ai_seg: { _cls: "Detections", detections: [{ _id: "d1", label: "x" }] },
    };
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "x", mask: "BYTES" }],
      },
    };
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/mask", value: "BYTES" },
    ];

    const result = reconcilePersisted(
      snap({ sourceData, transientData }),
      deltas,
      MASK,
    );

    // mask released → detection matches source → entry swept entirely
    expect(result).not.toBeNull();
    expect(result!.transientData).not.toHaveProperty("ai_seg");
  });

  it("preserves a value re-edited since the patch was built (CAS)", () => {
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", mask: "NEW" }],
      },
    };
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/mask", value: "OLD" },
    ];

    // persisted value ("OLD") no longer matches transient ("NEW") → no release
    expect(
      reconcilePersisted(snap({ transientData }), deltas, MASK),
    ).toBeNull();
  });

  it("releases a server-owned field nested inside a whole-element add", () => {
    const sourceData = { ai_seg: { _cls: "Detections", detections: [] } };
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d2", label: "y", mask: "BYTES" }],
      },
    };
    const deltas: JSONDeltas = [
      {
        op: "add",
        path: "/ai_seg/detections/0",
        value: { _id: "d2", label: "y", mask: "BYTES" },
      },
    ];

    const result = reconcilePersisted(
      snap({ sourceData, transientData }),
      deltas,
      MASK,
    );

    expect(result).not.toBeNull();
    const det = (
      result!.transientData.ai_seg as {
        detections: Record<string, unknown>[];
      }
    ).detections[0];
    expect(det).not.toHaveProperty("mask");
    expect(det).toMatchObject({ _id: "d2", label: "y" });
  });

  it("does not mutate the input snapshot's transient data", () => {
    const transientData = deepFreeze({
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "x", mask: "BYTES" }],
      },
    });
    const sourceData = deepFreeze({
      ai_seg: { _cls: "Detections", detections: [{ _id: "d1", label: "x" }] },
    });
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/mask", value: "BYTES" },
    ];

    let result: ReturnType<typeof reconcilePersisted>;
    expect(() => {
      result = reconcilePersisted(
        snap({ sourceData, transientData }),
        deltas,
        MASK,
      );
    }).not.toThrow();
    // a new object was produced; the frozen input was never written to
    expect(result!.transientData).not.toBe(transientData);
  });
});
