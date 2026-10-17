import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { EMBEDDED_DOCUMENT_FIELD } from "@fiftyone/utilities";
import {
  setMockAtoms,
  TestSelector,
  TestSelectorFamily,
} from "../../../../__mocks__/recoil";
import { gatherPaths } from "./pathData/utils";
import * as modal from "./modal";
import * as schema from "./schema";
import * as schemaSettings from "./schemaSettings.atoms";
import { State } from "./types";

const CLASSIFICATION = "fiftyone.core.labels.Classification";
const DETECTIONS = "fiftyone.core.labels.Detections";

const labelField = (name: string, embeddedDocType: string) => ({
  name,
  path: name,
  ftype: EMBEDDED_DOCUMENT_FIELD,
  embeddedDocType,
  subfield: null,
  dbField: name,
  description: null,
  info: null,
  fields: [],
});

describe("task field exclusions and label enumeration", () => {
  it("labelFields drops task-excluded paths", () => {
    setMockAtoms({
      sampleFields: [
        labelField("ground_truth", DETECTIONS),
        labelField("clip2", CLASSIFICATION),
      ],
      frameFields: [labelField("frame_gt", DETECTIONS)],
      activeSchemaExclusions: ["clip2", "frames.frame_gt"],
    });

    const sample = <TestSelectorFamily<typeof schema.labelFields>>(
      (<unknown>schema.labelFields({ space: State.SPACE.SAMPLE }))
    );
    expect(sample()).toStrictEqual(["ground_truth"]);

    const frame = <TestSelectorFamily<typeof schema.labelFields>>(
      (<unknown>schema.labelFields({ space: State.SPACE.FRAME }))
    );
    expect(frame()).toStrictEqual([]);

    const all = <TestSelectorFamily<typeof schema.labelFields>>(
      (<unknown>schema.labelFields({}))
    );
    expect(all()).toStrictEqual(["ground_truth"]);
  });

  it("labelFields is unchanged without exclusions", () => {
    setMockAtoms({
      sampleFields: [labelField("clip2", CLASSIFICATION)],
      frameFields: [],
      activeSchemaExclusions: null,
    });

    const sample = <TestSelectorFamily<typeof schema.labelFields>>(
      (<unknown>schema.labelFields({ space: State.SPACE.SAMPLE }))
    );
    expect(sample()).toStrictEqual(["clip2"]);
  });

  it("labelPaths skips fields missing from the client schema", () => {
    // A path can survive enumeration while `field(path)` is null (e.g.
    // an exclusion applied between the two reads); it must be skipped,
    // not dereferenced (this crashed task views: "Cannot read
    // properties of null (reading 'embeddedDocType')").
    setMockAtoms({
      labelFields: () => ["ground_truth", "clip2"],
      field: (path: string) =>
        path === "ground_truth" ? { embeddedDocType: DETECTIONS } : null,
    });

    const paths = <TestSelectorFamily<typeof schema.labelPaths>>(
      (<unknown>schema.labelPaths({}))
    );
    expect(paths()).toStrictEqual(["ground_truth.detections"]);
  });

  it("fieldPaths drops task-excluded paths from both spaces", () => {
    setMockAtoms({
      flatSampleFields: [
        labelField("ground_truth", DETECTIONS),
        labelField("clip2", CLASSIFICATION),
        // The flat list carries a hidden field's children too; they go
        // with it (fieldSchema deletes the parent, so field() would be
        // null for them — the gridSortFields crash).
        labelField("clip2.label", CLASSIFICATION),
        labelField("clip2.confidence", CLASSIFICATION),
      ],
      flatFrameFields: [
        labelField("frame_gt", DETECTIONS),
        labelField("frame_gt.detections", DETECTIONS),
      ],
      activeSchemaExclusions: ["clip2", "frames.frame_gt"],
      meetsType: () => true,
    });

    const all = <TestSelectorFamily<typeof schema.fieldPaths>>(
      (<unknown>schema.fieldPaths({}))
    );
    expect(all()).toStrictEqual(["ground_truth"]);
  });

  it("gatherPaths skips fields missing from the client schema", () => {
    // The sidebar-count crash: `fieldPaths` enumerated a path whose
    // `field()` was null ("Cannot read properties of null (reading
    // 'fields')") — the walker must skip, not dereference.
    const mocks = {
      fieldPaths: () => ["ground_truth", "clip2"],
      field: (path: string) =>
        path === "ground_truth"
          ? { embeddedDocType: DETECTIONS, fields: null }
          : null,
      meetsType: () => true,
    };
    setMockAtoms(mocks);
    const get = (atom: { key: string; params?: unknown }) =>
      mocks[atom.key as keyof typeof mocks](atom.params as never);
    expect(gatherPaths(get as never, EMBEDDED_DOCUMENT_FIELD)).toStrictEqual([
      "ground_truth",
    ]);
  });

  it("fieldPaths drops hidden attributes from nested enumeration", () => {
    setMockAtoms({
      field: () => ({
        fields: {
          confidence: { name: "confidence", ftype: "float" },
          year: { name: "year", ftype: "int" },
        },
      }),
      activeSchemaExclusions: null,
      activeSchemaAttrExclusions: ["ground_truth.year"],
    });

    const nested = <TestSelectorFamily<typeof schema.fieldPaths>>(
      (<unknown>schema.fieldPaths({ path: "ground_truth.detections" }))
    );
    expect(nested()).toStrictEqual(["confidence"]);

    // Non-list parents map directly.
    const direct = <TestSelectorFamily<typeof schema.fieldPaths>>(
      (<unknown>schema.fieldPaths({ path: "ground_truth" }))
    );
    expect(direct()).toStrictEqual(["confidence"]);
  });

  it("activeSchemaExclusions unions task and lens channels", () => {
    const active = <TestSelector<typeof schemaSettings.activeSchemaExclusions>>(
      (<unknown>schemaSettings.activeSchemaExclusions)
    );

    setMockAtoms({
      taskFieldExclusions: ["clip2"],
      taskSchemaGoverns: false,
      schemaLens: {
        dataset: "quickstart",
        docId: "d1",
        name: "lens",
        excluded: ["ground_truth", "clip2"],
      },
      _datasetName__setter: "quickstart",
    });
    expect(active()).toStrictEqual(["clip2", "ground_truth"]);

    // A lens for ANOTHER dataset never leaks in.
    setMockAtoms({ _datasetName__setter: "other" });
    expect(active()).toStrictEqual(["clip2"]);

    setMockAtoms({ taskFieldExclusions: null, schemaLens: null });
    expect(active()).toBeNull();
  });

  it("an explicit All-fields lens contributes nothing; tasks govern", () => {
    const active = <TestSelector<typeof schemaSettings.activeSchemaExclusions>>(
      (<unknown>schemaSettings.activeSchemaExclusions)
    );

    // Explicit "All fields" (the dataset default) hides nothing.
    setMockAtoms({
      taskFieldExclusions: null,
      taskSchemaGoverns: false,
      schemaLens: {
        dataset: "quickstart",
        docId: "__all__",
        name: "All fields",
        excluded: [],
      },
      _datasetName__setter: "quickstart",
    });
    expect(active()).toBeNull();

    // Inside a task, the lens does not contribute — the task governs.
    setMockAtoms({
      schemaLens: null,
      taskSchemaGoverns: true,
      taskFieldExclusions: ["clip2"],
    });
    expect(active()).toStrictEqual(["clip2"]);
  });

  it("activeSchemaWireExclusions unions fields and attr db paths", () => {
    const wire = <
      TestSelector<typeof schemaSettings.activeSchemaWireExclusions>
    >(<unknown>schemaSettings.activeSchemaWireExclusions);

    // Task governs: field exclusions + task attr DB paths, lens ignored.
    // (`activeSchemaExclusions` is a mocked input here — its own union
    // logic has dedicated tests above.)
    setMockAtoms({
      activeSchemaExclusions: ["clip2"],
      taskAttrDbExclusions: ["car.detections.year"],
      taskSchemaGoverns: true,
      schemaLens: {
        dataset: "quickstart",
        docId: "d1",
        name: "lens",
        excluded: ["gt"],
        excludedAttrDb: ["gt.detections.conf"],
      },
      _datasetName__setter: "quickstart",
    });
    expect(wire()).toStrictEqual(["car.detections.year", "clip2"]);

    // Lens mode: its field AND attr-db exclusions ride the wire union.
    setMockAtoms({
      activeSchemaExclusions: ["gt"],
      taskSchemaGoverns: false,
      taskAttrDbExclusions: null,
    });
    expect(wire()).toStrictEqual(["gt", "gt.detections.conf"]);

    // Nothing anywhere: null (no ExcludeFields stage sent).
    setMockAtoms({ activeSchemaExclusions: null, schemaLens: null });
    expect(wire()).toBeNull();
  });

  it("activeSchemaStageExclusions drops the task stage for enforced viewers", () => {
    const stage = <
      TestSelector<typeof schemaSettings.activeSchemaStageExclusions>
    >(<unknown>schemaSettings.activeSchemaStageExclusions);
    const lens = {
      dataset: "quickstart",
      docId: "d1",
      name: "lens",
      excluded: ["gt"],
      excludedAttrDb: ["gt.detections.conf"],
    };

    // Exempt viewer (MANAGE / admin): the full wire union rides the stage.
    setMockAtoms({
      taskExclusionsEnforcedByServer: false,
      activeSchemaWireExclusions: ["car.detections.year", "clip2"],
      taskSchemaGoverns: true,
      schemaLens: lens,
      _datasetName__setter: "quickstart",
    });
    expect(stage()).toStrictEqual(["car.detections.year", "clip2"]);

    // Enforced viewer inside a task: the server applies the task schema
    // to page + aggregation queries, so the client sends nothing (the lens
    // contributes nothing in a task).
    setMockAtoms({
      taskExclusionsEnforcedByServer: true,
      lensWireExclusions: null,
    });
    expect(stage()).toBeNull();

    // Enforced viewer with an Explore lens (no task): the server never
    // applies the lens, so it still rides the aggregation stage.
    setMockAtoms({ lensWireExclusions: ["gt", "gt.detections.conf"] });
    expect(stage()).toStrictEqual(["gt", "gt.detections.conf"]);
  });

  it("splits the task's exclusions from the Explore lens's", () => {
    const task = <TestSelector<typeof schemaSettings.taskSchemaWireExclusions>>(
      (<unknown>schemaSettings.taskSchemaWireExclusions)
    );
    const lens = <TestSelector<typeof schemaSettings.lensWireExclusions>>(
      (<unknown>schemaSettings.lensWireExclusions)
    );
    const gridStage = <
      TestSelector<typeof schemaSettings.taskSchemaStageExclusions>
    >(<unknown>schemaSettings.taskSchemaStageExclusions);

    setMockAtoms({
      taskFieldExclusions: ["clip2"],
      taskAttrDbExclusions: ["car.detections.year"],
      taskExclusionsEnforcedByServer: false,
      taskSchemaGoverns: false,
      schemaLens: {
        dataset: "quickstart",
        docId: "d1",
        name: "lens",
        excluded: ["gt"],
        excludedAttrDb: ["gt.detections.conf"],
      },
      _datasetName__setter: "quickstart",
    });
    expect(task()).toStrictEqual(["car.detections.year", "clip2"]);
    expect(lens()).toStrictEqual(["gt", "gt.detections.conf"]);

    // the grid's sample query carries the task's, never the lens's
    setMockAtoms({ taskSchemaWireExclusions: task() });
    expect(gridStage()).toStrictEqual(["car.detections.year", "clip2"]);

    // a server that enforces the task leaves the grid stage empty
    setMockAtoms({ taskExclusionsEnforcedByServer: true });
    expect(gridStage()).toBeNull();

    // in a task the lens contributes nothing
    setMockAtoms({ taskSchemaGoverns: true });
    expect(lens()).toBeNull();
  });

  it("modalSample keeps the task's exclusions in the query and drops the lens's from the sample", () => {
    const modalSample = <TestSelector<typeof modal.modalSample>>(
      (<unknown>modal.modalSample)
    );
    const fetched = {
      urls: [],
      sample: {
        _id: "s1",
        car: { detections: [{ label: "car", year: 2001 }] },
        segmentations: {},
      },
    };

    setMockAtoms({
      modalSample: fetched,
      lensWireExclusions: ["car.detections.year", "segmentations"],
    });
    const filtered = modalSample();
    expect(filtered.sample).toStrictEqual({
      _id: "s1",
      car: { detections: [{ label: "car" }] },
    });
    expect(filtered.urls).toBe(fetched.urls);

    // without a lens the fetched sample is read as is
    setMockAtoms({ lensWireExclusions: null });
    expect(modalSample()).toBe(fetched);
  });

  it("the modal sample query carries the task's exclusions, not the lens's", () => {
    const modalView = <TestSelector<typeof modal.modalSampleView>>(
      (<unknown>modal.modalSampleView)
    );

    setMockAtoms({
      _view__setter: [],
      taskSchemaWireExclusions: ["car.detections.year", "clip2"],
      lensWireExclusions: ["gt"],
    });
    expect(modalView()).toStrictEqual([
      {
        _cls: "fiftyone.core.stages.ExcludeFields",
        kwargs: [
          ["field_names", ["car.detections.year", "clip2"]],
          ["_allow_missing", true],
        ],
      },
    ]);

    setMockAtoms({ taskSchemaWireExclusions: null });
    expect(modalView()).toStrictEqual([]);
  });

  it("lookers keep the lens's hidden fields in their schema, not the task's", () => {
    setMockAtoms({
      dataset: { name: "quickstart" },
      sampleFields: [
        labelField("ground_truth", DETECTIONS),
        labelField("clip2", CLASSIFICATION),
      ],
      frameFields: [],
      // the task hides ground_truth, the lens clip2
      taskFieldExclusions: ["ground_truth"],
      activeSchemaExclusions: ["clip2", "ground_truth"],
    });

    const looker = <TestSelectorFamily<typeof schema.lookerFieldSchema>>(
      (<unknown>schema.lookerFieldSchema({ space: State.SPACE.SAMPLE }))
    );
    expect(Object.keys(looker())).toStrictEqual(["clip2"]);

    const sidebar = <TestSelectorFamily<typeof schema.fieldSchema>>(
      (<unknown>schema.fieldSchema({ space: State.SPACE.SAMPLE }))
    );
    expect(Object.keys(sidebar())).toStrictEqual([]);
  });

  it("activeFields leaves out the hidden fields", () => {
    setMockAtoms({
      activeFieldsChoice: () => ["ground_truth", "clip2", "clip2.label"],
      sampleFields: [
        labelField("ground_truth", DETECTIONS),
        {
          ...labelField("clip2", CLASSIFICATION),
          fields: [
            { ...labelField("label", CLASSIFICATION), path: "clip2.label" },
          ],
        },
      ],
      frameFields: [],
      activeSchemaExclusions: ["clip2"],
    });

    const active = <TestSelectorFamily<typeof schema.activeFields>>(
      (<unknown>schema.activeFields({ modal: false }))
    );
    expect(active()).toStrictEqual(["ground_truth"]);
  });

  it("labelPath falls back to the raw path when the field is unknown", () => {
    setMockAtoms({
      field: () => null,
    });

    const path = <TestSelectorFamily<typeof schema.labelPath>>(
      (<unknown>schema.labelPath("clip2"))
    );
    expect(path()).toStrictEqual("clip2");
  });
});
