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

  // ---- view-projection clobber release ----

  it("releases a non-edited (projected) sub-field, deferring it to source (the clobber)", () => {
    // the persist round-trip has refreshed source to its DB-materialized value
    // (confidence 0.1). The transient still pins the stale VIEW-projected value
    // (0.99) the working store seeded from the set_field view; only the class
    // was persisted. confidence is unchanged since the patch was built (the
    // baseline also holds 0.99), so it releases and defers to source — the stale
    // projection can never re-diff and clobber the DB value on the next tick.
    const sourceData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "truck", confidence: 0.1 }],
      },
    };
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "truck", confidence: 0.99 }],
      },
    };
    // only the class op was persisted
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/label", value: "truck" },
    ];

    const result = reconcilePersisted(
      snap({ sourceData, transientData }),
      deltas,
      MASK,
      // T0 baseline: confidence was already the projected 0.99 when the patch
      // was built (it was never user-edited).
      transientData,
    );

    // confidence releases to source (0.1); the persisted class already equals
    // source, so the whole transient entry collapses and is swept — the stale
    // projected 0.99 can never be re-emitted.
    expect(result).not.toBeNull();
    expect(result!.transientData).not.toHaveProperty("ai_seg");
  });

  it("keeps the edited (delta) sub-field while releasing an un-edited sibling", () => {
    // source (authoritative DB) is label "car" / confidence 0.1; the user's
    // pending, persisted class is "truck"; confidence in the transient is a
    // stale projection (0.99). The class edit survives; confidence is released
    // (dropped) so it defers to source on the next merge-aware diff.
    const sourceData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "car", confidence: 0.1 }],
      },
    };
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "truck", confidence: 0.99 }],
      },
    };
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/label", value: "truck" },
    ];

    const result = reconcilePersisted(
      snap({ sourceData, transientData }),
      deltas,
      MASK,
      transientData,
    );

    expect(result).not.toBeNull();
    const det = (
      result!.transientData.ai_seg as {
        detections: Record<string, unknown>[];
      }
    ).detections[0];
    // the user's class edit survives (it was the persisted delta); the stale
    // confidence is gone (released → defers to source's 0.1).
    expect(det).toMatchObject({ _id: "d1", label: "truck" });
    expect(det).not.toHaveProperty("confidence");
  });

  it("keeps the persisted (delta) sub-field even when it diverges from source", () => {
    // the user edited + persisted confidence (0.5); source still shows the old
    // value (0.1) because the refresh hasn't landed yet. The persisted field is
    // kept from the transient (never released), so the edit survives; the
    // un-persisted label is released (it equals source, so it's a no-op defer).
    const sourceData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "truck", confidence: 0.1 }],
      },
    };
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "truck", confidence: 0.5 }],
      },
    };
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/confidence", value: 0.5 },
    ];

    const result = reconcilePersisted(
      snap({ sourceData, transientData }),
      deltas,
      MASK,
      transientData,
    );

    expect(result).not.toBeNull();
    const det = (
      result!.transientData.ai_seg as {
        detections: Record<string, unknown>[];
      }
    ).detections[0];
    // the persisted confidence edit is preserved
    expect(det).toMatchObject({ _id: "d1", confidence: 0.5 });
  });

  it("keeps all fields of a newly-created element (no source counterpart)", () => {
    const sourceData = { ai_seg: { _cls: "Detections", detections: [] } };
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d2", label: "car", confidence: 0.9 }],
      },
    };
    const deltas: JSONDeltas = [
      {
        op: "add",
        path: "/ai_seg/detections/-",
        value: { _id: "d2", label: "car", confidence: 0.9 },
      },
    ];

    const result = reconcilePersisted(
      snap({ sourceData, transientData }),
      deltas,
      MASK,
      transientData,
    );

    // a freshly-created label has nothing to defer to → released nothing here,
    // so the function is a no-op (no server-owned field either).
    expect(result).toBeNull();
  });

  it("KEEPS an in-flight edit to a non-delta sibling (value-CAS against the patch baseline)", () => {
    // RACE: at patch-build (T0) the user had only edited the class; the box was
    // at the projected/seeded geometry. The class patch goes out; while it is in
    // flight the user drags the box, mutating `location` in the transient (T1).
    // On the response, reconcile sees touched={label} and a `location` that is
    // NOT in the deltas — but it CHANGED since T0, so it is a live edit and must
    // be KEPT (releasing it would lose the drag AND revert the UI to source).
    // A genuinely untouched, projected sibling (`confidence`) still releases.
    const sourceData = {
      ai_seg: {
        _cls: "Detections",
        detections: [
          { _id: "d1", label: "truck", location: [0, 0, 0], confidence: 0.1 },
        ],
      },
    };
    // T0: what the patch was built from — class edited, geometry + confidence
    // are the seeded/projected values.
    const patchBaseline = {
      ai_seg: {
        _cls: "Detections",
        detections: [
          { _id: "d1", label: "truck", location: [0, 0, 0], confidence: 0.99 },
        ],
      },
    };
    // T1: the user dragged the box while the patch was in flight (location
    // changed); confidence is still the stale projection.
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [
          { _id: "d1", label: "truck", location: [5, 6, 7], confidence: 0.99 },
        ],
      },
    };
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/label", value: "truck" },
    ];

    const result = reconcilePersisted(
      snap({ sourceData, transientData }),
      deltas,
      MASK,
      patchBaseline,
    );

    expect(result).not.toBeNull();
    const det = (
      result!.transientData.ai_seg as {
        detections: Record<string, unknown>[];
      }
    ).detections[0];
    // the in-flight drag survives (changed T0→T1 → kept)...
    expect(det.location).toEqual([5, 6, 7]);
    // ...while the untouched projected confidence is released (unchanged T0→T1).
    expect(det).not.toHaveProperty("confidence");
  });

  it("releases nothing without a patch baseline (fail safe)", () => {
    const sourceData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "truck", confidence: 0.1 }],
      },
    };
    const transientData = {
      ai_seg: {
        _cls: "Detections",
        detections: [{ _id: "d1", label: "truck", confidence: 0.99 }],
      },
    };
    const deltas: JSONDeltas = [
      { op: "replace", path: "/ai_seg/detections/0/label", value: "truck" },
    ];

    // no baseline (default null) → cannot tell stale from in-flight → release
    // nothing (and there is no server-owned field), so it's a no-op.
    expect(
      reconcilePersisted(snap({ sourceData, transientData }), deltas, MASK),
    ).toBeNull();
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
