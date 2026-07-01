/**
 * The composite video store: path-ownership routing (frame paths → FrameStore,
 * everything else → the sample store), unioned enumerate/persist/dirty, the
 * `/frames`-prefixed reconcile partition, bundled snapshot/restore, and the
 * sample-only `setData` seam.
 */

import type {
  JSONDeltas,
  LabelData,
  TransientSnapshot,
} from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";

import type { LabelRef } from "../identity/ref";
import type { FramesData } from "./frameStore";
import { FrameStore } from "./frameStore";
import type { SampleLabelStore } from "./sampleLabelStore";
import type { ChangeListener, DisplayListener, LabelStore } from "./types";
import { VideoLabelStore } from "./videoLabelStore";

const SAMPLE = "v";
const FRAME_PATH = "frames.detections";
const TD_PATH = "events";

const det = (docId: string, trackId: string): LabelData => ({
  _id: docId,
  _cls: "Detection",
  instance: { _id: trackId, _cls: "Instance" },
  label: "x",
  bounding_box: [0, 0, 1, 1],
});

const frameRef = (instanceId: string, frame: number): LabelRef => ({
  sample: SAMPLE,
  path: FRAME_PATH,
  instanceId,
  frame,
});

const tdRef = (instanceId: string): LabelRef => ({
  sample: SAMPLE,
  path: TD_PATH,
  instanceId,
});

/** A recording sample-level store: knows only `TD_PATH`, logs every call. */
class FakeSampleStore implements LabelStore {
  readonly sample = SAMPLE;
  readonly calls: string[] = [];
  dirty = false;
  reconciled: JSONDeltas | null = null;
  lastSetData: Record<string, unknown> | null = null;
  readonly restored: TransientSnapshot[] = [];

  getLabel(ref: LabelRef): LabelData | undefined {
    this.calls.push(`getLabel:${ref.path}`);
    return ref.path === TD_PATH
      ? { _id: ref.instanceId, _cls: "TD" }
      : undefined;
  }

  listLabels(path: string): LabelData[] {
    this.calls.push(`listLabels:${path}`);
    return [];
  }

  getLabelType(path: string): LabelType {
    return path === TD_PATH ? LabelType.Classifications : LabelType.Unknown;
  }

  enumerateLabels(): LabelRef[] {
    return [tdRef("td-1")];
  }

  dirtyFrames(): number[] {
    return [];
  }

  updateLabel(ref: LabelRef): void {
    this.calls.push(`updateLabel:${ref.path}`);
  }

  replaceLabel(ref: LabelRef): void {
    this.calls.push(`replaceLabel:${ref.path}`);
  }

  deleteLabel(ref: LabelRef): void {
    this.calls.push(`deleteLabel:${ref.path}`);
  }

  subscribe(_listener: DisplayListener): () => void {
    return vi.fn();
  }

  subscribeChanges(_listener: ChangeListener): () => void {
    return vi.fn();
  }

  snapshot(): TransientSnapshot {
    return { tag: "sample" } as unknown as TransientSnapshot;
  }

  restore(snapshot: TransientSnapshot): void {
    this.restored.push(snapshot);
  }

  getJsonPatch(): JSONDeltas {
    return this.dirty ? [{ op: "add", path: "/events", value: [] }] : [];
  }

  pendingPaths(): readonly string[] {
    return this.dirty ? [TD_PATH] : [];
  }

  isDirty(): boolean {
    return this.dirty;
  }

  captureBaseline(): void {
    this.calls.push("captureBaseline");
  }

  reconcilePersisted(deltas: JSONDeltas): void {
    this.reconciled = deltas;
  }

  setData(data: Record<string, unknown>): void {
    this.lastSetData = data;
  }

  clear(): void {
    this.calls.push("clear");
  }
}

const make = (frameData?: FramesData) => {
  const frames = new FrameStore(SAMPLE, {
    labelTypes: { [FRAME_PATH]: LabelType.Detections },
    data: frameData,
  });
  const sampleLevel = new FakeSampleStore();
  const store = new VideoLabelStore(
    SAMPLE,
    frames,
    sampleLevel as unknown as SampleLabelStore,
  );

  return { store, frames, sampleLevel };
};

describe("VideoLabelStore routing", () => {
  it("routes frame-path reads/writes to the FrameStore", () => {
    const { store } = make({ 1: { [FRAME_PATH]: [det("doc-1", "A")] } });

    expect(store.getLabel(frameRef("A", 1))?._id).toBe("doc-1");

    store.updateLabel(frameRef("A", 1), { label: "y" });
    expect(store.getLabel(frameRef("A", 1))?.label).toBe("y");

    store.deleteLabel(frameRef("A", 1));
    expect(store.getLabel(frameRef("A", 1))).toBeUndefined();
  });

  it("routes sample-level paths to the sample store", () => {
    const { store, sampleLevel } = make();

    expect(store.getLabel(tdRef("td-1"))?._cls).toBe("TD");
    store.updateLabel(tdRef("td-1"), { label: "z" });
    store.deleteLabel(tdRef("td-1"));

    expect(sampleLevel.calls).toEqual([
      "getLabel:events",
      "updateLabel:events",
      "deleteLabel:events",
    ]);
  });

  it("reports the type from whichever backing owns the path", () => {
    const { store } = make();

    expect(store.getLabelType(FRAME_PATH)).toBe(LabelType.Detections);
    expect(store.getLabelType(TD_PATH)).toBe(LabelType.Classifications);
    expect(store.getLabelType("nope")).toBe(LabelType.Unknown);
  });

  it("unions enumerateLabels across both backings", () => {
    const { store } = make({ 1: { [FRAME_PATH]: [det("doc-1", "A")] } });

    const refs = store.enumerateLabels([
      LabelType.Detections,
      LabelType.Classifications,
    ]);

    expect(refs.map((r) => r.instanceId).sort()).toEqual(["A", "td-1"]);
    expect(refs.find((r) => r.instanceId === "A")?.frame).toBe(1);
  });
});

describe("VideoLabelStore persistence", () => {
  it("unions getJsonPatch and ORs dirty across backings", () => {
    const { store, sampleLevel } = make({
      1: { [FRAME_PATH]: [det("doc-1", "A")] },
    });

    expect(store.isDirty()).toBe(false);

    store.updateLabel(frameRef("A", 1), { label: "y" });
    sampleLevel.dirty = true;

    expect(store.isDirty()).toBe(true);

    const ops = store.getJsonPatch();
    const containers = ops.map((op) => op.path);
    expect(containers.some((p) => p.startsWith("/frames/1/detections"))).toBe(
      true,
    );
    expect(containers).toContain("/events");
  });

  it("partitions reconcile deltas by the /frames/ prefix", () => {
    const { store, frames, sampleLevel } = make();
    const reconcileSpy = vi.spyOn(frames, "reconcilePersisted");

    store.reconcilePersisted([
      { op: "add", path: "/frames/1/detections/detections/-", value: {} },
      { op: "add", path: "/events", value: [] },
    ]);

    expect(reconcileSpy).toHaveBeenCalledWith([
      { op: "add", path: "/frames/1/detections/detections/-", value: {} },
    ]);
    expect(sampleLevel.reconciled).toEqual([
      { op: "add", path: "/events", value: [] },
    ]);
  });
});

describe("VideoLabelStore lifecycle", () => {
  it("seeds only the sample backing via setData", () => {
    const { store, sampleLevel } = make();

    store.setData({ events: { detections: [] } });

    expect(sampleLevel.lastSetData).toEqual({ events: { detections: [] } });
  });

  it("clears both backings", () => {
    const { store, frames, sampleLevel } = make({
      1: { [FRAME_PATH]: [det("doc-1", "A")] },
    });

    store.clear();

    expect(frames.listLabels(FRAME_PATH)).toEqual([]);
    expect(sampleLevel.calls).toContain("clear");
  });

  it("bundles and restores both children's snapshots", () => {
    const { store, frames, sampleLevel } = make({
      1: { [FRAME_PATH]: [det("doc-1", "A")] },
    });

    const snap = store.snapshot();
    store.updateLabel(frameRef("A", 1), { label: "edited" });
    expect(store.getLabel(frameRef("A", 1))?.label).toBe("edited");

    store.restore(snap);

    // the frame edit (working overlay) is rolled back; the sample child sees
    // its own bundled snapshot
    expect(frames.isDirty()).toBe(false);
    expect(sampleLevel.restored).toHaveLength(1);
  });
});
