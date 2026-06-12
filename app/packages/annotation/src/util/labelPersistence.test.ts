import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@fiftyone/core/src/client", () => {
  class SaveConflictError extends Error {
    constructor(readonly conflicts: { index: number; value: unknown }[] = []) {
      super("Annotation save conflict");
      this.name = "Save Conflict Error";
    }
  }
  return {
    saveAnnotationFieldUpdates: vi.fn(),
    SaveConflictError,
    // identity transform — values in tests are already in FE shape
    transformSampleData: (v: Record<string, unknown>) => v,
  };
});

import {
  saveAnnotationFieldUpdates,
  SaveConflictError,
} from "@fiftyone/core/src/client";
import {
  buildUpdatesForChange,
  saveAnnotationChanges,
  handleLabelPersistence,
} from "./labelPersistence";
import type { LabelFieldChange } from "../deltas";
import type { Sample } from "@fiftyone/looker";

const change: LabelFieldChange = {
  field: "ground_truth",
  listKey: "detections",
  labelId: "det-1",
  previousValue: { _id: "det-1", label: "cat" },
  newValue: { _id: "det-1", label: "dog" },
};

describe("buildUpdatesForChange", () => {
  it("builds a single source update for a normal view", () => {
    const updates = buildUpdatesForChange(change, {
      datasetId: "ds1",
      sample: { _id: "s1" } as Sample,
      updateSample: vi.fn(),
      isGenerated: false,
    });
    expect(updates).toEqual([
      {
        collection: "samples.ds1",
        id: "s1",
        lookupPath: "ground_truth.detections",
        labelId: "det-1",
        previousValue: change.previousValue,
        newValue: change.newValue,
      },
    ]);
  });

  it("builds patches + source updates for a generated view", () => {
    const updates = buildUpdatesForChange(change, {
      datasetId: "ds1",
      sample: { _id: "patch1", _sample_id: "src1" } as unknown as Sample,
      updateSample: vi.fn(),
      isGenerated: true,
      generatedDatasetName: "pds",
    });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      datasetName: "pds",
      id: "patch1",
      lookupPath: "ground_truth",
      labelId: null,
    });
    expect(updates[1]).toMatchObject({
      collection: "samples.ds1",
      id: "src1",
      lookupPath: "ground_truth.detections",
      labelId: "det-1",
    });
  });

  it("uses the field path directly for a primitive change", () => {
    const prim: LabelFieldChange = {
      field: "tags",
      listKey: null,
      labelId: null,
      previousValue: [],
      newValue: ["a"],
    };
    const updates = buildUpdatesForChange(prim, {
      datasetId: "ds1",
      sample: { _id: "s1" } as Sample,
      updateSample: vi.fn(),
    });
    expect(updates[0].lookupPath).toBe("tags");
    expect(updates[0].labelId).toBeNull();
  });

  it("deletes the patches document on a flat (to_patches) generated delete", () => {
    const del: LabelFieldChange = { ...change, newValue: null };
    const updates = buildUpdatesForChange(del, {
      datasetId: "ds1",
      // no array field on the patch sample → flat (to_patches)
      sample: { _id: "patch1", _sample_id: "src1" } as unknown as Sample,
      updateSample: vi.fn(),
      isGenerated: true,
      generatedDatasetName: "pds",
    });
    expect(updates[0]).toEqual({
      datasetName: "pds",
      id: "patch1",
      op: "deleteDocument",
    });
    expect(updates[1]).toMatchObject({
      collection: "samples.ds1",
      id: "src1",
      newValue: null,
    });
  });

  it("addresses an evaluation-patches sample as a list element", () => {
    // The patch sample stores ground_truth as an array (it also holds e.g.
    // predictions), so the patches update must target the element, not a flat
    // label.
    const evalSample = {
      _id: "patch1",
      _sample_id: "src1",
      ground_truth: { detections: [{ _id: "det-1", label: "cat" }] },
    } as unknown as Sample;

    const updates = buildUpdatesForChange(change, {
      datasetId: "ds1",
      sample: evalSample,
      updateSample: vi.fn(),
      isGenerated: true,
      generatedDatasetName: "pds",
    });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      datasetName: "pds",
      id: "patch1",
      lookupPath: "ground_truth.detections",
      labelId: "det-1",
    });
    expect(updates[1]).toMatchObject({
      collection: "samples.ds1",
      id: "src1",
      lookupPath: "ground_truth.detections",
      labelId: "det-1",
    });
  });

  it("removes the element (not the document) on an eval-patches delete", () => {
    const evalSample = {
      _id: "patch1",
      _sample_id: "src1",
      ground_truth: { detections: [{ _id: "det-1", label: "cat" }] },
    } as unknown as Sample;
    const del: LabelFieldChange = { ...change, newValue: null };

    const updates = buildUpdatesForChange(del, {
      datasetId: "ds1",
      sample: evalSample,
      updateSample: vi.fn(),
      isGenerated: true,
      generatedDatasetName: "pds",
    });
    expect(updates[0]).toMatchObject({
      datasetName: "pds",
      id: "patch1",
      lookupPath: "ground_truth.detections",
      labelId: "det-1",
      newValue: null,
    });
    expect(updates[0].op).toBeUndefined();
  });
});

describe("saveAnnotationChanges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends updates and syncs the local baseline (in place) on success", async () => {
    vi.mocked(saveAnnotationFieldUpdates).mockResolvedValue(undefined);
    const updateSample = vi.fn();
    const sample = {
      _id: "s1",
      ground_truth: { detections: [{ _id: "det-1", label: "cat" }] },
    } as unknown as Sample;

    const ok = await saveAnnotationChanges([change], {
      datasetId: "ds1",
      sample,
      updateSample,
      isGenerated: false,
    });

    expect(ok).toBe(true);
    expect(saveAnnotationFieldUpdates).toHaveBeenCalledOnce();
    expect(updateSample).toHaveBeenCalledOnce();
    const updated = updateSample.mock.calls[0][0];
    expect(updated.ground_truth.detections[0].label).toBe("dog");
  });

  it("skips the request and does not refresh when there are no changes", async () => {
    const updateSample = vi.fn();
    const ok = await saveAnnotationChanges([], {
      datasetId: "ds1",
      sample: { _id: "s1" } as Sample,
      updateSample,
    });
    expect(ok).toBe(true);
    expect(saveAnnotationFieldUpdates).not.toHaveBeenCalled();
    expect(updateSample).not.toHaveBeenCalled();
  });

  it("reconciles the affected field and rethrows on conflict", async () => {
    const conflict = new SaveConflictError([
      { index: 0, value: { detections: [{ _id: "det-1", label: "other" }] } },
    ]);
    vi.mocked(saveAnnotationFieldUpdates).mockRejectedValue(conflict);
    const updateSample = vi.fn();
    const sample = {
      _id: "s1",
      ground_truth: { detections: [{ _id: "det-1", label: "cat" }] },
    } as unknown as Sample;

    await expect(
      saveAnnotationChanges([change], {
        datasetId: "ds1",
        sample,
        updateSample,
        isGenerated: false,
      })
    ).rejects.toBe(conflict);

    expect(updateSample).toHaveBeenCalledOnce();
    const updated = updateSample.mock.calls[0][0];
    expect(updated.ground_truth.detections[0].label).toBe("other");
  });

  it("returns false on a non-conflict failure", async () => {
    vi.mocked(saveAnnotationFieldUpdates).mockRejectedValue(
      new Error("network")
    );
    const ok = await saveAnnotationChanges([change], {
      datasetId: "ds1",
      sample: { _id: "s1" } as Sample,
      updateSample: vi.fn(),
      isGenerated: false,
    });
    expect(ok).toBe(false);
  });
});

describe("handleLabelPersistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when the sample or dataset is missing", async () => {
    const ok = await handleLabelPersistence({
      sample: null,
      datasetId: "ds1",
      updateSample: vi.fn(),
      annotationLabel: { type: "Detection", path: "ground_truth" } as never,
      schema: {} as never,
      opType: "mutate",
    });
    expect(ok).toBe(false);
    expect(saveAnnotationFieldUpdates).not.toHaveBeenCalled();
  });

  it("returns false when the annotation label is missing", async () => {
    const ok = await handleLabelPersistence({
      sample: { _id: "s1" } as Sample,
      datasetId: "ds1",
      updateSample: vi.fn(),
      annotationLabel: null,
      schema: {} as never,
      opType: "mutate",
    });
    expect(ok).toBe(false);
    expect(saveAnnotationFieldUpdates).not.toHaveBeenCalled();
  });
});
