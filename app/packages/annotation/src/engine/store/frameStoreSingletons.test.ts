/**
 * Per-frame singleton fields (Classification, Regression) in the FrameStore:
 * one field-addressed value per frame, persisted at `/frames/<n>/<field>`
 * through the stored document's id, with engine-owned undo.
 */

import type { LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { AnnotationEngine } from "../core/engine";
import { type LabelRef, singletonAddressId } from "../identity/ref";
import { createUndoNavigator } from "../testing/fixtures";
import type { FramesData } from "./frameStore";
import { FrameStore } from "./frameStore";

const SAMPLE = "v";
const CLS = "frames.cls";
const REG = "frames.reg";
const LABEL_TYPES = {
  [CLS]: LabelType.Classification,
  [REG]: LabelType.Regression,
};

const cls = (docId: string, label: string): LabelData => ({
  _id: singletonAddressId(CLS),
  _docId: docId,
  _cls: "Classification",
  label,
});

const ref = (path: string, frame: number): LabelRef => ({
  sample: SAMPLE,
  path,
  instanceId: singletonAddressId(path),
  frame,
});

const SEED: FramesData = {
  1: { [CLS]: [cls("doc-1", "cat")], [REG]: [] },
  2: { [CLS]: [cls("doc-2", "dog")], [REG]: [] },
};

const makeEngine = (data: FramesData = SEED) => {
  const engine = new AnnotationEngine();
  const store = new FrameStore(SAMPLE, { labelTypes: LABEL_TYPES, data });
  engine.registerStore(store);
  return { engine, store };
};

describe("FrameStore singleton persistence", () => {
  it("creates a frame's value as one document with a fresh id", () => {
    const { engine, store } = makeEngine();

    engine.updateLabel(ref(CLS, 3), {
      _id: "draft-id",
      _cls: "Classification",
      label: "bird",
    });

    const ops = store.getJsonPatch();
    expect(ops).toHaveLength(1);
    const [op] = ops as Array<{ op: string; path: string; value: LabelData }>;
    expect(op.op).toBe("add");
    expect(op.path).toBe("/frames/3/cls");
    expect(op.value).toEqual({
      _id: store.getLabel(ref(CLS, 3))?._docId,
      _cls: "Classification",
      label: "bird",
    });
    expect(op.value._id).toMatch(/^[0-9a-f]{24}$/);
  });

  it("edits only the current frame's document", () => {
    const { engine, store } = makeEngine();

    engine.updateLabel(ref(CLS, 2), { label: "wolf" });

    expect(store.getJsonPatch()).toEqual([
      { op: "replace", path: "/frames/2/cls/label", value: "wolf" },
    ]);
    expect(store.getLabel(ref(CLS, 1))?.label).toBe("cat");
    expect(store.getLabel(ref(CLS, 2))?._docId).toBe("doc-2");
  });

  it("deletes only the current frame's value", () => {
    const { engine, store } = makeEngine();

    engine.deleteLabel(ref(CLS, 1));

    expect(store.getJsonPatch()).toEqual([
      { op: "remove", path: "/frames/1/cls" },
    ]);
    expect(store.getLabel(ref(CLS, 2))?.label).toBe("dog");
  });

  it("persists a Regression value through the same field identity", () => {
    const { engine, store } = makeEngine();

    engine.updateLabel(ref(REG, 1), { _cls: "Regression", value: 0.25 });
    engine.updateLabel(ref(REG, 1), { value: 0.5 });

    const ops = store.getJsonPatch() as Array<{ value: LabelData }>;
    expect(ops).toMatchObject([
      {
        op: "add",
        path: "/frames/1/reg",
        value: { _cls: "Regression", value: 0.5 },
      },
    ]);
    expect(ops[0].value).not.toHaveProperty("_docId");
  });

  it("rebases a persisted create so the frame is clean and keeps its id", () => {
    const { engine, store } = makeEngine();

    engine.updateLabel(ref(CLS, 3), { _cls: "Classification", label: "bird" });
    const docId = store.getLabel(ref(CLS, 3))?._docId;
    store.reconcilePersisted(store.getJsonPatch());

    expect(store.isDirty()).toBe(false);
    expect(store.getLabel(ref(CLS, 3))).toEqual({
      _id: singletonAddressId(CLS),
      _docId: docId,
      _cls: "Classification",
      label: "bird",
    });
  });
});

describe("FrameStore singleton undo", () => {
  it("undo restores an edited value", () => {
    const { engine, store } = makeEngine();
    const nav = createUndoNavigator(engine);

    engine.updateLabel(ref(CLS, 2), { label: "wolf" });
    nav.undo();

    expect(store.getLabel(ref(CLS, 2))).toEqual(cls("doc-2", "dog"));
    expect(store.getJsonPatch()).toEqual([]);
  });

  it("undo restores a deleted value under its original document id", () => {
    const { engine, store } = makeEngine();
    const nav = createUndoNavigator(engine);

    engine.deleteLabel(ref(CLS, 1));
    nav.undo();

    expect(store.getLabel(ref(CLS, 1))).toEqual(cls("doc-1", "cat"));
    expect(store.getJsonPatch()).toEqual([]);
  });

  it("undo removes a created value", () => {
    const { engine, store } = makeEngine();
    const nav = createUndoNavigator(engine);

    engine.updateLabel(ref(CLS, 3), { _cls: "Classification", label: "bird" });
    expect(store.getJsonPatch()).toHaveLength(1);
    nav.undo();

    expect(store.getLabel(ref(CLS, 3))).toBeUndefined();
    expect(store.getJsonPatch()).toEqual([]);
  });
});
