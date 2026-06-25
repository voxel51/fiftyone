import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import {
  DETECTIONS_FIELD,
  GROUP,
  STRING_FIELD,
  VECTOR_FIELD,
} from "@fiftyone/utilities";
import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import * as sampleProjection from "./sampleProjection";

// The grid projection derives label overlay subfields from the schema subtree
// (no hardcoded leaf list), excluding heavy vectors; the modal excludes only
// those vectors. New label attributes (e.g. 3D geometry) are picked up for free.
describe("sampleProjection", () => {
  // a Detections label with a deep subfield (location, like a 3D cuboid) and a
  // logits vector; a top-level embedding vector; and a group field.
  const schema = {
    predictions: {
      name: "predictions",
      embeddedDocType: DETECTIONS_FIELD,
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      fields: {
        detections: {
          name: "detections",
          ftype: "fiftyone.core.fields.EmbeddedDocumentListField",
          fields: {
            label: { name: "label", ftype: STRING_FIELD },
            location: {
              name: "location",
              ftype: "fiftyone.core.fields.ListField",
            },
            logits: { name: "logits", ftype: VECTOR_FIELD },
          },
        },
      },
    },
    embedding: { name: "embedding", ftype: VECTOR_FIELD },
    group: {
      name: "group",
      embeddedDocType: GROUP,
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    },
  };

  const gridFields = <TestSelector<typeof sampleProjection.gridSampleFields>>(
    (<unknown>sampleProjection.gridSampleFields)
  );
  const modalExclude = <
    TestSelector<typeof sampleProjection.modalSampleExclude>
  >(<unknown>sampleProjection.modalSampleExclude);

  it("derives label overlay leaves from the schema, incl. new attributes", () => {
    setMockAtoms({ fullSchema: schema });
    const fields = gridFields();
    expect(fields).toContain("filepath"); // identifier
    expect(fields).toContain("predictions.detections.label");
    // a non-hardcoded subfield (3D-style geometry) is included automatically
    expect(fields).toContain("predictions.detections.location");
    expect(fields).toContain("predictions.detections._id"); // deserialization meta
    // vectors never enter the grid include
    expect(fields).not.toContain("embedding");
    expect(fields).not.toContain("predictions.detections.logits");
  });

  it("includes the group field (for slice/group resolution)", () => {
    setMockAtoms({ fullSchema: schema });
    expect(gridFields()).toContain("group");
  });

  it("modal exclude lists vector fields and label logits, not overlay leaves", () => {
    setMockAtoms({ fullSchema: schema });
    const exclude = modalExclude();
    expect(exclude).toContain("embedding");
    expect(exclude).toContain("predictions.detections.logits");
    expect(exclude).not.toContain("predictions.detections.label");
  });
});
