import type { LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";

import { Sample } from "@fiftyone/utilities";

import { createSurfaceController } from "./surfaceController";
import type { LabelKindAdapter, SurfaceBridge } from "./types";
import { AnnotationEngine } from "../core/engine";
import { FrameStore } from "../store/frameStore";
import { SampleLabelStore } from "../store/sampleLabelStore";
import {
  createUndoNavigator,
  field,
  labelSchema,
  makeDet,
  makeEngine,
  makeStore,
  ref,
} from "../testing/fixtures";
import type {
  PresenceEvent,
  PresenceListener,
  TemporalView,
} from "../temporal/types";

/** A minimal retained-mode surface: handles in a map, flags applied silently. */
interface FakeHandle {
  id: string;
  path: string;
  label: LabelData;
  selected: boolean;
  hovered: boolean;
  anchor: boolean;
}

type FakeDescriptor = { id: string; path: string; label: LabelData };

const makeFakeSurface = (
  sample = "sample-1",
  renders?: (label: LabelData) => boolean,
) => {
  const handles = new Map<string, FakeHandle>();

  const adapter: LabelKindAdapter<FakeHandle, FakeDescriptor> = {
    renders,
    buildHandle: (r, label) => ({ id: r.instanceId, path: r.path, label }),
    updateHandle: (handle, label) => {
      handle.label = label;
    },
    toLabel: (handle) => ({ label: handle.label.label }),
  };

  const bridge: SurfaceBridge<FakeHandle, FakeDescriptor> = {
    surface: "fake",
    sample,
    resolveHandle: (r) => handles.get(r.instanceId),
    refOf: (handle) => ({ path: handle.path, instanceId: handle.id }),
    mount: (descriptor) => {
      const handle: FakeHandle = {
        ...descriptor,
        selected: false,
        hovered: false,
        anchor: false,
      };
      handles.set(descriptor.id, handle);
      return handle;
    },
    unmount: (handle) => {
      handles.delete(handle.id);
    },
    clear: () => {
      handles.clear();
    },
    applySelected: (handle, selected) => {
      handle.selected = selected;
    },
    applyHovered: (handle, hovered) => {
      handle.hovered = hovered;
    },
    applyAnchor: (handle, anchor) => {
      handle.anchor = anchor;
    },
  };

  const adapters = {
    [LabelType.Detections]: adapter,
    [LabelType.Detection]: adapter,
  };

  return { handles, bridge, adapters };
};

describe("bridge read-half", () => {
  it("hydrates current labels on registration", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });
    const { handles, bridge, adapters } = makeFakeSurface();

    engine.registerBridge(bridge, adapters);

    expect(handles.size).toBe(2);
    expect(handles.get("d1")?.label.label).toBe("cat");
  });

  it("a paths scope confines hydration, changes, and interaction applies", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
      predictions: { detections: [makeDet("p1", "dog")] },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    bridge.paths = new Set(["ground_truth"]);

    engine.registerBridge(bridge, adapters);

    // hydration: only the scoped path mounts
    expect([...handles.keys()]).toEqual(["d1"]);

    // changes: out-of-scope updates never reach the surface
    engine.updateLabel(ref("predictions", "p1"), { label: "wolf" });
    expect(handles.has("p1")).toBe(false);

    engine.updateLabel(ref("ground_truth", "d1"), { label: "lynx" });
    expect(handles.get("d1")?.label.label).toBe("lynx");

    // interaction: out-of-scope selection applies nothing here
    engine.interaction.setActive([ref("predictions", "p1")]);
    expect([...handles.values()].some((handle) => handle.selected)).toBe(false);

    engine.interaction.setActive([ref("ground_truth", "d1")]);
    expect(handles.get("d1")?.selected).toBe(true);
  });

  it("mounts engine-side creates, updates silently, unmounts deletes", () => {
    const { engine } = makeEngine("sample-1");
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);

    const created = engine.createLabel("ground_truth", {
      _cls: "Detection",
      label: "bird",
    });
    expect(handles.get(created.instanceId)?.label.label).toBe("bird");

    engine.updateLabel(created, { label: "hawk" });
    expect(handles.get(created.instanceId)?.label.label).toBe("hawk");

    engine.deleteLabel(created);
    expect(handles.has(created.instanceId)).toBe(false);
  });

  it("whole-sample reset reconciles: gone unmounts, new mounts", () => {
    const { engine, store } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);

    store.setData({
      ground_truth: { detections: [makeDet("d9", "fox")] },
    });

    expect(handles.has("d1")).toBe(false);
    expect(handles.get("d9")?.label.label).toBe("fox");
  });

  it("a whole-sample reset reconciles even for a path-scoped bridge", () => {
    // the reset sentinel carries the empty path, which a `paths` scope can never
    // contain — it must bypass the path filter, or a scoped bridge (every modal
    // bridge) leaves ghost handles after a post-persist echo
    const { engine, store } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
      predictions: { detections: [makeDet("p1", "dog")] },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    bridge.paths = new Set(["ground_truth"]);
    engine.registerBridge(bridge, adapters);

    expect([...handles.keys()]).toEqual(["d1"]);

    store.setData({
      ground_truth: { detections: [makeDet("d2", "fox")] },
      predictions: { detections: [makeDet("p1", "dog")] },
    });

    expect(handles.has("d1")).toBe(false); // dropped label unmounts (no ghost)
    expect(handles.get("d2")?.label.label).toBe("fox"); // newcomer mounts
    expect(handles.has("p1")).toBe(false); // out-of-scope stays out of scope
  });

  it("a post-persist setData refresh keeps handles and selection", () => {
    const { engine, store } = makeEngine("sample-1", {
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    const before = handles.get("d1")!;
    expect(before.selected).toBe(true);

    // the backend echoes the saved sample (same ids, refreshed values)
    store.setData({
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });

    // same handle object — survivors re-apply silently, no remount churn
    expect(handles.get("d1")).toBe(before);
    expect(before.label.label).toBe("cat");

    // selection survived both the GC (read-through) and the handle
    expect(engine.interaction.isActive(ref("ground_truth", "d1"))).toBe(true);
    expect(handles.get("d1")?.selected).toBe(true);
  });

  it("a transaction reconciles once, atomically", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);

    expect(() =>
      engine.transaction(() => {
        engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
        throw new Error("abort");
      }),
    ).toThrow("abort");

    // the surface never saw the aborted edit
    expect(handles.get("d1")?.label.label).toBe("cat");
  });

  it("origin suppression skips the writing bridge", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);

    bridge.isWriting = true;
    engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
    expect(handles.get("d1")?.label.label).toBe("cat");

    bridge.isWriting = false;
    engine.updateLabel(ref("ground_truth", "d1"), { label: "fox" });
    expect(handles.get("d1")?.label.label).toBe("fox");
  });

  it("ignores label kinds without an adapter", () => {
    const { engine } = makeEngine("sample-1", {
      classification: { _id: "c1", _cls: "Classification", label: "sunny" },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);

    expect(handles.size).toBe(0);

    engine.updateLabel(ref("classification", "c1"), { label: "rain" });
    expect(handles.size).toBe(0);
  });

  it("content scope: labels failing the adapter's renders never mount", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: {
        detections: [
          { ...makeDet("d1", "cat"), bounding_box: [0, 0, 1, 1] },
          makeDet("d2", "dog"),
        ],
      },
    });
    const { handles, bridge, adapters } = makeFakeSurface("sample-1", (label) =>
      Array.isArray(label.bounding_box),
    );

    engine.registerBridge(bridge, adapters);

    expect([...handles.keys()]).toEqual(["d1"]);

    // interaction on a declined label resolves no handle — applies nothing
    engine.interaction.setActive([ref("ground_truth", "d2")]);
    expect([...handles.values()].some((handle) => handle.selected)).toBe(false);
  });

  it("content scope is re-evaluated per change: labels move in and out", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const { handles, bridge, adapters } = makeFakeSurface("sample-1", (label) =>
      Array.isArray(label.bounding_box),
    );

    engine.registerBridge(bridge, adapters);
    expect(handles.size).toBe(0);

    // gains the surface's requirement → mounts
    engine.updateLabel(ref("ground_truth", "d1"), {
      bounding_box: [0, 0, 1, 1],
    });
    expect(handles.get("d1")?.label.label).toBe("cat");

    // loses it → unmounts
    engine.updateLabel(ref("ground_truth", "d1"), { bounding_box: null });
    expect(handles.size).toBe(0);
  });

  it("scopes the loop to the bridge's sample under federation", () => {
    const { engine } = makeEngine("left", {
      ground_truth: {
        detections: [{ ...makeDet("i123", "car"), bounding_box: [0, 0, 1, 1] }],
      },
    });
    const right = makeStore("right", {
      ground_truth: {
        detections: [
          { ...makeDet("i123", "car"), bounding_box: [0.5, 0.5, 0.1, 0.1] },
        ],
      },
    });
    engine.registerStore(right.store);

    // the LEFT scene's bridge; both slices share the instanceId (fo.Instance)
    const { handles, bridge, adapters } = makeFakeSurface("left");
    engine.registerBridge(bridge, adapters);
    expect(handles.get("i123")?.label.bounding_box).toEqual([0, 0, 1, 1]);

    // an edit to the RIGHT slice's linked label must not touch the left
    // scene's overlay (the instanceId collision), nor ghost-mount anything
    engine.updateLabel(ref("ground_truth", "i123", "right"), {
      bounding_box: [0.6, 0.6, 0.1, 0.1],
    });

    expect(handles.size).toBe(1);
    expect(handles.get("i123")?.label.bounding_box).toEqual([0, 0, 1, 1]);

    // an edit to the LEFT slice flows normally
    engine.updateLabel(ref("ground_truth", "i123", "left"), {
      bounding_box: [0.1, 0.1, 0.8, 0.8],
    });
    expect(handles.get("i123")?.label.bounding_box).toEqual([
      0.1, 0.1, 0.8, 0.8,
    ]);
  });

  it("unregister detaches the bridge", () => {
    const { engine } = makeEngine("sample-1");
    const { handles, bridge, adapters } = makeFakeSurface();
    const unregister = engine.registerBridge(bridge, adapters);

    unregister();
    engine.createLabel("ground_truth", { label: "bird" });

    expect(handles.size).toBe(0);
  });
});

describe("bridge interaction read-half", () => {
  it("applies selection/hover/anchor silently to resolved handles", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);

    engine.interaction.setActive([
      ref("ground_truth", "d1"),
      ref("ground_truth", "d2"),
    ]);
    engine.interaction.setHovered(ref("ground_truth", "d1"), true);

    expect(handles.get("d1")).toMatchObject({
      selected: true,
      hovered: true,
      anchor: false,
    });
    expect(handles.get("d2")).toMatchObject({ selected: true, anchor: true });

    engine.interaction.setActive([]);
    expect(handles.get("d1")?.selected).toBe(false);
    expect(handles.get("d2")).toMatchObject({ selected: false, anchor: false });
  });

  it("fresh mounts receive current interaction state", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);

    // select, then delete + re-create in one unit: the remount lands selected
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    engine.transaction(() => {
      engine.deleteLabel(ref("ground_truth", "d1"));
      engine.updateLabel(ref("ground_truth", "d1"), makeDet("d1", "cat"));
    });

    expect(handles.get("d1")?.selected).toBe(true);
    expect(handles.get("d1")?.anchor).toBe(true);
  });

  it("hydration applies pre-existing selection", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);

    expect(handles.get("d1")).toMatchObject({ selected: true, anchor: true });
  });
});

describe("surface controller (write-half)", () => {
  it("commit pulls the handle through the adapter into one transaction", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);
    const controller = createSurfaceController({ engine, bridge, adapters });

    const listener = vi.fn();
    engine.subscribeChanges(listener);

    const handle = handles.get("d1")!;
    handle.label = { ...handle.label, label: "dog" };
    controller.commit(handle);

    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("dog");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(nav.canUndo()).toBe(true);

    // no-ops
    controller.commit(undefined);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("create mints an instanceId and returns the ref", () => {
    const { engine } = makeEngine("sample-1");
    const { bridge, adapters } = makeFakeSurface();
    const controller = createSurfaceController({ engine, bridge, adapters });

    const draft: FakeHandle = {
      id: "draft-1",
      path: "ground_truth",
      label: { _id: "draft-1", label: "bird" },
      selected: false,
      hovered: false,
      anchor: false,
    };

    const created = controller.create(draft);

    expect(created).toBeDefined();
    expect(created!.instanceId).not.toBe("draft-1");
    expect(engine.getLabel(created!)?.label).toBe("bird");
    // the store stamped identity from the minted ref
    expect(engine.getLabel(created!)?._id).toBe(created!.instanceId);
  });

  it("selectHandle and hoverHandle write interaction state by ref", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });
    const { handles, bridge, adapters } = makeFakeSurface();
    engine.registerBridge(bridge, adapters);
    const controller = createSurfaceController({ engine, bridge, adapters });

    controller.selectHandle(handles.get("d1"));
    expect(engine.interaction.isActive(ref("ground_truth", "d1"))).toBe(true);

    controller.selectHandle(handles.get("d2"), { additive: true });
    expect(engine.interaction.getActive()).toHaveLength(2);
    expect(engine.interaction.getAnchor()).toEqual(ref("ground_truth", "d2"));

    controller.hoverHandle(handles.get("d1")!, true);
    expect(engine.interaction.isHovered(ref("ground_truth", "d1"))).toBe(true);

    controller.selectHandle(undefined);
    expect(engine.interaction.getActive()).toEqual([]);
  });

  describe("onAutoKeyframe", () => {
    const FRAME_PATH = "frames.detections";

    // a minimal frame-level engine + surface: a FrameStore registers
    // `frames.detections` as a Detections path so the controller's
    // `getLabelType` lookup resolves the adapter
    const makeFrameSetup = (sample = "sample-1") => {
      const engine = new AnnotationEngine();
      const frames = new FrameStore(sample, {
        labelTypes: { [FRAME_PATH]: LabelType.Detections },
        data: {
          3: {
            [FRAME_PATH]: [
              {
                _id: "d1",
                _cls: "Detection",
                label: "cat",
                bounding_box: [0, 0, 1, 1],
              },
            ],
          },
        },
      });
      engine.registerStore(frames);
      return { engine, frames };
    };

    // a minimal frame-level surface — handles point at `frames.detections`
    // and the adapter returns a bbox so the auto-rule's geometry gate trips
    const makeFrameSurface = (
      sample = "sample-1",
      path = "frames.detections",
    ) => {
      const handles = new Map<string, FakeHandle>();

      const adapter: LabelKindAdapter<FakeHandle, FakeDescriptor> = {
        buildHandle: (r, label) => ({ id: r.instanceId, path: r.path, label }),
        updateHandle: (handle, label) => {
          handle.label = label;
        },
        // the adapter emits a bbox partial — this is what makes the
        // auto-keyframe rule fire when the path is frame-level
        toLabel: (handle) => ({
          label: handle.label.label,
          bounding_box: [0, 0, 1, 1],
        }),
      };

      const bridge: SurfaceBridge<FakeHandle, FakeDescriptor> = {
        surface: "fake-frame",
        sample,
        resolveHandle: (r) => handles.get(r.instanceId),
        // surface a frame on the ref so the controller can dispatch
        refOf: (handle) => ({
          path: handle.path,
          instanceId: handle.id,
          frame: 3,
        }),
        mount: (descriptor) => {
          const handle: FakeHandle = {
            ...descriptor,
            selected: false,
            hovered: false,
            anchor: false,
          };
          handles.set(descriptor.id, handle);
          return handle;
        },
        unmount: (handle) => {
          handles.delete(handle.id);
        },
        clear: () => {
          handles.clear();
        },
      };

      const adapters = {
        [LabelType.Detections]: adapter,
        [LabelType.Detection]: adapter,
      };

      // seed a handle pointing at the frame-level path
      const handle: FakeHandle = {
        id: "d1",
        path,
        label: { _id: "d1", _cls: "Detection", label: "cat" },
        selected: false,
        hovered: false,
        anchor: false,
      };
      handles.set("d1", handle);

      return { handles, bridge, adapters, handle };
    };

    it("fires when a frame-level geometry edit promotes the partial", () => {
      const { engine } = makeFrameSetup();
      const { bridge, adapters, handle } = makeFrameSurface();
      const onAutoKeyframe = vi.fn();
      const controller = createSurfaceController({
        engine,
        bridge,
        adapters,
        onAutoKeyframe,
      });

      controller.commit(handle);

      expect(onAutoKeyframe).toHaveBeenCalledTimes(1);
      const [refArg, frameArg, instanceArg] = onAutoKeyframe.mock.calls[0];
      expect(refArg).toMatchObject({
        sample: "sample-1",
        path: "frames.detections",
        instanceId: "d1",
        frame: 3,
      });
      expect(frameArg).toBe(3);
      expect(instanceArg).toBe("d1");
    });

    it("fires on a geometry edit at an already-keyframed frame (Case B)", () => {
      const { engine } = makeFrameSetup();
      const { bridge, adapters, handle } = makeFrameSurface();
      // adapter that returns an already-keyframed partial — re-anchoring an
      // existing keyframe's geometry still needs to fire so the bracketing
      // tween segments re-interp. Downstream listeners coalesce.
      adapters[LabelType.Detections].toLabel = () => ({
        bounding_box: [0, 0, 1, 1],
        keyframe: true,
      });
      const onAutoKeyframe = vi.fn();
      const controller = createSurfaceController({
        engine,
        bridge,
        adapters,
        onAutoKeyframe,
      });

      controller.commit(handle);

      expect(onAutoKeyframe).toHaveBeenCalledTimes(1);
      const [refArg, frameArg, instanceArg] = onAutoKeyframe.mock.calls[0];
      expect(refArg).toMatchObject({
        sample: "sample-1",
        path: "frames.detections",
        instanceId: "d1",
        frame: 3,
      });
      expect(frameArg).toBe(3);
      expect(instanceArg).toBe("d1");
    });

    it("does not fire when ref.frame is undefined (sample-level safety)", () => {
      const { engine } = makeFrameSetup();
      const { bridge, adapters, handle } = makeFrameSurface();
      // strip the frame off the ref while keeping the frame-level path
      // (a defensive belt to test the controller guard independent of the
      // helper's `frames.` gate)
      bridge.refOf = (h) => ({ path: h.path, instanceId: h.id });
      const onAutoKeyframe = vi.fn();
      const controller = createSurfaceController({
        engine,
        bridge,
        adapters,
        onAutoKeyframe,
      });

      controller.commit(handle);

      expect(onAutoKeyframe).not.toHaveBeenCalled();
    });
  });

  it("compound gestures: one transaction, one undo unit", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);
    const { bridge, adapters } = makeFakeSurface();
    const controller = createSurfaceController({ engine, bridge, adapters });

    controller.transaction(() => {
      controller.updateLabel(
        { path: "ground_truth", instanceId: "d1" },
        { label: "dog" },
      );
      controller.createLabel("ground_truth", { label: "bird" });
    });

    nav.undo();
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(
      engine.listLabels({ sample: "sample-1", path: "ground_truth" }),
    ).toHaveLength(1);
  });
});

/** A drivable temporal view: emit() pushes presence events to the loop. */
const makeFakeTemporal = () => {
  const listeners = new Set<PresenceListener>();
  const view: TemporalView = {
    isTemporal: true,
    getPresent: () => [],
    isPresent: () => true,
    subscribePresence: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    dispose: () => listeners.clear(),
  };

  return {
    view,
    emit: (events: PresenceEvent[]) => listeners.forEach((l) => l(events)),
  };
};

/** Engine whose schema carries a sample-level `TemporalDetections` field
 *  (`events`) alongside the standard detection fields — no detection adapter
 *  kind covers it. */
const makeTemporalEngine = () => {
  const schema = {
    ...labelSchema,
    events: field("fiftyone.core.labels.TemporalDetections", {
      detections: field(null, undefined, {
        ftype: "fiftyone.core.fields.ListField",
        subfield: "fiftyone.core.fields.EmbeddedDocumentField",
      }),
    }),
  };

  const sample = new Sample({
    data: {
      events: {
        _cls: "TemporalDetections",
        detections: [
          {
            _id: "td1",
            _cls: "TemporalDetection",
            label: "x",
            support: [1, 5],
          },
        ],
      },
    },
    schema,
  });

  const engine = new AnnotationEngine();
  engine.registerStore(new SampleLabelStore("sample-1", sample));
  return engine;
};

describe("bridge presence merge (temporal)", () => {
  it("leaves a kind without an adapter alone on a presence exit", () => {
    const engine = makeTemporalEngine();
    const { handles, bridge, adapters } = makeFakeSurface();

    // a sample-level TD overlay shares the scene but is owned by another
    // source (useTemporalOverlaySync) — its id resolves through resolveHandle
    handles.set("td1", {
      id: "td1",
      path: "events",
      label: { _id: "td1", _cls: "TemporalDetection", label: "x" },
      selected: false,
      hovered: false,
      anchor: false,
    });

    engine.registerBridge(bridge, adapters);
    const fake = makeFakeTemporal();
    engine.attachTemporal(() => fake.view);

    // playhead leaves the TD's support → the view emits an exit for its ref;
    // the bridge has no TemporalDetections adapter, so it must NOT evict the
    // overlay (it doesn't own it and couldn't re-mount it)
    fake.emit([{ ref: ref("events", "td1"), kind: "exit" }]);

    expect(handles.has("td1")).toBe(true);
  });

  it("still unmounts an adapter kind on a presence exit", () => {
    const engine = makeTemporalEngine();
    const { handles, bridge, adapters } = makeFakeSurface();

    handles.set("d1", {
      id: "d1",
      path: "ground_truth",
      label: makeDet("d1", "cat"),
      selected: false,
      hovered: false,
      anchor: false,
    });

    engine.registerBridge(bridge, adapters);
    const fake = makeFakeTemporal();
    engine.attachTemporal(() => fake.view);

    fake.emit([{ ref: ref("ground_truth", "d1"), kind: "exit" }]);

    expect(handles.has("d1")).toBe(false);
  });
});
