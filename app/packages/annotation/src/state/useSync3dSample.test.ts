import { Sample, SampleChangeKind, type Schema } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { reconcile3dChange } from "./useSync3dSample";

// 3D detections live in a Detections list field, like their 2D counterparts.
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
} as unknown as Schema;

const det3d = (id: string, label = "car") => ({
  _id: id,
  _cls: "Detection",
  label,
  location: [0, 0, 0],
  dimensions: [1, 1, 1],
});

const sampleWith = (...ids: string[]) =>
  new Sample({
    schema,
    data: {
      ground_truth: {
        _cls: "Detections",
        detections: ids.map((id) => det3d(id)),
      },
    },
  });

// Minimal working doc — reconcile3dChange only tests membership of labelsById.
const workingDoc = (ids: string[], deleted: string[] = []) => ({
  labelsById: Object.fromEntries(ids.map((id) => [id, { _id: id }])) as never,
  deletedIds: new Set(deleted),
});

describe("reconcile3dChange (3D read-half)", () => {
  it("upserts a resolved label that exists in the working store", () => {
    const sample = sampleWith("d1");
    const doc = workingDoc(["d1"]);

    const out = reconcile3dChange(doc, sample, {
      path: "ground_truth",
      labelId: "d1",
      kind: SampleChangeKind.Update,
    });

    expect(out).toHaveLength(1);
    expect(out[0].labelId).toBe("d1");
    expect(out[0].data).toMatchObject({ _id: "d1", label: "car" });
  });

  it("treats a per-path reset like an update", () => {
    const sample = sampleWith("d1");
    const doc = workingDoc(["d1"]);

    const out = reconcile3dChange(doc, sample, {
      path: "ground_truth",
      labelId: "d1",
      kind: SampleChangeKind.Reset,
    });

    expect(out).toHaveLength(1);
    expect(out[0].labelId).toBe("d1");
  });

  it("ignores a label not already in the working store (create out of scope)", () => {
    const sample = sampleWith("d1");
    const doc = workingDoc([]); // d1 not tracked by the 3D store

    expect(
      reconcile3dChange(doc, sample, {
        path: "ground_truth",
        labelId: "d1",
        kind: SampleChangeKind.Update,
      })
    ).toEqual([]);
  });

  it("does not reconcile deletes (the working store owns 3D deletes)", () => {
    const sample = sampleWith("d1");
    const doc = workingDoc(["d1"]);

    expect(
      reconcile3dChange(doc, sample, {
        path: "ground_truth",
        labelId: "d1",
        kind: SampleChangeKind.Delete,
      })
    ).toEqual([]);
  });

  it("ignores the whole-sample reset sentinel", () => {
    const sample = sampleWith("d1");
    const doc = workingDoc(["d1"]);

    expect(
      reconcile3dChange(doc, sample, {
        path: "",
        kind: SampleChangeKind.Reset,
      })
    ).toEqual([]);
  });

  it("fans a list-field reset (no labelId) out to each tracked element", () => {
    // reconcilePersisted releases a field keyed by the parent list path, so the
    // change carries no labelId. Each element present in the working store is
    // reconciled by its own _id; untracked elements are skipped.
    const sample = sampleWith("d1", "d2", "d3");
    const doc = workingDoc(["d1", "d3"]); // d2 not tracked by the 3D store

    const out = reconcile3dChange(doc, sample, {
      path: "ground_truth",
      kind: SampleChangeKind.Reset,
    });

    expect(out.map((u) => u.labelId).sort()).toEqual(["d1", "d3"]);
  });
});
