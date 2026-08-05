import { labelSchemaData } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
import { getDefaultStore } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import type { ReconciledDetection3D } from "../types";
import {
  clearLastCreatedLabels,
  getDefaultLabel,
  recordLastCreatedLabel,
} from "./labelResolution";
import type { WorkingDoc } from "./types";
import { DETECTION } from "@fiftyone/utilities";

function makeDetection(
  id: string,
  overrides: Partial<ReconciledDetection3D["label"]> = {},
): ReconciledDetection3D {
  return {
    label: {
      _id: id,
      _cls: DETECTION,
      location: [0, 0, 0],
      dimensions: [1, 1, 1],
      rotation: [0, 0, 0],
      tags: [],
      ...overrides,
    },
    path: "predictions",
    sampleId: "s1",
    ui: { selected: false },
  };
}

function makeDoc(labels: ReconciledDetection3D[]): WorkingDoc {
  const labelsById: WorkingDoc["labelsById"] = {};
  for (const l of labels) labelsById[l.label._id] = l;
  return { labelsById };
}

function setSchemaClasses(field: string, classes: string[]) {
  const store = getDefaultStore();
  store.set(labelSchemaData(field), {
    type: DETECTION,
    read_only: false,
    unsupported: false,
    default_label_schema: {
      type: "str",
      component: "text",
      classes,
    },
  });
}

function clearSchema(field: string) {
  const store = getDefaultStore();
  store.set(labelSchemaData(field), undefined);
}

afterEach(() => {
  clearLastCreatedLabels();
  clearSchema("predictions");
});

describe("getDefaultLabel", () => {
  const empty = makeDoc([]);

  it("returns '' for empty doc with no schema", () => {
    expect(getDefaultLabel("predictions", empty)).toBe("");
  });

  it("returns first schema class when no visible labels", () => {
    setSchemaClasses("predictions", ["car", "person", "truck"]);
    expect(getDefaultLabel("predictions", empty)).toBe("car");
  });

  it("returns most common visible label", () => {
    const doc = makeDoc([
      makeDetection("1", { label: "person" }),
      makeDetection("2", { label: "car" }),
      makeDetection("3", { label: "car" }),
    ]);
    expect(getDefaultLabel("predictions", doc)).toBe("car");
  });

  it("ignores labels from other fields", () => {
    const otherField = makeDetection("1", { label: "car" });
    otherField.path = "other_field";
    const doc = makeDoc([otherField, makeDetection("2", { label: "person" })]);
    expect(getDefaultLabel("predictions", doc)).toBe("person");
  });

  it("uses last created label for subsequent shapes", () => {
    recordLastCreatedLabel("predictions", "truck");
    expect(getDefaultLabel("predictions", empty)).toBe("truck");
  });

  it("ignores last created label if no longer valid in schema", () => {
    setSchemaClasses("predictions", ["car", "person"]);
    recordLastCreatedLabel("predictions", "truck");
    expect(getDefaultLabel("predictions", empty)).toBe("car");
  });

  it("accepts last created label when no schema classes (open vocab)", () => {
    recordLastCreatedLabel("predictions", "anything");
    expect(getDefaultLabel("predictions", empty)).toBe("anything");
  });

  it("clearLastCreatedLabels resets session memory", () => {
    recordLastCreatedLabel("predictions", "truck");
    clearLastCreatedLabels();
    setSchemaClasses("predictions", ["car"]);
    expect(getDefaultLabel("predictions", empty)).toBe("car");
  });
});
