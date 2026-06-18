/**
 * Phase-2: the frame-indexed LabelStore. Covers identity (track =
 * `instance._id`, distinct from the per-frame doc `_id`), mutation, transaction
 * rollback/undo through the engine, the id-aligned `/frames/<n>/<field>`
 * persistence (including shift-safety), `setData` re-baseline + GC, and an
 * end-to-end run with the FrameTemporalView + a frame-locked bridge.
 */

import type { LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { registerBridgeLoop } from "../bridge/bridgeLoop";
import type { LabelKindAdapter, SurfaceBridge } from "../bridge/types";
import { AnnotationEngine } from "../core/engine";
import type { LabelRef } from "../identity/ref";
import { FrameTemporalView } from "../temporal/frameTemporalView";
import type { Clock } from "../temporal/types";
import type { FramesData } from "./frameStore";
import { FrameStore } from "./frameStore";

const SAMPLE = "v";
const PATH = "frames.detections";
const LABEL_TYPES = { [PATH]: LabelType.Detections };

/** A per-frame detection doc: its own `_id`, the track via `instance._id`. */
const det = (
  docId: string,
  trackId: string,
  bounding: number[],
  label = "x"
): LabelData => ({
  _id: docId,
  _cls: "Detection",
  instance: { _id: trackId, _cls: "Instance" },
  label,
  bounding_box: bounding,
});

const frames = (data: FramesData): FramesData => data;

const ref = (instanceId: string, frame: number): LabelRef => ({
  sample: SAMPLE,
  path: PATH,
  instanceId,
  frame,
});

const makeStore = (data?: FramesData) =>
  new FrameStore(SAMPLE, { labelTypes: LABEL_TYPES, data });

describe("FrameStore identity + resolution", () => {
  it("addresses by track instance._id, not the per-frame doc _id", () => {
    // track A on two frames carries DIFFERENT doc ids but the same instance
    const store = makeStore(
      frames({
        1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1])] },
        2: { [PATH]: [det("doc-2", "A", [0, 0, 2, 2])] },
      })
    );

    expect(store.getLabel(ref("A", 1))?.bounding_box).toEqual([0, 0, 1, 1]);
    expect(store.getLabel(ref("A", 2))?.bounding_box).toEqual([0, 0, 2, 2]);
    // the doc id is NOT the address
    expect(store.getLabel(ref("doc-1", 1))).toBeUndefined();
  });

  it("lists by frame and enumerates the pool as frame-stamped refs", () => {
    const store = makeStore(
      frames({
        1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1])] },
        2: {
          [PATH]: [
            det("doc-2", "A", [0, 0, 2, 2]),
            det("doc-3", "B", [5, 5, 1, 1]),
          ],
        },
      })
    );

    expect(store.listLabels(PATH, 2)).toHaveLength(2);
    expect(store.listLabels(PATH)).toHaveLength(3); // the whole pool

    const pool = store
      .enumerateLabels([LabelType.Detections])
      .map((r) => `${r.instanceId}@${r.frame}`)
      .sort();
    expect(pool).toEqual(["A@1", "A@2", "B@2"]);
  });
});

describe("FrameStore mutation", () => {
  it("merges an edit while preserving doc id + instance", () => {
    const store = makeStore({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1])] },
    });

    store.updateLabel(ref("A", 1), { label: "cat" });

    const label = store.getLabel(ref("A", 1))!;
    expect(label.label).toBe("cat");
    expect(label._id).toBe("doc-1"); // doc id untouched
    expect((label.instance as { _id: string })._id).toBe("A");
    expect(label.bounding_box).toEqual([0, 0, 1, 1]); // merge, not replace
  });

  it("a create mints a fresh doc id and stamps the instance from the ref", () => {
    const store = makeStore({ 1: { [PATH]: [] } });

    store.updateLabel(ref("NEW", 1), {
      label: "dog",
      bounding_box: [1, 1, 1, 1],
    });

    const label = store.getLabel(ref("NEW", 1))!;
    expect((label.instance as { _id: string })._id).toBe("NEW");
    expect(label._id).toBeDefined();
    expect(label._id).not.toBe("NEW"); // doc id is minted, not the track id
  });

  it("deletes by track id", () => {
    const store = makeStore({
      1: {
        [PATH]: [
          det("doc-1", "A", [0, 0, 1, 1]),
          det("doc-2", "B", [1, 1, 1, 1]),
        ],
      },
    });

    store.deleteLabel(ref("A", 1));

    expect(store.getLabel(ref("A", 1))).toBeUndefined();
    expect(store.getLabel(ref("B", 1))).toBeDefined();
  });
});

describe("FrameStore through the engine: transactions + undo", () => {
  const makeEngine = (data?: FramesData) => {
    const engine = new AnnotationEngine();
    const store = makeStore(data);
    engine.registerStore(store);
    return { engine, store };
  };

  it("rolls a thrown transaction back, surfaces nothing", () => {
    const { engine, store } = makeEngine({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1])] },
    });

    expect(() =>
      engine.transaction(() => {
        engine.updateLabel(ref("A", 1), { label: "edited" });
        throw new Error("abort");
      })
    ).toThrow("abort");

    expect(store.getLabel(ref("A", 1))?.label).toBe("x");
    expect(store.isDirty()).toBe(false);
  });

  it("undo restores the prior value (value-based inverse)", () => {
    const { engine, store } = makeEngine({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1], "cat")] },
    });

    engine.updateLabel(ref("A", 1), { label: "dog" });
    expect(store.getLabel(ref("A", 1))?.label).toBe("dog");

    engine.undo();
    expect(store.getLabel(ref("A", 1))?.label).toBe("cat");
    expect(store.getLabel(ref("A", 1))?._id).toBe("doc-1"); // identity survives undo
  });
});

describe("FrameStore persistence: id-aligned /frames/<n>/<field> deltas", () => {
  it("an in-place edit diffs at the baseline index", () => {
    const store = makeStore({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1], "cat")] },
    });

    store.updateLabel(ref("A", 1), { label: "lynx" });

    expect(store.getJsonPatch()).toEqual([
      {
        op: "replace",
        path: "/frames/1/detections/detections/0/label",
        value: "lynx",
      },
    ]);
  });

  it("a new track appends (`/-`), carrying the minted doc + instance", () => {
    const store = makeStore({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1])] },
    });

    store.updateLabel(ref("B", 1), {
      label: "dog",
      bounding_box: [2, 2, 2, 2],
    });

    const ops = store.getJsonPatch();
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("add");
    expect(ops[0].path).toBe("/frames/1/detections/detections/-");
    const value = (ops[0] as { value: LabelData }).value;
    expect((value.instance as { _id: string })._id).toBe("B");
    expect(value.label).toBe("dog");
  });

  it("a mid-list delete emits ONE remove — no positional flood (shift-safe)", () => {
    const store = makeStore({
      1: {
        [PATH]: [
          det("doc-A", "A", [0, 0, 1, 1]),
          det("doc-B", "B", [1, 1, 1, 1]),
          det("doc-C", "C", [2, 2, 1, 1]),
        ],
      },
    });

    store.deleteLabel(ref("B", 1)); // the middle element

    // index-aligned diffing would slide C from 2→1 and re-replace it; id
    // alignment emits exactly the one remove, at B's baseline index
    expect(store.getJsonPatch()).toEqual([
      { op: "remove", path: "/frames/1/detections/detections/1" },
    ]);
  });

  it("scopes deltas per dirty frame, leaving clean frames out", () => {
    const store = makeStore({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1])] },
      2: { [PATH]: [det("doc-2", "A", [0, 0, 2, 2])] },
    });

    store.updateLabel(ref("A", 2), { label: "edited" });

    const ops = store.getJsonPatch();
    expect(ops).toHaveLength(1);
    expect(ops[0].path).toContain("/frames/2/");
  });
});

describe("FrameStore setData: re-baseline + GC", () => {
  it("a successful save echo clears the dirty frame", () => {
    const store = makeStore({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1], "cat")] },
    });

    store.updateLabel(ref("A", 1), { label: "dog" });
    expect(store.isDirty()).toBe(true);

    // the backend echoes the saved state
    store.setData({ 1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1], "dog")] } });

    expect(store.isDirty()).toBe(false);
    expect(store.getJsonPatch()).toEqual([]);
  });

  it("an edit made DURING the save survives as the next delta", () => {
    const store = makeStore({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1], "cat")] },
    });

    store.updateLabel(ref("A", 1), { label: "dog" }); // this is what gets saved
    store.updateLabel(ref("A", 1), { label: "wolf" }); // typed during the async PATCH

    // echo carries only the first edit
    store.setData({ 1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1], "dog")] } });

    expect(store.isDirty()).toBe(true);
    expect(store.getJsonPatch()).toEqual([
      {
        op: "replace",
        path: "/frames/1/detections/detections/0/label",
        value: "wolf",
      },
    ]);
  });
});

// ---- end-to-end: store + temporal view + frame-locked bridge ----

const makeClock = () => {
  let time = 1;
  const listeners = new Set<(t: number) => void>();
  const clock: Clock = {
    getTime: () => time,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    clock,
    seek: (next: number) => {
      time = next;
      for (const l of listeners) l(next);
    },
  };
};

interface Handle {
  id: string;
  label: LabelData;
}

const makeFrameSurface = () => {
  const handles = new Map<string, Handle>();
  const adapter: LabelKindAdapter<Handle, Handle> = {
    buildHandle: (r, label) => ({ id: r.instanceId, label }),
    updateHandle: (handle, label) => {
      handle.label = label;
    },
    toLabel: (handle) => ({ bounding_box: handle.label.bounding_box }),
  };
  const bridge: SurfaceBridge<Handle, Handle> = {
    surface: "frame-canvas",
    sample: SAMPLE,
    resolveHandle: (r) => handles.get(r.instanceId), // per-track, frame-agnostic
    refOf: (handle) => ({ path: PATH, instanceId: handle.id }),
    mount: (d) => {
      handles.set(d.id, d);
      return d;
    },
    unmount: (handle) => {
      handles.delete(handle.id);
    },
    clear: () => handles.clear(),
  };
  return { handles, bridge, adapters: { [LabelType.Detections]: adapter } };
};

describe("FrameStore end-to-end with FrameTemporalView + frame-locked bridge", () => {
  it("one handle per track follows the playhead across frames (distinct doc ids)", () => {
    const { clock, seek } = makeClock();
    const engine = new AnnotationEngine({
      temporal: (e) => new FrameTemporalView(e, clock, (t) => t),
    });
    const store = makeStore();
    engine.registerStore(store);

    const { handles, bridge, adapters } = makeFrameSurface();
    registerBridgeLoop(engine, bridge, adapters);

    // frames stream in (track A spans 1–2 with different doc ids; B only on 2)
    store.setData({
      1: { [PATH]: [det("doc-1", "A", [0, 0, 1, 1])] },
      2: {
        [PATH]: [
          det("doc-2", "A", [0, 0, 2, 2]),
          det("doc-3", "B", [5, 5, 1, 1]),
        ],
      },
    });

    expect([...handles.keys()]).toEqual(["A"]);
    const handleA = handles.get("A")!;
    expect(handleA.label.bounding_box).toEqual([0, 0, 1, 1]);

    // scrub to 2: A is the SAME handle, refreshed to frame-2 geometry; B mounts
    seek(2);
    expect(handles.get("A")).toBe(handleA);
    expect(handles.get("A")?.label.bounding_box).toEqual([0, 0, 2, 2]);
    expect(handles.has("B")).toBe(true);

    // scrub past A's last frame: everything unmounts
    seek(9);
    expect(handles.size).toBe(0);
  });
});
