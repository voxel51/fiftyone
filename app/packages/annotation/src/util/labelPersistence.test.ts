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
  applyDeltaToSample,
  buildUpdatesForDelta,
  saveAnnotationDeltas,
} from "./labelPersistence";
import { pendingEdits } from "../persistence/pendingEdits";
import type { LabelFieldDelta } from "../deltas";
import type { Sample } from "@fiftyone/looker";

const delta: LabelFieldDelta = {
  field: "ground_truth",
  listKey: "detections",
  labelId: "det-1",
  previousValue: { _id: "det-1", label: "cat" },
  newValue: { _id: "det-1", label: "dog" },
};

describe("buildUpdatesForDelta", () => {
  it("builds a single source update for a normal view", () => {
    const updates = buildUpdatesForDelta(delta, {
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
        previousValue: delta.previousValue,
        newValue: delta.newValue,
      },
    ]);
  });

  it("builds one source-addressed update with sync hints for a generated view", () => {
    // Generated datasets are a server-side concept: the client never fans
    // out or addresses generated collections — the server derives the sync
    // from the hints.
    const updates = buildUpdatesForDelta(delta, {
      datasetId: "ds1",
      sample: { _id: "patch1", _sample_id: "src1" } as unknown as Sample,
      updateSample: vi.fn(),
      isGenerated: true,
      generatedDatasetName: "pds",
    });
    expect(updates).toEqual([
      {
        collection: "samples.ds1",
        id: "src1",
        lookupPath: "ground_truth.detections",
        labelId: "det-1",
        previousValue: delta.previousValue,
        newValue: delta.newValue,
        generatedDatasetName: "pds",
        generatedSampleId: "patch1",
      },
    ]);
  });

  it("uses the field path directly for a primitive change", () => {
    const prim: LabelFieldDelta = {
      field: "tags",
      listKey: null,
      labelId: null,
      previousValue: [],
      newValue: ["a"],
    };
    const updates = buildUpdatesForDelta(prim, {
      datasetId: "ds1",
      sample: { _id: "s1" } as Sample,
      updateSample: vi.fn(),
    });
    expect(updates[0].lookupPath).toBe("tags");
    expect(updates[0].labelId).toBeNull();
  });

  it("throws (rather than half-saving) when a generated id is missing", () => {
    // Missing generated dataset name → would send generatedDatasetName: undefined.
    expect(() =>
      buildUpdatesForDelta(delta, {
        datasetId: "ds1",
        sample: { _id: "patch1", _sample_id: "src1" } as unknown as Sample,
        updateSample: vi.fn(),
        isGenerated: true,
        generatedDatasetName: undefined,
      })
    ).toThrow();

    // Missing source sample id → would silently skip the source write.
    expect(() =>
      buildUpdatesForDelta(delta, {
        datasetId: "ds1",
        sample: { _id: "patch1" } as unknown as Sample,
        updateSample: vi.fn(),
        isGenerated: true,
        generatedDatasetName: "pds",
      })
    ).toThrow();
  });
});

describe("applyDeltaToSample", () => {
  it("applies a nested (dotted) field change", () => {
    const sample = {
      dynamic: {
        ground_truth: { detections: [{ _id: "det-1", label: "cat" }] },
      },
    } as Record<string, unknown>;
    const nested: LabelFieldDelta = {
      field: "dynamic.ground_truth",
      listKey: "detections",
      labelId: "det-1",
      previousValue: { _id: "det-1", label: "cat" },
      newValue: { _id: "det-1", label: "dog" },
    };

    const next = { ...sample };
    applyDeltaToSample(next, nested);

    // written at the real nested field, not under a literal dotted key
    expect((next as any).dynamic.ground_truth.detections[0].label).toBe("dog");
    expect(next["dynamic.ground_truth"]).toBeUndefined();
  });

  it("appends a new label to an existing list", () => {
    const next: Record<string, unknown> = {
      ground_truth: { detections: [{ _id: "det-1", label: "cat" }] },
    };

    applyDeltaToSample(next, {
      ...delta,
      labelId: "det-2",
      previousValue: null,
      newValue: { _id: "det-2", label: "dog" },
    });

    expect((next as any).ground_truth.detections).toHaveLength(2);
  });

  it("removes a deleted label from the list", () => {
    const next: Record<string, unknown> = {
      ground_truth: {
        detections: [
          { _id: "det-1", label: "cat" },
          { _id: "det-2", label: "dog" },
        ],
      },
    };

    applyDeltaToSample(next, { ...delta, newValue: null });

    expect((next as any).ground_truth.detections).toEqual([
      { _id: "det-2", label: "dog" },
    ]);
  });

  it("creates the list container for the first label in an empty field", () => {
    // Writing the label flat here would corrupt the field's shape and poison
    // every later delta's previous value.
    const next: Record<string, unknown> = {};

    applyDeltaToSample(next, {
      ...delta,
      previousValue: null,
      newValue: { _id: "det-1", label: "cat" },
    });

    expect((next as any).ground_truth).toEqual({
      _cls: "Detections",
      detections: [{ _id: "det-1", label: "cat" }],
    });
  });

  it("replaces a flat (to_patches) label matched by identity", () => {
    const next: Record<string, unknown> = {
      ground_truth: { _id: "det-1", _cls: "Detection", label: "cat" },
    };

    applyDeltaToSample(next, {
      ...delta,
      newValue: { _id: "det-1", _cls: "Detection", label: "dog" },
    });

    expect((next as any).ground_truth.label).toBe("dog");
  });

  it("sets and deletes primitive fields", () => {
    const next: Record<string, unknown> = { notes: "old" };
    const prim: LabelFieldDelta = {
      field: "notes",
      listKey: null,
      labelId: null,
      previousValue: "old",
      newValue: "new",
    };

    applyDeltaToSample(next, prim);
    expect(next.notes).toBe("new");

    applyDeltaToSample(next, { ...prim, previousValue: "new", newValue: null });
    expect("notes" in next).toBe(false);
  });
});

describe("saveAnnotationDeltas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingEdits.reset();
  });

  it("sends updates and leaves display state alone on success", async () => {
    // Every edit already wrote through to the canonical copy at record time —
    // a clean save must not produce another display write.
    vi.mocked(saveAnnotationFieldUpdates).mockResolvedValue(undefined);
    const updateSample = vi.fn();
    const sample = {
      _id: "s1",
      ground_truth: { detections: [{ _id: "det-1", label: "cat" }] },
    } as unknown as Sample;

    const ok = await saveAnnotationDeltas([delta], {
      datasetId: "ds1",
      sample,
      updateSample,
      isGenerated: false,
    });

    expect(ok).toBe(true);
    expect(saveAnnotationFieldUpdates).toHaveBeenCalledOnce();
    expect(updateSample).not.toHaveBeenCalled();
  });

  it("skips the request and does not refresh when there are no changes", async () => {
    const updateSample = vi.fn();
    const ok = await saveAnnotationDeltas([], {
      datasetId: "ds1",
      sample: { _id: "s1" } as Sample,
      updateSample,
    });
    expect(ok).toBe(true);
    expect(saveAnnotationFieldUpdates).not.toHaveBeenCalled();
    expect(updateSample).not.toHaveBeenCalled();
  });

  it("reconciles the full document and rethrows on conflict", async () => {
    // The server returns the whole document, so a concurrently-changed *other*
    // field is reconciled too — not just the one we tried to write.
    const conflict = new SaveConflictError([
      {
        index: 0,
        value: {
          _id: "s1",
          ground_truth: { detections: [{ _id: "det-1", label: "other" }] },
          primitive_field: "also_changed",
        },
      },
    ]);
    vi.mocked(saveAnnotationFieldUpdates).mockRejectedValue(conflict);
    const updateSample = vi.fn();
    const sample = {
      _id: "s1",
      ground_truth: { detections: [{ _id: "det-1", label: "cat" }] },
    } as unknown as Sample;

    await expect(
      saveAnnotationDeltas([delta], {
        datasetId: "ds1",
        sample,
        updateSample,
        isGenerated: false,
      })
    ).rejects.toBe(conflict);

    expect(updateSample).toHaveBeenCalledOnce();
    const updated = updateSample.mock.calls[0][0];
    expect(updated.ground_truth.detections[0].label).toBe("other");
    expect(updated.primitive_field).toBe("also_changed");
  });

  it("re-applies still-pending edits on top of the server's conflict state", async () => {
    // The user kept editing other labels while the save was on the wire; the
    // reconciled document must show server truth for the conflicted label AND
    // the user's unsaved intent for everything else.
    const conflict = new SaveConflictError([
      {
        index: 0,
        value: {
          _id: "s1",
          ground_truth: { detections: [{ _id: "det-1", label: "other" }] },
        },
      },
    ]);
    vi.mocked(saveAnnotationFieldUpdates).mockRejectedValue(conflict);
    const updateSample = vi.fn();
    const sample = {
      _id: "s1",
      ground_truth: {
        detections: [
          { _id: "det-1", label: "cat" },
          { _id: "det-2", label: "bird" },
        ],
      },
    } as unknown as Sample;

    // A pending, unflushed edit to a different label.
    pendingEdits.record("s1", {
      field: "ground_truth",
      listKey: "detections",
      labelId: "det-2",
      previousValue: { _id: "det-2", label: "bird" },
      newValue: { _id: "det-2", label: "eagle" },
    });

    await expect(
      saveAnnotationDeltas([delta], {
        datasetId: "ds1",
        sample,
        updateSample,
        isGenerated: false,
      })
    ).rejects.toBe(conflict);

    const updated = updateSample.mock.calls[0][0];
    const byId = Object.fromEntries(
      updated.ground_truth.detections.map((d: { _id: string }) => [d._id, d])
    );
    expect(byId["det-1"].label).toBe("other"); // server truth
    expect(byId["det-2"].label).toBe("eagle"); // unsaved intent preserved
  });

  it("returns false on a non-conflict failure", async () => {
    vi.mocked(saveAnnotationFieldUpdates).mockRejectedValue(
      new Error("network")
    );
    const ok = await saveAnnotationDeltas([delta], {
      datasetId: "ds1",
      sample: { _id: "s1" } as Sample,
      updateSample: vi.fn(),
      isGenerated: false,
    });
    expect(ok).toBe(false);
  });
});
