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
    // to page + aggregation queries, so the client sends nothing.
    setMockAtoms({ taskExclusionsEnforcedByServer: true });
    expect(stage()).toBeNull();

    // Enforced viewer with an Explore lens (no task): the lens is client-only
    // and still rides the stage — fields and attr DB paths.
    setMockAtoms({ taskSchemaGoverns: false });
    expect(stage()).toStrictEqual(["gt", "gt.detections.conf"]);

    // Enforced viewer, nothing governing: null.
    setMockAtoms({ schemaLens: null });
    expect(stage()).toBeNull();
  });

  it("activeSchemaExclusionStages serializes the wire union as a stage", () => {
    const stages = <
      TestSelector<typeof schemaSettings.activeSchemaExclusionStages>
    >(<unknown>schemaSettings.activeSchemaExclusionStages);

    // The union itself has a dedicated test above; mock it as input.
    setMockAtoms({
      activeSchemaWireExclusions: ["car.detections.year", "segmentations"],
    });
    expect(stages()).toStrictEqual([
      {
        _cls: "fiftyone.core.stages.ExcludeFields",
        kwargs: [
          ["field_names", ["car.detections.year", "segmentations"]],
          ["_allow_missing", true],
        ],
      },
    ]);

    setMockAtoms({ activeSchemaWireExclusions: null });
    expect(stages()).toStrictEqual([]);
  });

  it("activeSchemaLensKey tracks the governing schema identity", () => {
    const key = <TestSelector<typeof schemaSettings.activeSchemaLensKey>>(
      (<unknown>schemaSettings.activeSchemaLensKey)
    );

    setMockAtoms({
      taskSchemaGoverns: false,
      _datasetName__setter: "quickstart",
      schemaLens: {
        dataset: "quickstart",
        docId: "d1",
        name: "lens",
        excluded: [],
      },
    });
    expect(key()).toBe("d1");

    setMockAtoms({ taskSchemaGoverns: true });
    expect(key()).toBe("task");

    setMockAtoms({
      taskSchemaGoverns: false,
      schemaLens: null,
    });
    expect(key()).toBe("");
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
