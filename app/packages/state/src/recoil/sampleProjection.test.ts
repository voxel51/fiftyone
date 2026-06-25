import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

// the grid include list is composed from looker's overlay declarations; stub them
// here so this suite tests only state's composition (identifiers + group + delegation)
vi.mock("@fiftyone/looker", () => ({
  getRenderFieldPaths: () => [
    "predictions.detections._id",
    "predictions.detections.label",
    "predictions.detections.bounding_box",
  ],
}));

import { GROUP, STRING_FIELD, VECTOR_FIELD } from "@fiftyone/utilities";
import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import * as sampleProjection from "./sampleProjection";

describe("sampleProjection", () => {
  // a Detections label with a nested logits vector, a top-level embedding vector,
  // and a group field.
  const schema = {
    predictions: {
      name: "predictions",
      embeddedDocType: "fiftyone.core.labels.Detections",
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      fields: {
        detections: {
          name: "detections",
          ftype: "fiftyone.core.fields.EmbeddedDocumentListField",
          fields: {
            label: { name: "label", ftype: STRING_FIELD },
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

  it("composes grid fields from looker render paths + identifiers + group", () => {
    setMockAtoms({ fullSchema: schema });
    const fields = gridFields();
    // overlay leaves the renderer declared (via looker)
    expect(fields).toContain("predictions.detections.label");
    expect(fields).toContain("predictions.detections._id");
    // sample-structural identifiers (filepath/_id are forced server-side, not listed)
    expect(fields).toContain("metadata");
    expect(fields).toContain("tags");
    // group field for slice/group resolution
    expect(fields).toContain("group");
    // vectors never enter the grid include
    expect(fields).not.toContain("embedding");
    expect(fields).not.toContain("predictions.detections.logits");
  });

  it("modal exclude lists every vector path (incl. nested label logits)", () => {
    setMockAtoms({ fullSchema: schema });
    const exclude = modalExclude();
    expect(exclude).toContain("embedding");
    expect(exclude).toContain("predictions.detections.logits");
    expect(exclude).not.toContain("predictions.detections.label");
  });
});
