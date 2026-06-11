import type { Field, LabelData, Schema } from "@fiftyone/utilities";
import { LabelType, Sample } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";

import type { LabelRef } from "../identity/ref";
import { SampleLabelStore } from "./sampleLabelStore";
import { isWholeSampleReset } from "./types";

const field = (
  embeddedDocType: string | null,
  fields?: Schema,
  extras: Partial<Field> = {}
): Field => ({
  dbField: null,
  description: null,
  embeddedDocType,
  ftype: "fiftyone.core.fields.EmbeddedDocumentField",
  info: null,
  name: "",
  path: "",
  subfield: null,
  ...(fields ? { fields } : {}),
  ...extras,
});

const schema: Schema = {
  ground_truth: field("fiftyone.core.labels.Detections", {
    detections: field(null, undefined, {
      ftype: "fiftyone.core.fields.ListField",
      subfield: "fiftyone.core.fields.EmbeddedDocumentField",
    }),
  }),
  classification: field("fiftyone.core.labels.Classification"),
  uuid: field(null, undefined, { ftype: "fiftyone.core.fields.StringField" }),
};

const makeDet = (id: string, label: string): LabelData => ({
  _id: id,
  _cls: "Detection",
  label,
});

const SAMPLE = "sample-1";

const makeStore = (data: Record<string, unknown> = {}) => {
  const sample = new Sample({ data, schema });
  return { sample, store: new SampleLabelStore(SAMPLE, sample) };
};

const ref = (path: string, instanceId: string, sample = SAMPLE): LabelRef => ({
  sample,
  path,
  instanceId,
});

describe("SampleLabelStore resolution", () => {
  it("resolves a list-label element by ref", () => {
    const { store } = makeStore({
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });

    expect(store.getLabel(ref("ground_truth", "d2"))?.label).toBe("dog");
    expect(store.getLabel(ref("ground_truth", "nope"))).toBeUndefined();
  });

  it("resolves a single label only when the instanceId matches its _id", () => {
    const { store } = makeStore({
      classification: { _id: "c1", _cls: "Classification", label: "sunny" },
    });

    expect(store.getLabel(ref("classification", "c1"))?.label).toBe("sunny");
    expect(store.getLabel(ref("classification", "other"))).toBeUndefined();
  });

  it("lists single-label paths as zero-or-one element lists", () => {
    const { store } = makeStore({
      classification: { _id: "c1", _cls: "Classification", label: "sunny" },
    });

    expect(store.listLabels("classification")).toHaveLength(1);
    expect(store.listLabels("ground_truth")).toEqual([]);
  });

  it("enumerates current refs filtered by kind", () => {
    const { store } = makeStore({
      ground_truth: { detections: [makeDet("d1", "cat")] },
      classification: { _id: "c1", _cls: "Classification", label: "sunny" },
    });

    expect(store.enumerateLabels([LabelType.Detections])).toEqual([
      ref("ground_truth", "d1"),
    ]);
    expect(
      store.enumerateLabels([LabelType.Detections, LabelType.Classification])
    ).toHaveLength(2);
  });
});

describe("SampleLabelStore mutation", () => {
  it("stamps _id = ref.instanceId on update (refs own identity)", () => {
    const { store } = makeStore();

    store.updateLabel(ref("ground_truth", "d9"), { label: "bird" });

    expect(store.getLabel(ref("ground_truth", "d9"))).toMatchObject({
      _id: "d9",
      label: "bird",
    });
  });

  it("replaceLabel writes the exact value — absent keys end up absent", () => {
    const { store } = makeStore({
      ground_truth: {
        detections: [{ ...makeDet("d1", "cat"), confidence: 0.9 }],
      },
    });

    store.replaceLabel(ref("ground_truth", "d1"), makeDet("d1", "cat"));

    expect(store.getLabel(ref("ground_truth", "d1"))).toEqual(
      makeDet("d1", "cat")
    );

    // updateLabel by contrast merges
    store.updateLabel(ref("ground_truth", "d1"), { confidence: 0.5 });
    expect(store.getLabel(ref("ground_truth", "d1"))).toMatchObject({
      label: "cat",
      confidence: 0.5,
    });
  });

  it("deletes a list element by ref", () => {
    const { store } = makeStore({
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });

    store.deleteLabel(ref("ground_truth", "d1"));

    expect(store.getLabel(ref("ground_truth", "d1"))).toBeUndefined();
    expect(store.getLabel(ref("ground_truth", "d2"))).toBeDefined();
  });

  it("deletes a single label only when the ref resolves", () => {
    const { store } = makeStore({
      classification: { _id: "c1", _cls: "Classification", label: "sunny" },
    });

    store.deleteLabel(ref("classification", "other"));
    expect(store.getLabel(ref("classification", "c1"))).toBeDefined();

    store.deleteLabel(ref("classification", "c1"));
    expect(store.getLabel(ref("classification", "c1"))).toBeUndefined();
  });
});

describe("SampleLabelStore change translation", () => {
  it("translates element-addressed changes directly to full refs", () => {
    const { store } = makeStore();
    const listener = vi.fn();
    store.subscribeChanges(listener);

    store.updateLabel(ref("ground_truth", "d1"), { label: "cat" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([
      { ref: ref("ground_truth", "d1"), kind: "update" },
    ]);
  });

  it("translates single-label updates without a labelId via the index", () => {
    const { sample, store } = makeStore();
    const listener = vi.fn();
    store.subscribeChanges(listener);

    sample.updateLabel("classification", { _id: "c1", label: "sunny" });

    expect(listener).toHaveBeenCalledWith([
      { ref: ref("classification", "c1"), kind: "update" },
    ]);
  });

  it("expands a path-level replace into per-ref deletes and updates", () => {
    const { sample, store } = makeStore({
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });
    const listener = vi.fn();
    store.subscribeChanges(listener);

    // wholesale field replace: d1 survives, d2 vanishes, d3 appears
    sample.setField("ground_truth", {
      detections: [makeDet("d1", "cat"), makeDet("d3", "bird")],
    });

    const changes = listener.mock.calls[0][0];
    expect(changes).toContainEqual({
      ref: ref("ground_truth", "d2"),
      kind: "delete",
    });
    expect(changes).toContainEqual({
      ref: ref("ground_truth", "d1"),
      kind: "update",
    });
    expect(changes).toContainEqual({
      ref: ref("ground_truth", "d3"),
      kind: "update",
    });
  });

  it("emits the whole-sample reset sentinel on setData and clear", () => {
    const { store } = makeStore();
    const listener = vi.fn();
    store.subscribeChanges(listener);

    store.setData({ ground_truth: { detections: [makeDet("d1", "cat")] } });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(isWholeSampleReset(listener.mock.calls[0][0][0])).toBe(true);

    // index rebuilt from the new data: deleting d1 now translates directly
    store.deleteLabel(ref("ground_truth", "d1"));
    expect(listener).toHaveBeenLastCalledWith([
      { ref: ref("ground_truth", "d1"), kind: "delete" },
    ]);
  });

  it("does not emit label changes for non-label fields", () => {
    const { sample, store } = makeStore();
    const listener = vi.fn();
    store.subscribeChanges(listener);

    sample.setField("uuid", "xyz");

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("SampleLabelStore snapshot/restore", () => {
  it("rolls back transient edits and emits per-path resets", () => {
    const { store } = makeStore({
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const snapshot = store.snapshot();

    store.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
    store.updateLabel(ref("ground_truth", "d2"), { label: "bird" });
    expect(store.isDirty()).toBe(true);

    const listener = vi.fn();
    store.subscribeChanges(listener);
    store.restore(snapshot);

    expect(store.isDirty()).toBe(false);
    expect(store.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(store.getLabel(ref("ground_truth", "d2"))).toBeUndefined();

    // the restore surfaced as per-ref changes (d2 vanished, d1 re-read)
    const changes = listener.mock.calls[0][0];
    expect(changes).toContainEqual({
      ref: ref("ground_truth", "d2"),
      kind: "delete",
    });
    expect(changes).toContainEqual({
      ref: ref("ground_truth", "d1"),
      kind: "reset",
    });
  });

  it("a snapshot can be restored more than once", () => {
    const { store } = makeStore();
    const snapshot = store.snapshot();

    store.updateLabel(ref("ground_truth", "d1"), { label: "cat" });
    store.restore(snapshot);
    store.updateLabel(ref("ground_truth", "d2"), { label: "dog" });
    store.restore(snapshot);

    expect(store.isDirty()).toBe(false);
    expect(store.listLabels("ground_truth")).toEqual([]);
  });
});

describe("SampleLabelStore dirty introspection", () => {
  it("reports pending paths and dirtiness", () => {
    const { store } = makeStore();

    expect(store.isDirty()).toBe(false);
    expect(store.pendingPaths()).toEqual([]);

    store.updateLabel(ref("ground_truth", "d1"), { label: "cat" });

    expect(store.isDirty()).toBe(true);
    expect(store.pendingPaths()).toEqual(["ground_truth"]);
  });
});
