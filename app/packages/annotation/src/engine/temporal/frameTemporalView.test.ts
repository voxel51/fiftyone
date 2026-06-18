/**
 * The {@link FrameTemporalView} driving a frame-locked bridge through the
 * engine:
 *  - presence diffing at track granularity (enter/refresh/exit)
 *  - a frame-locked bridge getting mount/refresh/unmount as a clock advances
 *  - off-frame edits NOT touching the canvas, surfacing on scrub
 *  - presence-exit pruning hover only (selection survives scrubbing)
 *
 * The store here is a throwaway frame-keyed LabelStore — enough to exercise the
 * engine in isolation from a concrete store.
 */

import type {
  JSONDeltas,
  LabelData,
  TransientSnapshot,
} from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";

import { registerBridgeLoop } from "../bridge/bridgeLoop";
import type { LabelKindAdapter, SurfaceBridge } from "../bridge/types";
import { AnnotationEngine } from "../core/engine";
import type { LabelRef } from "../identity/ref";
import type {
  ChangeListener,
  DisplayListener,
  LabelChange,
  LabelStore,
} from "../store/types";
import { wholeSampleReset } from "../store/types";
import { FrameTemporalView } from "./frameTemporalView";
import type { Clock } from "./types";

const PATH = "frames.detections";
const SAMPLE = "v";

const box = (id: string, bounding: number[]): LabelData => ({
  _id: id,
  _cls: "Detection",
  bounding_box: bounding,
});

type Entry = { frame: number; instanceId: string; label: LabelData };

/** A throwaway frame-keyed store: identity is (instanceId, frame). */
class FakeFrameStore implements LabelStore {
  readonly sample = SAMPLE;

  private data = new Map<string, LabelData>();
  private displayListeners = new Set<DisplayListener>();
  private changeListeners = new Set<ChangeListener>();
  private dirty = false;

  private key(ref: { instanceId: string; frame?: number }): string {
    return `${ref.frame}:${ref.instanceId}`;
  }

  getLabel(ref: LabelRef): LabelData | undefined {
    return this.data.get(this.key(ref));
  }

  listLabels(path: string, frame?: number): LabelData[] {
    if (path !== PATH) {
      return [];
    }

    const out: LabelData[] = [];

    for (const [key, label] of this.data) {
      const f = Number(key.split(":")[0]);

      if (frame == null || f === frame) {
        out.push(label);
      }
    }

    return out;
  }

  getLabelType(path: string): LabelType {
    return path === PATH ? LabelType.Detection : LabelType.Unknown;
  }

  enumerateLabels(): LabelRef[] {
    return [...this.data.keys()].map((key) => {
      const [frame, instanceId] = key.split(":");
      return { sample: SAMPLE, path: PATH, instanceId, frame: Number(frame) };
    });
  }

  updateLabel(ref: LabelRef, partial: Partial<LabelData>): void {
    const prev = this.data.get(this.key(ref)) ?? { _cls: "Detection" };
    this.data.set(this.key(ref), { ...prev, ...partial, _id: ref.instanceId });
    this.dirty = true;
    this.emit([{ ref, kind: "update" }]);
  }

  replaceLabel(ref: LabelRef, value: Partial<LabelData>): void {
    this.data.set(this.key(ref), { ...value, _id: ref.instanceId });
    this.dirty = true;
    this.emit([{ ref, kind: "update" }]);
  }

  deleteLabel(ref: LabelRef): void {
    if (this.data.delete(this.key(ref))) {
      this.dirty = true;
      this.emit([{ ref, kind: "delete" }]);
    }
  }

  subscribe(listener: DisplayListener): () => void {
    this.displayListeners.add(listener);
    return () => this.displayListeners.delete(listener);
  }

  subscribeChanges(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  snapshot(): TransientSnapshot {
    return {
      data: new Map(this.data),
      dirty: this.dirty,
    } as unknown as TransientSnapshot;
  }

  restore(snapshot: TransientSnapshot): void {
    const snap = snapshot as unknown as {
      data: Map<string, LabelData>;
      dirty: boolean;
    };
    this.data = new Map(snap.data);
    this.dirty = snap.dirty;
  }

  getJsonPatch(): JSONDeltas {
    return [] as unknown as JSONDeltas;
  }

  pendingPaths(): readonly string[] {
    return [];
  }

  isDirty(): boolean {
    return this.dirty;
  }

  reconcilePersisted(): void {
    this.dirty = false;
  }

  setData(): void {
    this.emit([wholeSampleReset(SAMPLE)]);
  }

  clear(): void {
    this.data.clear();
    this.emit([wholeSampleReset(SAMPLE)]);
  }

  /** Seed frames as if a labels stream landed them, then announce via reset. */
  hydrate(entries: Entry[]): void {
    for (const { frame, instanceId, label } of entries) {
      this.data.set(`${frame}:${instanceId}`, { ...label, _id: instanceId });
    }

    this.emit([wholeSampleReset(SAMPLE)]);
  }

  private emit(changes: LabelChange[]): void {
    for (const listener of this.changeListeners) {
      listener(changes);
    }

    for (const listener of this.displayListeners) {
      listener();
    }
  }
}

/** A fake playback clock; `frameAtTime` is identity, so time === frame. */
const makeClock = () => {
  let time = 1;
  const listeners = new Set<(t: number) => void>();

  const clock: Clock = {
    getTime: () => time,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    clock,
    seek: (next: number) => {
      time = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
  };
};

const ref = (instanceId: string, frame: number): LabelRef => ({
  sample: SAMPLE,
  path: PATH,
  instanceId,
  frame,
});

/** A frame engine + clock + seeded store, with `frameAtTime` = identity. */
const makeFrameEngine = (entries: Entry[] = []) => {
  const { clock, seek } = makeClock();
  const engine = new AnnotationEngine({
    temporal: (e) => new FrameTemporalView(e, clock, (t) => t),
  });
  const store = new FakeFrameStore();
  engine.registerStore(store);
  store.hydrate(entries);
  return { engine, store, seek };
};

interface FakeHandle {
  id: string;
  label: LabelData;
  selected: boolean;
  hovered: boolean;
}

/** A retained surface whose handle is per-TRACK: resolveHandle keys on instanceId. */
const makeFrameSurface = () => {
  const handles = new Map<string, FakeHandle>();

  const adapter: LabelKindAdapter<FakeHandle, FakeHandle> = {
    buildHandle: (r, label) => ({
      id: r.instanceId,
      label,
      selected: false,
      hovered: false,
    }),
    updateHandle: (handle, label) => {
      handle.label = label;
    },
    toLabel: (handle) => ({ bounding_box: handle.label.bounding_box }),
  };

  const bridge: SurfaceBridge<FakeHandle, FakeHandle> = {
    surface: "frame-canvas",
    sample: SAMPLE,
    // per-track: the playhead picks WHICH frame's geometry, never which handle
    resolveHandle: (r) => handles.get(r.instanceId),
    refOf: (handle) => ({ path: PATH, instanceId: handle.id }),
    mount: (descriptor) => {
      handles.set(descriptor.id, descriptor);
      return descriptor;
    },
    unmount: (handle) => {
      handles.delete(handle.id);
    },
    clear: () => handles.clear(),
    applySelected: (handle, selected) => {
      handle.selected = selected;
    },
    applyHovered: (handle, hovered) => {
      handle.hovered = hovered;
    },
  };

  return {
    handles,
    bridge,
    adapters: { [LabelType.Detection]: adapter },
  };
};

describe("FrameTemporalView presence", () => {
  it("presence is the pool subset at the playhead's frame", () => {
    const { engine, seek } = makeFrameEngine([
      { frame: 1, instanceId: "A", label: box("A", [0, 0, 1, 1]) },
      { frame: 2, instanceId: "A", label: box("A", [0, 0, 2, 2]) },
      { frame: 2, instanceId: "B", label: box("B", [5, 5, 1, 1]) },
    ]);

    expect(engine.temporal.isTemporal).toBe(true);
    expect(engine.temporal.getPresent().map((r) => r.instanceId)).toEqual([
      "A",
    ]);
    expect(engine.temporal.isPresent(ref("B", 2))).toBe(false);

    seek(2);
    expect(
      [...engine.temporal.getPresent()].map((r) => r.instanceId).sort()
    ).toEqual(["A", "B"]);
    expect(engine.temporal.isPresent(ref("B", 2))).toBe(true);
  });

  it("emits enter / refresh / exit at track granularity as the clock moves", () => {
    const { engine, seek } = makeFrameEngine([
      { frame: 1, instanceId: "A", label: box("A", [0, 0, 1, 1]) },
      { frame: 2, instanceId: "A", label: box("A", [0, 0, 2, 2]) },
      { frame: 3, instanceId: "A", label: box("A", [0, 0, 3, 3]) },
      { frame: 2, instanceId: "B", label: box("B", [5, 5, 1, 1]) },
    ]);

    const events: { id: string; frame?: number; kind: string }[] = [];
    engine.temporal.subscribePresence((batch) => {
      for (const e of batch) {
        events.push({ id: e.ref.instanceId, frame: e.ref.frame, kind: e.kind });
      }
    });

    seek(2);
    // A stays present (playhead moved within its span) → refresh; B arrives → enter
    expect(events).toContainEqual({ id: "A", frame: 2, kind: "refresh" });
    expect(events).toContainEqual({ id: "B", frame: 2, kind: "enter" });

    events.length = 0;
    seek(3);
    expect(events).toContainEqual({ id: "A", frame: 3, kind: "refresh" });
    expect(events).toContainEqual({ id: "B", frame: 2, kind: "exit" });

    events.length = 0;
    seek(9);
    expect(events).toEqual([{ id: "A", frame: 3, kind: "exit" }]);
  });
});

describe("frame-locked bridge driven by presence", () => {
  it("mounts the present subset, refreshes geometry, unmounts on scrub-away", () => {
    const { engine, seek } = makeFrameEngine([
      { frame: 1, instanceId: "A", label: box("A", [0, 0, 1, 1]) },
      { frame: 2, instanceId: "A", label: box("A", [0, 0, 2, 2]) },
      { frame: 3, instanceId: "A", label: box("A", [0, 0, 3, 3]) },
      { frame: 2, instanceId: "B", label: box("B", [5, 5, 1, 1]) },
    ]);
    const { handles, bridge, adapters } = makeFrameSurface();
    registerBridgeLoop(engine, bridge, adapters);

    // frame 1: only A is present
    expect([...handles.keys()]).toEqual(["A"]);
    expect(handles.get("A")?.label.bounding_box).toEqual([0, 0, 1, 1]);

    // frame 2: A refreshes to its frame-2 geometry (SAME handle), B mounts
    const handleA = handles.get("A")!;
    seek(2);
    expect(handles.get("A")).toBe(handleA); // no remount churn
    expect(handles.get("A")?.label.bounding_box).toEqual([0, 0, 2, 2]);
    expect(handles.has("B")).toBe(true);

    // frame 3: A refreshes again, B leaves its span → unmounts
    seek(3);
    expect(handles.get("A")?.label.bounding_box).toEqual([0, 0, 3, 3]);
    expect(handles.has("B")).toBe(false);

    // past A's last frame: nothing present
    seek(9);
    expect(handles.size).toBe(0);
  });

  it("ignores an off-frame edit, then surfaces it when the playhead arrives", () => {
    const { engine, seek } = makeFrameEngine([
      { frame: 1, instanceId: "A", label: box("A", [0, 0, 1, 1]) },
      { frame: 2, instanceId: "A", label: box("A", [0, 0, 2, 2]) },
    ]);
    const { handles, bridge, adapters } = makeFrameSurface();
    registerBridgeLoop(engine, bridge, adapters);

    // editing frame 2 while parked on frame 1 must NOT touch the canvas
    engine.updateLabel(ref("A", 2), { bounding_box: [9, 9, 9, 9] });
    expect(handles.get("A")?.label.bounding_box).toEqual([0, 0, 1, 1]);

    // scrub to frame 2 → the persisted edit surfaces via the presence refresh
    seek(2);
    expect(handles.get("A")?.label.bounding_box).toEqual([9, 9, 9, 9]);
  });

  it("a current-frame edit reaches the canvas immediately", () => {
    const { engine } = makeFrameEngine([
      { frame: 1, instanceId: "A", label: box("A", [0, 0, 1, 1]) },
    ]);
    const { handles, bridge, adapters } = makeFrameSurface();
    registerBridgeLoop(engine, bridge, adapters);

    engine.updateLabel(ref("A", 1), { bounding_box: [4, 4, 4, 4] });
    expect(handles.get("A")?.label.bounding_box).toEqual([4, 4, 4, 4]);
  });
});

describe("presence exit prunes hover, not selection", () => {
  it("scrubbing a label off-frame clears its hover but keeps it selected", () => {
    const { engine, seek } = makeFrameEngine([
      { frame: 3, instanceId: "A", label: box("A", [0, 0, 3, 3]) },
    ]);
    const { handles, bridge, adapters } = makeFrameSurface();
    registerBridgeLoop(engine, bridge, adapters);

    seek(3);
    engine.interaction.setActive([ref("A", 3)]);
    engine.interaction.setHovered(ref("A", 3), true);
    expect(handles.get("A")).toMatchObject({ selected: true, hovered: true });

    // scrub past A: it unmounts, hover is pruned, selection survives
    seek(9);
    expect(handles.has("A")).toBe(false);
    expect(engine.interaction.isHovered(ref("A", 3))).toBe(false);
    expect(engine.interaction.isActive(ref("A", 3))).toBe(true);
    expect(engine.interaction.getAnchor()).toEqual(ref("A", 3));

    // scrub back: A re-mounts and re-applies the surviving selection
    seek(3);
    expect(handles.get("A")).toMatchObject({ selected: true, hovered: false });
  });
});

describe("non-temporal regression guard", () => {
  it("the default engine is non-temporal and never fires presence", () => {
    const engine = new AnnotationEngine();
    expect(engine.temporal.isTemporal).toBe(false);

    const listener = vi.fn();
    engine.temporal.subscribePresence(listener);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("attachTemporal lifecycle (the video clock binding seam)", () => {
  it("swaps the pool view for a frame view and restores it on detach", () => {
    const engine = new AnnotationEngine();
    expect(engine.temporal.isTemporal).toBe(false);

    const { clock } = makeClock();
    const detach = engine.attachTemporal(
      (e) => new FrameTemporalView(e, clock, (t) => t)
    );
    expect(engine.temporal.isTemporal).toBe(true);

    detach();
    expect(engine.temporal.isTemporal).toBe(false);
  });

  it("a stale detach does not clobber a newer attach (strict-mode safe)", () => {
    const engine = new AnnotationEngine();
    const { clock } = makeClock();

    // attach → detach → attach is the strict-mode / remount sequence
    const detach1 = engine.attachTemporal(
      (e) => new FrameTemporalView(e, clock, (t) => t)
    );
    detach1();
    expect(engine.temporal.isTemporal).toBe(false);

    const detach2 = engine.attachTemporal(
      (e) => new FrameTemporalView(e, clock, (t) => t)
    );
    const view2 = engine.temporal;

    detach1(); // stale: its view was already torn down
    expect(engine.temporal).toBe(view2);

    detach2();
    expect(engine.temporal.isTemporal).toBe(false);
  });

  it("detach disposes the frame view so later clock ticks are inert", () => {
    const { clock, seek } = makeClock();
    const store = new FakeFrameStore();
    const engine = new AnnotationEngine({
      temporal: (e) => new FrameTemporalView(e, clock, (t) => t),
    });
    engine.registerStore(store);
    store.hydrate([
      { frame: 1, instanceId: "a", label: box("a", [0, 0, 1, 1]) },
      { frame: 2, instanceId: "a", label: box("a", [0, 0, 1, 1]) },
    ]);

    const view = engine.temporal;
    const onPresence = vi.fn();
    view.subscribePresence(onPresence);

    view.dispose?.();
    seek(2); // would emit `refresh` for track "a" were the clock still wired

    expect(onPresence).not.toHaveBeenCalled();
  });
});
