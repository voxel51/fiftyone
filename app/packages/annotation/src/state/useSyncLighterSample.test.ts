import type { Scene2D } from "@fiftyone/lighter";
import { Sample, SampleChangeKind } from "@fiftyone/utilities";
import type { Schema } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import { applyChangeToOverlay } from "./useSyncLighterSample";

const schema = {
  ground_truth: {
    embeddedDocType: "fiftyone.core.labels.Detections",
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    fields: {
      detections: {
        ftype: "fiftyone.core.fields.ListField",
        subfield: "fiftyone.core.fields.EmbeddedDocumentField",
      },
    },
  },
  classification: {
    embeddedDocType: "fiftyone.core.labels.Classification",
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
  },
} as unknown as Schema;

const det = (id: string, label = "cat") => ({
  _id: id,
  _cls: "Detection",
  label,
});

type MockOverlay = {
  id: string;
  field: string;
  label: Record<string, unknown>;
  applyLabel: ReturnType<typeof vi.fn>;
  isInteracting?: () => boolean;
};

const makeOverlay = (
  o: Partial<MockOverlay> & { id: string; field: string }
): MockOverlay => ({
  label: { _id: o.id },
  applyLabel: vi.fn(),
  ...o,
});

const makeScene = (overlays: MockOverlay[]) => {
  const map = new Map(overlays.map((o) => [o.id, o]));
  const removeOverlay = vi.fn();
  const scene = {
    getOverlay: (id: string) => map.get(id),
    getAllOverlays: () => [...map.values()],
    removeOverlay,
  } as unknown as Scene2D;
  return { scene, removeOverlay };
};

const detectionsSample = () =>
  new Sample({
    schema,
    data: { ground_truth: { _cls: "Detections", detections: [det("d1")] } },
  });

describe("applyChangeToOverlay (Lighter read-half)", () => {
  it("re-applies the resolved list label onto the matching overlay", () => {
    const sample = detectionsSample();
    const overlay = makeOverlay({ id: "d1", field: "ground_truth" });
    const { scene } = makeScene([overlay]);

    applyChangeToOverlay(scene, sample, {
      path: "ground_truth",
      labelId: "d1",
      kind: SampleChangeKind.Update,
    });

    expect(overlay.applyLabel).toHaveBeenCalledTimes(1);
    expect(overlay.applyLabel).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "d1", label: "cat" })
    );
  });

  it("re-applies on a per-path reset", () => {
    const sample = detectionsSample();
    const overlay = makeOverlay({ id: "d1", field: "ground_truth" });
    const { scene } = makeScene([overlay]);

    applyChangeToOverlay(scene, sample, {
      path: "ground_truth",
      labelId: "d1",
      kind: SampleChangeKind.Reset,
    });

    expect(overlay.applyLabel).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "d1", label: "cat" })
    );
  });

  it("reconciles every element on a list-field reset with no labelId", () => {
    // reconcilePersisted releases a server-owned field keyed by the parent list
    // path, so the change has no labelId. Each element must be applied to its
    // own overlay — never the Detections container to a single overlay.
    const sample = new Sample({
      schema,
      data: {
        ground_truth: {
          _cls: "Detections",
          detections: [det("d1"), det("d2")],
        },
      },
    });
    const o1 = makeOverlay({ id: "d1", field: "ground_truth" });
    const o2 = makeOverlay({ id: "d2", field: "ground_truth" });
    const { scene } = makeScene([o1, o2]);

    applyChangeToOverlay(scene, sample, {
      path: "ground_truth",
      kind: SampleChangeKind.Reset,
    });

    expect(o1.applyLabel).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "d1" })
    );
    expect(o2.applyLabel).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "d2" })
    );
    // Never the parent container.
    expect(o1.applyLabel).not.toHaveBeenCalledWith(
      expect.objectContaining({ detections: expect.anything() })
    );
  });

  it("resolves a single label by path when there is no labelId", () => {
    const sample = new Sample({
      schema,
      data: {
        classification: { _id: "c1", _cls: "Classification", label: "dog" },
      },
    });
    const overlay = makeOverlay({ id: "c1", field: "classification" });
    const { scene } = makeScene([overlay]);

    applyChangeToOverlay(scene, sample, {
      path: "classification",
      kind: SampleChangeKind.Update,
    });

    expect(overlay.applyLabel).toHaveBeenCalledWith(
      expect.objectContaining({ label: "dog" })
    );
  });

  it("finds an overlay by field + label _id when its id differs (scan fallback)", () => {
    const sample = detectionsSample();
    // Overlay id differs from the label _id; only the label._id matches.
    const overlay = makeOverlay({
      id: "overlay-xyz",
      field: "ground_truth",
      label: { _id: "d1" },
    });
    const { scene } = makeScene([overlay]);

    applyChangeToOverlay(scene, sample, {
      path: "ground_truth",
      labelId: "d1",
      kind: SampleChangeKind.Update,
    });

    expect(overlay.applyLabel).toHaveBeenCalledTimes(1);
  });

  it("leaves deletions to the existing command path", () => {
    const sample = detectionsSample();
    const overlay = makeOverlay({ id: "d1", field: "ground_truth" });
    const { scene, removeOverlay } = makeScene([overlay]);

    applyChangeToOverlay(scene, sample, {
      path: "ground_truth",
      labelId: "d1",
      kind: SampleChangeKind.Delete,
    });

    expect(overlay.applyLabel).not.toHaveBeenCalled();
    expect(removeOverlay).not.toHaveBeenCalled();
  });

  it("ignores the whole-sample reset sentinel", () => {
    const sample = detectionsSample();
    const overlay = makeOverlay({ id: "d1", field: "ground_truth" });
    const { scene } = makeScene([overlay]);

    applyChangeToOverlay(scene, sample, {
      path: "",
      kind: SampleChangeKind.Reset,
    });

    expect(overlay.applyLabel).not.toHaveBeenCalled();
  });

  it("skips an overlay that is mid-gesture", () => {
    const sample = detectionsSample();
    const overlay = makeOverlay({
      id: "d1",
      field: "ground_truth",
      isInteracting: () => true,
    });
    const { scene } = makeScene([overlay]);

    applyChangeToOverlay(scene, sample, {
      path: "ground_truth",
      labelId: "d1",
      kind: SampleChangeKind.Update,
    });

    expect(overlay.applyLabel).not.toHaveBeenCalled();
  });

  it("is a no-op when no overlay backs the change (create out of scope)", () => {
    const sample = detectionsSample();
    const { scene, removeOverlay } = makeScene([]);

    expect(() =>
      applyChangeToOverlay(scene, sample, {
        path: "ground_truth",
        labelId: "d1",
        kind: SampleChangeKind.Update,
      })
    ).not.toThrow();
    expect(removeOverlay).not.toHaveBeenCalled();
  });
});
