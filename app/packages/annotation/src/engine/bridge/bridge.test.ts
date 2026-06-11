import type { LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";

import { createSurfaceController } from "./surfaceController";
import type { LabelKindAdapter, SurfaceBridge } from "./types";
import { makeDet, makeEngine, ref } from "../testing/fixtures";

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

const makeFakeSurface = () => {
  const handles = new Map<string, FakeHandle>();

  const adapter: LabelKindAdapter<FakeHandle, FakeDescriptor> = {
    buildHandle: (r, label) => ({ id: r.instanceId, path: r.path, label }),
    updateHandle: (handle, label) => {
      handle.label = label;
    },
    toLabel: (handle) => ({ label: handle.label.label }),
  };

  const bridge: SurfaceBridge<FakeHandle, FakeDescriptor> = {
    surface: "fake",
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

describe("bridge read-half (§6.1)", () => {
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

  it("whole-sample reset clears and rehydrates", () => {
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
      })
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

  it("unregister detaches the bridge", () => {
    const { engine } = makeEngine("sample-1");
    const { handles, bridge, adapters } = makeFakeSurface();
    const unregister = engine.registerBridge(bridge, adapters);

    unregister();
    engine.createLabel("ground_truth", { label: "bird" });

    expect(handles.size).toBe(0);
  });
});

describe("bridge interaction read-half (§6.5)", () => {
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

describe("surface controller (§6 write-half)", () => {
  it("commit pulls the handle through the adapter into one transaction", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
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
    expect(engine.canUndo()).toBe(true);

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

  it("compound gestures: one transaction, one undo unit", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const { bridge, adapters } = makeFakeSurface();
    const controller = createSurfaceController({ engine, bridge, adapters });

    controller.transaction(() => {
      controller.updateLabel(
        { path: "ground_truth", instanceId: "d1" },
        { label: "dog" }
      );
      controller.createLabel("ground_truth", { label: "bird" });
    });

    engine.undo();
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(
      engine.listLabels({ sample: "sample-1", path: "ground_truth" })
    ).toHaveLength(1);
  });
});
