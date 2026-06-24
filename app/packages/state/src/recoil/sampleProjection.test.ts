import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { DETECTIONS_FIELD, VECTOR_FIELD } from "@fiftyone/utilities";
import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import * as sampleProjection from "./sampleProjection";

// The grid requests overlay fields; the modal requests everything except
// vectors/logits. Both partitions derive from the full schema.
describe("sampleProjection", () => {
  const schema = {
    predictions: {
      name: "predictions",
      embeddedDocType: DETECTIONS_FIELD,
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    },
    embedding: {
      name: "embedding",
      ftype: VECTOR_FIELD,
    },
  };

  const gridFields = <TestSelector<typeof sampleProjection.gridSampleFields>>(
    (<unknown>sampleProjection.gridSampleFields)
  );
  const modalExclude = <
    TestSelector<typeof sampleProjection.modalSampleExclude>
  >(<unknown>sampleProjection.modalSampleExclude);

  it("grid include carries identifiers + overlay leaves, not vectors", () => {
    setMockAtoms({ fullSchema: schema });
    const fields = gridFields();
    // identifiers always present
    expect(fields).toContain("filepath");
    // label overlay leaf the grid renders
    expect(fields).toContain("predictions.detections.label");
    // raw vector field is never part of the grid include
    expect(fields).not.toContain("embedding");
  });

  it("modal exclude lists vector fields and label logits", () => {
    setMockAtoms({ fullSchema: schema });
    const exclude = modalExclude();
    expect(exclude).toContain("embedding");
    expect(exclude).toContain("predictions.detections.logits");
    // overlay leaves are not excluded from the modal
    expect(exclude).not.toContain("predictions.detections.label");
  });
});
