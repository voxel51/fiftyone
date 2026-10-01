/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Engine-level tests for a dynamic group played as video: Classification
 * writes on the anchor persist to every member, through the same store,
 * patch, and undo machinery the surface uses.
 */

import type { LabelData } from "@fiftyone/utilities";
import { LabelType, Sample } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { AnnotationEngine } from "../../../annotation/src/engine/core/engine";
import { FrameStore } from "../../../annotation/src/engine/store/frameStore";
import { SampleLabelStore } from "../../../annotation/src/engine/store/sampleLabelStore";
import { VideoLabelStore } from "../../../annotation/src/engine/store/videoLabelStore";
import {
  createUndoNavigator,
  labelSchema,
} from "../../../annotation/src/engine/testing/fixtures";
import { groupLabelValues } from "./groupLabels";
import { toMemberPatches } from "./memberPatches";

const ANCHOR = "m1";
const INDEX = ["m1", "m2", "m3"];
const CLS = { sample: ANCHOR, path: "classification", instanceId: "c1" };

const makeGroup = (anchorData: Record<string, unknown> = {}) => {
  const engine = new AnnotationEngine();
  const frames = new FrameStore(ANCHOR, {
    labelTypes: { ground_truth: LabelType.Detections },
    data: { 2: { ground_truth: [] } },
  });
  const sampleLevel = new SampleLabelStore(
    ANCHOR,
    new Sample({ data: anchorData, schema: labelSchema }),
  );
  engine.registerStore(new VideoLabelStore(ANCHOR, frames, sampleLevel));

  let next = 0;

  /** One autosave tick: the patch the dynamic-group adapter would send. */
  const save = () => {
    const [entry] = engine.getJsonPatch().filter((e) => e.deltas.length > 0);
    if (!entry) {
      return new Map<string, unknown>();
    }

    engine.captureBaseline();
    const values = groupLabelValues(entry.deltas, {
      labelType: (path) => engine.getLabelType(path),
      value: (path) => engine.listLabels({ sample: ANCHOR, path })[0],
    });
    const { patches } = toMemberPatches(entry.deltas, INDEX, ANCHOR, {
      values,
      mintId: () => `copy-${++next}`,
    });
    engine.reconcilePersisted([entry]);

    return new Map(patches.map((p) => [p.sampleId, p.patch]));
  };

  return { engine, save };
};

const copyOf = (label: Partial<LabelData>, id: string) => [
  {
    op: "add",
    path: "/classification",
    value: { _cls: "Classification", ...label, _id: id },
  },
];

describe("dynamic group Classification persistence", () => {
  it("creates the Classification on every member", () => {
    const { engine, save } = makeGroup();

    engine.updateLabel(CLS, {
      _cls: "Classification",
      _id: "c1",
      label: "cat",
    });
    const patches = save();

    expect([...patches.keys()].sort()).toEqual(INDEX);
    expect(patches.get("m2")).toEqual(copyOf({ label: "cat" }, "copy-1"));
    expect(patches.get("m3")).toEqual(copyOf({ label: "cat" }, "copy-2"));
  });

  it("writes an edit's whole label to every member", () => {
    const { engine, save } = makeGroup({
      classification: { _id: "c1", _cls: "Classification", label: "cat" },
    });

    engine.updateLabel(CLS, { label: "dog" });
    const patches = save();

    expect(patches.get("m1")).toEqual([
      { op: "replace", path: "/classification/label", value: "dog" },
    ]);
    expect(patches.get("m2")).toEqual(copyOf({ label: "dog" }, "copy-1"));
    expect(patches.get("m3")).toEqual(copyOf({ label: "dog" }, "copy-2"));
  });

  it("deletes the Classification from every member", () => {
    const { engine, save } = makeGroup({
      classification: { _id: "c1", _cls: "Classification", label: "cat" },
    });

    engine.deleteLabel(CLS);
    const patches = save();

    expect(patches.get("m1")).toEqual([
      { op: "remove", path: "/classification" },
    ]);
    for (const member of ["m2", "m3"]) {
      expect(patches.get(member)).toEqual([
        { op: "add", path: "/classification", value: null },
      ]);
    }
  });

  it("restores every member with one undo", () => {
    const { engine, save } = makeGroup({
      classification: { _id: "c1", _cls: "Classification", label: "cat" },
    });
    const navigator = createUndoNavigator(engine);

    engine.updateLabel(CLS, { label: "dog" });
    save();
    navigator.undo();
    const patches = save();

    expect(patches.get("m1")).toEqual([
      { op: "replace", path: "/classification/label", value: "cat" },
    ]);
    expect(patches.get("m2")).toEqual(copyOf({ label: "cat" }, "copy-3"));
    expect(patches.get("m3")).toEqual(copyOf({ label: "cat" }, "copy-4"));
  });

  it("keeps a per-frame detection edit on its own member", () => {
    const { engine, save } = makeGroup();

    engine.updateLabel(
      { sample: ANCHOR, path: "ground_truth", instanceId: "d1", frame: 2 },
      { _cls: "Detection", label: "car", bounding_box: [0, 0, 1, 1] },
    );
    const patches = save();

    expect([...patches.keys()]).toEqual(["m2"]);
  });
});
