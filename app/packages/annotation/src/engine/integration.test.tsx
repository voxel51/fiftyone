// @vitest-environment jsdom
/**
 * Engine integration tests: two mock surfaces — one retained-mode (an
 * imperative "scene" of handles behind a SurfaceBridge + adapter) and one
 * declarative (the declarative selector hooks rendered for real) — wired through one
 * engine over a real Sample-backed store. Validates cross-surface
 * convergence end-to-end and manufactures the worrisome sequences: echo
 * loops, mid-transaction aborts, delete-while-selected, autosave resets,
 * cross-sample identity collisions, gated mounts, subscriber write-backs,
 * signal observers writing back, and persist-failure rollback.
 */

import { act, renderHook } from "@testing-library/react";
import type { LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { AnnotationEngine } from "./core/engine";
import { createSurfaceController } from "./bridge/surfaceController";
import type {
  AdapterMap,
  LabelKindAdapter,
  SurfaceBridge,
} from "./bridge/types";
import { encodeEntityId } from "./identity/entityId";
import type { LabelRef } from "./identity/ref";
import {
  useEngineSelector,
  useInteraction,
  useSurfaceActions,
  useTemporal,
} from "./react/hooks";
import { FrameStore } from "./store/frameStore";
import type { ChangeListener, LabelChange } from "./store/types";
import { wholeSampleReset } from "./store/types";
import { FrameTemporalView } from "./temporal/frameTemporalView";
import type { Clock } from "./temporal/types";
import {
  createUndoNavigator,
  makeDet,
  makeEngine,
  makeStore,
  ref,
} from "./testing/fixtures";

// ---------------------------------------------------------------------------
// the retained-mode mock surface: an imperative handle scene + bridge/adapter
// ---------------------------------------------------------------------------

interface FakeHandle {
  id: string;
  path: string;
  label: LabelData;
  /** silent read-half applications received (loop-detection counter) */
  applied: number;
  selected: boolean;
  hovered: boolean;
  anchor: boolean;
}

interface FakeDescriptor {
  id: string;
  path: string;
  label: LabelData;
}

const makeRetainedSurface = (
  engine: AnnotationEngine,
  sample: string,
  name = "fake-retained",
) => {
  const handles = new Map<string, FakeHandle>();
  let mounts = 0;

  const bridge: SurfaceBridge<FakeHandle, FakeDescriptor> = {
    surface: name,
    sample,

    resolveHandle: (r) => {
      const handle = handles.get(r.instanceId);
      return handle && handle.path === r.path ? handle : undefined;
    },

    refOf: (handle) => ({ path: handle.path, instanceId: handle.id }),

    mount: (descriptor) => {
      mounts++;
      const handle: FakeHandle = {
        id: descriptor.id,
        path: descriptor.path,
        label: descriptor.label,
        applied: 0,
        selected: false,
        hovered: false,
        anchor: false,
      };
      handles.set(handle.id, handle);
      return handle;
    },

    unmount: (handle) => {
      handles.delete(handle.id);
    },

    clear: () => handles.clear(),

    applySelected: (handle, on) => {
      handle.selected = on;
    },

    applyHovered: (handle, on) => {
      handle.hovered = on;
    },

    applyAnchor: (handle, on) => {
      handle.anchor = on;
    },
  };

  const adapter: LabelKindAdapter<FakeHandle, FakeDescriptor> = {
    buildHandle: (r, label) => ({ id: r.instanceId, path: r.path, label }),

    updateHandle: (handle, label) => {
      handle.label = label;
      handle.applied++;
    },

    toLabel: (handle) => {
      const { _id, ...rest } = handle.label as Record<string, unknown>;
      return rest;
    },
  };

  const adapters: AdapterMap<FakeHandle, FakeDescriptor> = {
    [LabelType.Detection]: adapter,
    [LabelType.Detections]: adapter,
  };

  const unregister = engine.registerBridge(bridge, adapters);
  const controller = createSurfaceController({ engine, bridge, adapters });

  return {
    bridge,
    handles,
    controller,
    unregister,
    mountCount: () => mounts,
    handle: (id: string) => handles.get(id),

    /** A user gesture: mutate the handle locally, then commit (write-half). */
    gesture: (id: string, patch: Record<string, unknown>) => {
      const handle = handles.get(id);

      if (!handle) {
        throw new Error(`no handle '${id}'`);
      }

      handle.label = { ...handle.label, ...patch };
      controller.commit(handle);
    },
  };
};

// ---------------------------------------------------------------------------
// the declarative mock surface: a sidebar-shaped composite over the declarative hooks
// ---------------------------------------------------------------------------

const useMockSidebar = (engine: AnnotationEngine, sample: string) => {
  // cheap-equality projections: joined strings re-render only on real change
  const entries = useEngineSelector(engine, (e) =>
    e
      .listLabels({ sample, path: "ground_truth" })
      .map((label) => `${label._id}:${label.label}`)
      .join(","),
  );
  const anchor = useInteraction(engine, (i) => i.getAnchor());
  const activeIds = useInteraction(engine, (i) =>
    i
      .getActive()
      .map((r) => r.instanceId)
      .join(","),
  );
  const hoveredIds = useInteraction(engine, (i) =>
    i
      .getHovered()
      .map((r) => r.instanceId)
      .join(","),
  );
  // form-follows-anchor
  const form = useEngineSelector(engine, (e) =>
    anchor ? e.getLabel(anchor) : undefined,
  );
  const actions = useSurfaceActions(engine, "mock-sidebar");

  return { entries, anchor, activeIds, hoveredIds, form, actions };
};

const TWO_DETS = {
  ground_truth: { detections: [makeDet("d1", "cat"), makeDet("d2", "fish")] },
};

const makeWorld = (data: Record<string, unknown> = TWO_DETS) => {
  const world = makeEngine("sample-1", data);
  const retained = makeRetainedSurface(world.engine, "sample-1");
  const sidebar = renderHook(() => useMockSidebar(world.engine, "sample-1"));
  return { ...world, retained, sidebar };
};

// ---------------------------------------------------------------------------

describe("integration: cross-surface convergence", () => {
  it("a retained-surface gesture reaches every other surface, silently", () => {
    const { retained, engine, sidebar } = makeWorld();
    const other = makeRetainedSurface(engine, "sample-1", "fake-other");

    expect(sidebar.result.current.entries).toBe("d1:cat,d2:fish");
    expect(other.handle("d1")?.label.label).toBe("cat");

    act(() => {
      retained.gesture("d1", { label: "dog" });
    });

    // the other retained surface absorbed it silently
    expect(other.handle("d1")?.label.label).toBe("dog");
    // the declarative surface re-derived
    expect(sidebar.result.current.entries).toBe("d1:dog,d2:fish");
    // one application on the foreign surface; ZERO on the originator —
    // its handle already shows the gesture, and an echo would regress
    // handle state newer than the committed label (an in-flight mask
    // encode). Origin suppression, not convergence-by-echo.
    expect(other.handle("d1")?.applied).toBe(1);
    expect(retained.handle("d1")?.applied).toBe(0);
    // the committed store agrees
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("dog");
  });

  it("a declarative-surface write reaches retained handles", () => {
    const { retained, sidebar } = makeWorld();

    act(() => {
      sidebar.result.current.actions.updateLabel(
        { path: "ground_truth", instanceId: "d2" },
        { label: "shark" },
      );
    });

    expect(retained.handle("d2")?.label.label).toBe("shark");
    expect(sidebar.result.current.entries).toBe("d1:cat,d2:shark");
  });

  it("a programmatic create mounts everywhere with id = instanceId", () => {
    const { engine, retained, sidebar } = makeWorld();

    let created = "";
    act(() => {
      created = engine
        .scope("sample-1")
        .createLabel("ground_truth", { label: "bird" }).instanceId;
    });

    expect(retained.handle(created)?.label.label).toBe("bird");
    expect(retained.handle(created)?.id).toBe(created);
    expect(sidebar.result.current.entries).toContain(`${created}:bird`);
  });

  it("a declarative delete unmounts retained handles", () => {
    const { retained, sidebar } = makeWorld();

    act(() => {
      sidebar.result.current.actions.deleteLabel({
        path: "ground_truth",
        instanceId: "d1",
      });
    });

    expect(retained.handle("d1")).toBeUndefined();
    expect(sidebar.result.current.entries).toBe("d2:fish");
  });

  it("an unregistered bridge stops projecting", () => {
    const { engine, retained } = makeWorld();
    retained.unregister();

    engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });

    expect(retained.handle("d1")?.label.label).toBe("cat");
    expect(retained.handle("d1")?.applied).toBe(0);
  });

  it("an isWriting surface skips its own re-apply; everyone else converges", () => {
    const { engine, retained } = makeWorld();
    const other = makeRetainedSurface(engine, "sample-1", "fake-other");
    const handle = retained.handle("d1") as FakeHandle;

    act(() => {
      handle.label = { ...handle.label, label: "dog" };
      retained.bridge.isWriting = true;
      retained.controller.commit(handle);
      retained.bridge.isWriting = false;
    });

    // origin suppressed its own redundant re-apply…
    expect(retained.handle("d1")?.applied).toBe(0);
    // …while every other surface converged normally
    expect(other.handle("d1")?.applied).toBe(1);
    expect(other.handle("d1")?.label.label).toBe("dog");
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("dog");
  });
});

describe("integration: federation and identity scoping", () => {
  it("a shared instanceId across samples never cross-contaminates", () => {
    const { engine, retained } = makeWorld({
      ground_truth: { detections: [makeDet("shared-1", "cat")] },
    });
    // a second sample whose detection shares the linkage id
    const second = makeStore("sample-2", {
      ground_truth: { detections: [makeDet("shared-1", "elephant")] },
    });
    engine.registerStore(second.store);
    const surfaceB = makeRetainedSurface(engine, "sample-2", "fake-b");

    expect(retained.handle("shared-1")?.label.label).toBe("cat");
    expect(surfaceB.handle("shared-1")?.label.label).toBe("elephant");

    // edit the sample-2 twin: sample-1's handle must not move
    engine.updateLabel(ref("ground_truth", "shared-1", "sample-2"), {
      label: "mouse",
    });

    expect(surfaceB.handle("shared-1")?.label.label).toBe("mouse");
    expect(retained.handle("shared-1")?.label.label).toBe("cat");
    expect(retained.handle("shared-1")?.applied).toBe(0);
  });

  it("foreign-sample creates never ghost-mount (absent handle ≠ mine)", () => {
    const { engine, retained } = makeWorld();
    const second = makeStore("sample-2", { ground_truth: { detections: [] } });
    engine.registerStore(second.store);

    engine.scope("sample-2").createLabel("ground_truth", { label: "intruder" });

    expect(retained.handles.size).toBe(2); // d1, d2 only
  });
});

describe("integration: interaction state", () => {
  it("selection on one surface applies everywhere; form follows the anchor", () => {
    const { retained, engine, sidebar } = makeWorld();
    const other = makeRetainedSurface(engine, "sample-1", "fake-other");

    act(() => {
      retained.controller.selectHandle(retained.handle("d1"));
    });

    expect(retained.handle("d1")?.selected).toBe(true);
    expect(other.handle("d1")?.selected).toBe(true);
    expect(sidebar.result.current.activeIds).toBe("d1");
    expect(sidebar.result.current.anchor?.instanceId).toBe("d1");
    expect(sidebar.result.current.form?.label).toBe("cat");

    // additive select moves the anchor; the form follows
    act(() => {
      retained.controller.selectHandle(retained.handle("d2"), {
        additive: true,
      });
    });

    expect(sidebar.result.current.activeIds).toBe("d1,d2");
    expect(sidebar.result.current.form?.label).toBe("fish");
  });

  it("hover aggregates across surfaces and clears", () => {
    const { retained, engine, sidebar } = makeWorld();
    const other = makeRetainedSurface(engine, "sample-1", "fake-other");

    act(() => {
      retained.controller.hoverHandle(
        retained.handle("d1") as FakeHandle,
        true,
      );
    });
    expect(other.handle("d1")?.hovered).toBe(true);
    expect(sidebar.result.current.hoveredIds).toBe("d1");

    act(() => {
      retained.controller.hoverHandle(
        retained.handle("d1") as FakeHandle,
        false,
      );
    });
    expect(other.handle("d1")?.hovered).toBe(false);
    expect(sidebar.result.current.hoveredIds).toBe("");
  });

  it("the anchor applies to retained handles and moves without changing the set", () => {
    const { engine, retained, sidebar } = makeWorld();

    act(() => {
      retained.controller.selectHandle(retained.handle("d1"));
      retained.controller.selectHandle(retained.handle("d2"), {
        additive: true,
      });
    });

    expect(retained.handle("d2")?.anchor).toBe(true);
    expect(retained.handle("d1")?.anchor).toBe(false);

    // keyboard nav: move the lead without mutating the active set
    act(() => {
      engine.interaction.setAnchor(ref("ground_truth", "d1"));
    });

    expect(retained.handle("d1")?.anchor).toBe(true);
    expect(retained.handle("d2")?.anchor).toBe(false);
    expect(sidebar.result.current.activeIds).toBe("d1,d2");
    expect(sidebar.result.current.form?.label).toBe("cat");

    // the anchor invariant: it must be a member of the active set
    expect(() =>
      engine.interaction.setAnchor(ref("ground_truth", "ghost")),
    ).toThrow(/member/);
  });

  it("delete-while-selected prunes the ref and promotes the anchor", () => {
    const { retained, sidebar } = makeWorld();

    act(() => {
      retained.controller.selectHandle(retained.handle("d2"));
      retained.controller.selectHandle(retained.handle("d1"), {
        additive: true,
      });
    });
    expect(sidebar.result.current.anchor?.instanceId).toBe("d1");

    act(() => {
      retained.controller.deleteLabel({
        path: "ground_truth",
        instanceId: "d1",
      });
    });

    // GC pruned the deleted anchor and promoted a surviving member
    expect(sidebar.result.current.activeIds).toBe("d2");
    expect(sidebar.result.current.anchor?.instanceId).toBe("d2");
    expect(sidebar.result.current.form?.label).toBe("fish");
    expect(retained.handle("d2")?.selected).toBe(true);
  });

  it("delete + recreate in one transaction never destroys selection (read-through GC)", () => {
    const { engine, retained, sidebar } = makeWorld();

    act(() => {
      retained.controller.selectHandle(retained.handle("d1"));
    });

    act(() => {
      engine.transaction(() => {
        engine.deleteLabel(ref("ground_truth", "d1"));
        engine.updateLabel(ref("ground_truth", "d1"), {
          _cls: "Detection",
          label: "phoenix",
        });
      });
    });

    expect(sidebar.result.current.activeIds).toBe("d1");
    expect(retained.handle("d1")?.selected).toBe(true);
    expect(sidebar.result.current.form?.label).toBe("phoenix");
  });
});

describe("integration: transactions and undo", () => {
  it("a compound transaction dispatches once, atomically", () => {
    const { engine, retained } = makeWorld();
    const batches: LabelChange[][] = [];
    const unsubscribe = engine.subscribeChanges((c) => batches.push([...c]));

    engine.transaction(() => {
      engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
      engine.updateLabel(ref("ground_truth", "d2"), { label: "shark" });
    });

    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(2);
    expect(retained.handle("d1")?.label.label).toBe("dog");
    expect(retained.handle("d2")?.label.label).toBe("shark");
    unsubscribe();
  });

  it("a mid-transaction throw rolls back; subscribers never observe the abort", () => {
    const { engine, retained, sidebar, store } = makeWorld();
    const batches: LabelChange[][] = [];
    const unsubscribe = engine.subscribeChanges((c) => batches.push([...c]));

    expect(() =>
      engine.transaction(() => {
        engine.updateLabel(ref("ground_truth", "d1"), { label: "broken" });
        engine.deleteLabel(ref("ground_truth", "d2"));
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(batches.length).toBe(0);
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(engine.getLabel(ref("ground_truth", "d2"))?.label).toBe("fish");
    expect(retained.handle("d1")?.applied).toBe(0);
    expect(retained.handle("d2")).toBeDefined();
    expect(sidebar.result.current.entries).toBe("d1:cat,d2:fish");
    expect(store.isDirty()).toBe(false);
    unsubscribe();
  });

  it("undo/redo replays converge every surface", () => {
    const { engine, retained, sidebar } = makeWorld();
    const nav = createUndoNavigator(engine);
    const other = makeRetainedSurface(engine, "sample-1", "fake-other");

    act(() => {
      retained.gesture("d1", { label: "dog" });
    });
    expect(sidebar.result.current.entries).toBe("d1:dog,d2:fish");

    act(() => {
      nav.undo();
    });
    expect(sidebar.result.current.entries).toBe("d1:cat,d2:fish");
    expect(other.handle("d1")?.label.label).toBe("cat");

    act(() => {
      nav.redo();
    });
    expect(sidebar.result.current.entries).toBe("d1:dog,d2:fish");
    expect(other.handle("d1")?.label.label).toBe("dog");
  });

  it("undoKey coalesces a gesture stream into one step", () => {
    const { engine, retained } = makeWorld();
    const nav = createUndoNavigator(engine);

    for (const label of ["dog-1", "dog-2", "dog-3"]) {
      retained.controller.transaction(
        () =>
          retained.controller.updateLabel(
            { path: "ground_truth", instanceId: "d1" },
            { label },
          ),
        { undoKey: "drag:d1" },
      );
    }
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("dog-3");

    nav.undo();

    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(nav.canUndo()).toBe(false);
  });

  it("undo of a create deletes everywhere; redo restores", () => {
    const { engine, retained, sidebar } = makeWorld();
    const nav = createUndoNavigator(engine);

    let created = "";
    act(() => {
      created = engine
        .scope("sample-1")
        .createLabel("ground_truth", { label: "bird" }).instanceId;
    });
    expect(retained.handle(created)).toBeDefined();

    act(() => {
      nav.undo();
    });
    expect(retained.handle(created)).toBeUndefined();
    expect(sidebar.result.current.entries).toBe("d1:cat,d2:fish");

    act(() => {
      nav.redo();
    });
    expect(retained.handle(created)?.label.label).toBe("bird");
  });

  it("undo survives persistence (value-based inverses)", () => {
    const { engine, retained } = makeWorld();
    const nav = createUndoNavigator(engine);

    retained.gesture("d1", { label: "dog" });

    // a full autosave round-trip (sans reset echo)
    const patches = engine.getJsonPatch();
    expect(patches.length).toBe(1);
    engine.reconcilePersisted(patches);

    nav.undo();

    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(retained.handle("d1")?.label.label).toBe("cat");
  });

  it("a failed confirmed-destructive op rolls back via its own undo entry", () => {
    const { engine, retained, sidebar } = makeWorld();
    const nav = createUndoNavigator(engine);

    act(() => {
      retained.controller.deleteLabel({
        path: "ground_truth",
        instanceId: "d1",
      });
    });
    expect(retained.handle("d1")).toBeUndefined();

    // the persist failed: apply the entry's inverses, drop it from history
    const entry = engine.lastUndoEntry();
    expect(entry).toBeDefined();

    act(() => {
      engine.rollbackEntry(entry as NonNullable<typeof entry>);
    });

    expect(retained.handle("d1")?.label.label).toBe("cat");
    // the restore re-creates d1, appending it — list order is not identity
    expect(sidebar.result.current.entries.split(",").sort()).toEqual([
      "d1:cat",
      "d2:fish",
    ]);
    expect(nav.canUndo()).toBe(false);
    expect(nav.canRedo()).toBe(false);
  });
});

describe("integration: whole-sample resets (the autosave echo)", () => {
  it("a same-ids reset reconciles: handles, selection, and visuals survive", () => {
    const { engine, retained, sidebar, store } = makeWorld();
    const nav = createUndoNavigator(engine);

    act(() => {
      retained.gesture("d1", { label: "dog" });
      retained.controller.selectHandle(retained.handle("d1"));
    });

    const before = retained.handle("d1");
    const mountsBefore = retained.mountCount();

    // the backend echoes the saved sample after every persist
    act(() => {
      store.setData({
        ground_truth: {
          detections: [
            { ...makeDet("d1", "dog") },
            { ...makeDet("d2", "fish") },
          ],
        },
      });
    });

    // same handle OBJECT — reconciled, not remounted
    expect(retained.handle("d1")).toBe(before);
    expect(retained.mountCount()).toBe(mountsBefore);
    // selection survived the reset (read-through GC)
    expect(retained.handle("d1")?.selected).toBe(true);
    expect(sidebar.result.current.activeIds).toBe("d1");
    expect(sidebar.result.current.entries).toBe("d1:dog,d2:fish");
    // value-based undo survives the persist echo (D7): the prior edit can
    // still be undone after the backend re-sets the same sample
    expect(nav.canUndo()).toBe(true);
  });

  it("a reset that drops a label unmounts it and prunes its selection", () => {
    const { retained, sidebar, store } = makeWorld();

    act(() => {
      retained.controller.selectHandle(retained.handle("d2"));
    });

    act(() => {
      store.setData({
        ground_truth: { detections: [{ ...makeDet("d1", "cat") }] },
      });
    });

    expect(retained.handle("d2")).toBeUndefined();
    expect(retained.handle("d1")).toBeDefined();
    expect(sidebar.result.current.activeIds).toBe("");
    expect(sidebar.result.current.anchor).toBeUndefined();
    expect(sidebar.result.current.entries).toBe("d1:cat");
  });
});

describe("integration: gated (deferred) mounts", () => {
  /** A bridge whose mounts gate on an async source, flushed manually. */
  const makeGatingSurface = (engine: AnnotationEngine, sample: string) => {
    const handles = new Map<string, FakeHandle>();
    const pendingInserts: Array<() => void> = [];

    const bridge: SurfaceBridge<FakeHandle, FakeDescriptor> = {
      surface: "fake-gating",
      sample,
      resolveHandle: (r) => handles.get(r.instanceId),
      refOf: (handle) => ({ path: handle.path, instanceId: handle.id }),
      mount: (descriptor) => {
        pendingInserts.push(() => {
          const handle: FakeHandle = {
            id: descriptor.id,
            path: descriptor.path,
            label: descriptor.label,
            applied: 0,
            selected: false,
            hovered: false,
          };
          handles.set(handle.id, handle);
          bridge.onDeferredMount?.(handle);
        });
        return undefined;
      },
      unmount: (handle) => {
        handles.delete(handle.id);
      },
      clear: () => handles.clear(),
      applySelected: (handle, on) => {
        handle.selected = on;
      },
      applyHovered: (handle, on) => {
        handle.hovered = on;
      },
    };

    const adapter: LabelKindAdapter<FakeHandle, FakeDescriptor> = {
      buildHandle: (r, label) => ({ id: r.instanceId, path: r.path, label }),
      updateHandle: (handle, label) => {
        handle.label = label;
        handle.applied++;
      },
      toLabel: () => null,
    };

    const unregister = engine.registerBridge(bridge, {
      [LabelType.Detections]: adapter,
    } as AdapterMap<FakeHandle, FakeDescriptor>);

    return {
      handles,
      unregister,
      flush: () => {
        for (const insert of pendingInserts.splice(0)) {
          insert();
        }
      },
    };
  };

  it("hydration defers; interaction set mid-gate applies on the late insert", () => {
    const { engine } = makeEngine("sample-1", TWO_DETS);
    const gating = makeGatingSurface(engine, "sample-1");

    // hydration ran but nothing inserted yet
    expect(gating.handles.size).toBe(0);

    // selection arrives while the mounts are in flight
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    gating.flush();

    expect(gating.handles.size).toBe(2);
    expect(gating.handles.get("d1")?.selected).toBe(true);
    expect(gating.handles.get("d2")?.selected).toBe(false);
  });

  it("unregistering mid-gate detaches onDeferredMount (no orphan interaction writes)", () => {
    const { engine } = makeEngine("sample-1", TWO_DETS);
    const gating = makeGatingSurface(engine, "sample-1");
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    gating.unregister();
    gating.flush(); // late inserts after teardown

    // inserts ran (the mock is naive) but the loop callback was detached —
    // no interaction application happened
    expect(gating.handles.get("d1")?.selected).toBe(false);
  });
});

describe("integration: contract enforcement (subscribers are sinks)", () => {
  it("a change-subscriber writing back throws the keystone guard", () => {
    const { engine } = makeWorld();

    const unsubscribe = engine.subscribeChanges(() => {
      engine.updateLabel(ref("ground_truth", "d2"), { label: "echo" });
    });

    expect(() =>
      engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" }),
    ).toThrow(/sinks/);

    unsubscribe();
    expect(engine.getLabel(ref("ground_truth", "d2"))?.label).toBe("fish");
  });

  it("a surface whose 'silent' apply commits back is caught (echo loop)", () => {
    const { engine } = makeEngine("sample-1", TWO_DETS);
    const handles = new Map<string, FakeHandle>();

    const bridge: SurfaceBridge<FakeHandle, FakeDescriptor> = {
      surface: "fake-echoing",
      sample: "sample-1",
      resolveHandle: (r) => handles.get(r.instanceId),
      refOf: (handle) => ({ path: handle.path, instanceId: handle.id }),
      mount: (descriptor) => {
        const handle: FakeHandle = {
          id: descriptor.id,
          path: descriptor.path,
          label: descriptor.label,
          applied: 0,
          selected: false,
          hovered: false,
        };
        handles.set(handle.id, handle);
        return handle;
      },
      unmount: (handle) => {
        handles.delete(handle.id);
      },
      clear: () => handles.clear(),
    };

    const adapter: LabelKindAdapter<FakeHandle, FakeDescriptor> = {
      buildHandle: (r, label) => ({ id: r.instanceId, path: r.path, label }),
      // VIOLATION: the absorb path re-emits an edit (a non-silent applyLabel)
      updateHandle: (handle, label) => {
        handle.label = label;
        controller.commit(handle);
      },
      toLabel: (handle) => {
        const { _id, ...rest } = handle.label as Record<string, unknown>;
        return rest;
      },
    };

    const adapters: AdapterMap<FakeHandle, FakeDescriptor> = {
      [LabelType.Detections]: adapter,
    };
    const unregister = engine.registerBridge(bridge, adapters);
    const controller = createSurfaceController({ engine, bridge, adapters });

    expect(() =>
      engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" }),
    ).toThrow(/sinks/);

    unregister();
  });

  it("an interaction listener writing labels is just as illegal (shared guard)", () => {
    const { engine } = makeWorld();

    const unsubscribe = engine.interaction.subscribe(() => {
      engine.deleteLabel(ref("ground_truth", "d1"));
    });

    expect(() =>
      engine.interaction.setActive([ref("ground_truth", "d1")]),
    ).toThrow(/sinks/);

    unsubscribe();
    expect(engine.getLabel(ref("ground_truth", "d1"))).toBeDefined();
  });
});

describe("integration: signal pipe (transient cross-surface observation)", () => {
  const entity = (r: LabelRef) => encodeEntityId("dataset-1", r);
  const D1 = () => entity(ref("ground_truth", "d1"));
  const D2 = () => entity(ref("ground_truth", "d2"));

  it("drag signals reach observers without touching the store", () => {
    const { engine, store, retained, sidebar } = makeWorld();
    // surface B renders surface A's live drag from the pipe
    const seen: Array<{ payload: unknown; key: string }> = [];
    const unsubscribe = engine.subscribeSignal<{ x: number }>(
      "drag-geometry",
      D1(),
      (payload, key) => seen.push({ payload, key }),
    );
    const batches: unknown[] = [];
    const unsubscribeChanges = engine.subscribeChanges((c) => batches.push(c));

    engine.publishSignal("drag-geometry", D1(), { x: 0.5 });
    engine.publishSignal("drag-geometry", D1(), { x: 0.6 });

    expect(seen).toEqual([
      { payload: { x: 0.5 }, key: D1() },
      { payload: { x: 0.6 }, key: D1() },
    ]);
    // a signal is not a semantic change: no dispatch, no dirt, no re-apply
    expect(batches.length).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(retained.handle("d1")?.applied).toBe(0);
    expect(sidebar.result.current.entries).toBe("d1:cat,d2:fish");

    unsubscribe();
    unsubscribeChanges();
  });

  it("delivery is entity-scoped; wildcard subscribers hear every key", () => {
    const { engine } = makeWorld();
    const scoped: string[] = [];
    const all: string[] = [];
    engine.subscribeSignal("drag-geometry", D1(), (_, key) => scoped.push(key));
    engine.subscribeSignal("drag-geometry", "*", (_, key) => all.push(key));

    engine.publishSignal("drag-geometry", D1(), {});
    engine.publishSignal("drag-geometry", D2(), {});

    expect(scoped).toEqual([D1()]);
    expect(all).toEqual([D1(), D2()]);
  });

  it("no replay on subscribe — a late subscriber sees only future events", () => {
    const { engine } = makeWorld();

    engine.publishSignal("drag-geometry", D1(), { x: 0.1 });

    const seen: unknown[] = [];
    engine.subscribeSignal("drag-geometry", D1(), (payload) =>
      seen.push(payload),
    );
    expect(seen).toEqual([]);

    engine.publishSignal("drag-geometry", D1(), { x: 0.2 });
    expect(seen).toEqual([{ x: 0.2 }]);
  });

  it("unsubscribing stops delivery", () => {
    const { engine } = makeWorld();
    const seen: unknown[] = [];
    const unsubscribe = engine.subscribeSignal("drag-geometry", D1(), (p) =>
      seen.push(p),
    );

    engine.publishSignal("drag-geometry", D1(), { x: 0.1 });
    unsubscribe();
    engine.publishSignal("drag-geometry", D1(), { x: 0.2 });

    expect(seen).toEqual([{ x: 0.1 }]);
  });

  it("a signal observer writing back is illegal (shared guard)", () => {
    const { engine } = makeWorld();

    engine.subscribeSignal("drag-geometry", "*", () => {
      engine.updateLabel(ref("ground_truth", "d1"), { label: "echo" });
    });

    expect(() => engine.publishSignal("drag-geometry", D1(), {})).toThrow(
      /sinks/,
    );
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
  });
});

describe("integration: display and temporal projections", () => {
  it("the dirty flag is selectable and clears on the persist echo", () => {
    const { engine, retained, store } = makeWorld();
    const dirty = renderHook(() =>
      useEngineSelector(engine, (e) => e.isDirty()),
    );
    expect(dirty.result.current).toBe(false);

    act(() => {
      retained.gesture("d1", { label: "dog" });
    });
    expect(dirty.result.current).toBe(true);

    // reconcilePersisted only releases server-owned fields — the transient
    // (and the dirty flag) clears when the backend echoes the saved sample
    act(() => {
      engine.reconcilePersisted(engine.getJsonPatch());
    });
    expect(dirty.result.current).toBe(true);

    act(() => {
      store.setData({
        ground_truth: {
          detections: [
            { ...makeDet("d1", "dog") },
            { ...makeDet("d2", "fish") },
          ],
        },
      });
    });
    expect(dirty.result.current).toBe(false);
  });

  it("temporal presence equals the pool when no frame store exists", () => {
    const { engine } = makeWorld();
    const present = renderHook(() =>
      useTemporal(engine, (t) =>
        t
          .getPresent()
          .map((r) => r.instanceId)
          .sort()
          .join(","),
      ),
    );
    expect(present.result.current).toBe("d1,d2");

    let created = "";
    act(() => {
      created = engine
        .scope("sample-1")
        .createLabel("ground_truth", { label: "bird" }).instanceId;
    });

    expect(present.result.current.split(",")).toHaveLength(3);
    expect(engine.temporal.isPresent(ref("ground_truth", created))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// the frame-indexed (video) world: a FrameStore + a clock-driven temporal
// view, a frame-locked retained canvas, and a declarative whole-clip pool
// reader (the timeline). Edits target an explicit frame, as a timeline/command
// would; the canvas is the read-half projection of the present frame.
// ---------------------------------------------------------------------------

const FRAME_PATH = "frames.detections";

const frameDet = (
  docId: string,
  trackId: string,
  bounding: number[],
  label = "x",
): LabelData => ({
  _id: docId,
  _cls: "Detection",
  instance: { _id: trackId, _cls: "Instance" },
  label,
  bounding_box: bounding,
});

const makeFrameClock = () => {
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

const frameRef = (instanceId: string, frame: number): LabelRef => ({
  sample: "v",
  path: FRAME_PATH,
  instanceId,
  frame,
});

const makeFrameWorld = (data?: Record<number, Record<string, LabelData[]>>) => {
  const { clock, seek } = makeFrameClock();
  const engine = new AnnotationEngine({
    temporal: (e) => new FrameTemporalView(e, clock, (t) => t),
  });
  const store = new FrameStore("v", {
    labelTypes: { [FRAME_PATH]: LabelType.Detections },
  });

  // capture the engine's store-change listener so a test can inject a
  // sample-level `wholeSampleReset` — the composite video store's sample half
  // emits one on every post-persist echo, driving the frame bridge's reconcile
  // (the FrameStore itself only emits targeted changes + a reset on `clear`).
  let emitEngineChange: ChangeListener | undefined;
  const realSubscribeChanges = store.subscribeChanges.bind(store);
  store.subscribeChanges = (listener) => {
    emitEngineChange = listener;
    return realSubscribeChanges(listener);
  };
  engine.registerStore(store);

  // the canvas: a frame-locked retained surface (default posture); its
  // resolveHandle keys on instanceId, so one handle tracks a whole track
  const canvas = makeRetainedSurface(engine, "v", "frame-canvas");

  // the timeline: a declarative reader over the whole-clip pool, grouped to one
  // row per track — playhead-independent (it must not change as the clock moves)
  const timeline = renderHook(() =>
    useEngineSelector(engine, (e) =>
      [
        ...new Set(
          e
            .listLabels({ sample: "v", path: FRAME_PATH })
            .map((l) => (l.instance as { _id: string })._id),
        ),
      ]
        .sort()
        .join(","),
    ),
  );

  if (data) {
    act(() => store.setData(data));
  }

  // a sample-level whole-sample reset (post-persist echo), data intact
  const emitWholeSampleReset = () =>
    emitEngineChange?.([wholeSampleReset("v")]);

  return { engine, store, seek, canvas, timeline, emitWholeSampleReset };
};

// track A spans frames 1–2 (distinct doc ids, one instance); B is on 2 only
const CLIP = {
  1: { [FRAME_PATH]: [frameDet("doc-1", "A", [0, 0, 1, 1])] },
  2: {
    [FRAME_PATH]: [
      frameDet("doc-2", "A", [0, 0, 2, 2]),
      frameDet("doc-3", "B", [5, 5, 1, 1]),
    ],
  },
};

describe("integration: frame-indexed temporal path through the engine", () => {
  it("the canvas shows the present frame; the timeline shows the whole clip", () => {
    const { seek, canvas, timeline } = makeFrameWorld(CLIP);

    // frame 1: canvas has only A; the timeline pool already spans the clip
    expect([...canvas.handles.keys()]).toEqual(["A"]);
    expect(canvas.handle("A")?.label.bounding_box).toEqual([0, 0, 1, 1]);
    expect(timeline.result.current).toBe("A,B");

    // scrub to 2: A is the SAME handle refreshed to frame-2 geometry; B mounts;
    // the timeline does not change (the pool is playhead-independent)
    const handleA = canvas.handle("A");
    act(() => seek(2));
    expect(canvas.handle("A")).toBe(handleA);
    expect(canvas.handle("A")?.label.bounding_box).toEqual([0, 0, 2, 2]);
    expect(canvas.handle("B")).toBeDefined();
    expect(timeline.result.current).toBe("A,B");

    // past A's last frame: the canvas empties, the timeline still spans the clip
    act(() => seek(9));
    expect(canvas.handles.size).toBe(0);
    expect(timeline.result.current).toBe("A,B");
  });

  it("re-scrubbing to a visited frame re-applies its geometry (the handle is per-track, not per-frame)", () => {
    // Regression: the read-half skip-if-unchanged ledger keys on the HANDLE
    // (one per track), not the frame-inclusive ref. Keying per-frame let a
    // forward RE-VISIT skip — the box froze at whatever frame it last showed on
    // a second scrub pass (a lerped track that stops tracking the playhead).
    const { seek, canvas } = makeFrameWorld(CLIP);

    // 1 → 2: A refreshes to frame-2 geometry
    act(() => seek(2));
    expect(canvas.handle("A")?.label.bounding_box).toEqual([0, 0, 2, 2]);

    // back to 1: A refreshes to frame-1 geometry
    act(() => seek(1));
    expect(canvas.handle("A")?.label.bounding_box).toEqual([0, 0, 1, 1]);

    // forward to 2 AGAIN: the revisit must re-apply frame-2 geometry, not stay
    // frozen at frame 1
    act(() => seek(2));
    expect(canvas.handle("A")?.label.bounding_box).toEqual([0, 0, 2, 2]);
  });

  it("a post-scrub whole-sample reconcile refreshes the present track in place (no teardown churn)", () => {
    // Regression: the reconcile ledger (`known`) keys on the HANDLE (trackKey),
    // not the per-frame ref. Keying per-frame let scrubbing accumulate phantom
    // occurrences, so the next whole-sample reset (every post-persist echo)
    // diffed them as "gone" and tore the live overlay down + rebuilt it (and
    // re-decoded its mask) on every autosave after a scrub.
    const { seek, canvas, emitWholeSampleReset } = makeFrameWorld(CLIP);

    // project A at more than one frame, then return to frame 1
    act(() => seek(2));
    act(() => seek(1));

    const handleBefore = canvas.handle("A");
    const mountsBefore = canvas.mountCount();
    expect(handleBefore?.label.bounding_box).toEqual([0, 0, 1, 1]);

    // the post-persist sample echo: the present handle must REFRESH in place —
    // same object, no remount — not be torn down and rebuilt
    act(() => emitWholeSampleReset());

    expect(canvas.handle("A")).toBe(handleBefore);
    expect(canvas.mountCount()).toBe(mountsBefore);
    expect(canvas.handle("A")?.label.bounding_box).toEqual([0, 0, 1, 1]);
  });

  it("a current-frame edit converges on the canvas, persists, and undoes", () => {
    const { engine, store, canvas } = makeFrameWorld(CLIP);
    const nav = createUndoNavigator(engine);

    act(() => engine.updateLabel(frameRef("A", 1), { label: "cat" }));

    expect(canvas.handle("A")?.label.label).toBe("cat");
    expect(store.getJsonPatch()).toEqual([
      {
        op: "replace",
        path: "/frames/1/detections/detections/0/label",
        value: "cat",
      },
    ]);

    act(() => nav.undo());
    expect(canvas.handle("A")?.label.label).toBe("x");
    expect(store.getJsonPatch()).toEqual([]);
  });

  it("an off-frame edit stays off the canvas, then surfaces on scrub", () => {
    const { engine, seek, canvas } = makeFrameWorld(CLIP);

    // editing frame 2 while parked on frame 1 must not touch the canvas
    act(() => engine.updateLabel(frameRef("A", 2), { label: "future" }));
    expect(canvas.handle("A")?.label.label).toBe("x");

    act(() => seek(2));
    expect(canvas.handle("A")?.label.label).toBe("future");
  });

  it("selection survives scrubbing; hover prunes; both re-apply on return", () => {
    const { engine, seek, canvas } = makeFrameWorld(CLIP);

    act(() => {
      engine.interaction.setActive([frameRef("A", 1)]);
      engine.interaction.setHovered(frameRef("A", 1), true);
    });
    expect(canvas.handle("A")).toMatchObject({ selected: true, hovered: true });

    // scrub A off-frame: it unmounts, hover prunes, selection survives
    act(() => seek(9));
    expect(canvas.handle("A")).toBeUndefined();
    expect(engine.interaction.isActive(frameRef("A", 1))).toBe(true);
    expect(engine.interaction.isHovered(frameRef("A", 1))).toBe(false);

    // scrub back: A re-mounts and re-applies the surviving selection
    act(() => seek(1));
    expect(canvas.handle("A")).toMatchObject({
      selected: true,
      hovered: false,
    });
  });

  it("autosave drains deltas across frames, then a setData echo clears dirty", () => {
    const { engine, store } = makeFrameWorld(CLIP);

    act(() => {
      engine.updateLabel(frameRef("A", 1), { label: "one" });
      engine.updateLabel(frameRef("A", 2), { label: "two" });
    });

    const paths = store.getJsonPatch().map((op) => op.path);
    expect(paths.some((p) => p.startsWith("/frames/1/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/frames/2/"))).toBe(true);
    expect(store.isDirty()).toBe(true);

    // the backend echoes the saved clip
    act(() =>
      store.setData({
        1: { [FRAME_PATH]: [frameDet("doc-1", "A", [0, 0, 1, 1], "one")] },
        2: {
          [FRAME_PATH]: [
            frameDet("doc-2", "A", [0, 0, 2, 2], "two"),
            frameDet("doc-3", "B", [5, 5, 1, 1]),
          ],
        },
      }),
    );

    expect(store.isDirty()).toBe(false);
    expect(store.getJsonPatch()).toEqual([]);
  });
});
