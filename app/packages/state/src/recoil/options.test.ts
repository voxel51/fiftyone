import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshot_UNSTABLE } from "../../../../__mocks__/recoil";
import { selectedMediaField, selectedMediaFieldAtomFamily } from "./options";
import { dataset } from "./atoms";

const testDataset = {
  sampleFields: [
    {
      name: "filepath",
      ftype: "",
      dbField: "",
      description: "",
      info: {},
      embeddedDocType: "",
      subfield: "",
    },
    {
      name: "thumbnail_path",
      ftype: "",
      dbField: "",
      description: "",
      info: {},
      embeddedDocType: "",
      subfield: "",
    },
  ],
};
const testDatasetNoThumbnailPath = {
  sampleFields: [
    {
      name: "filepath",
      ftype: "",
      dbField: "",
      description: "",
      info: {},
      embeddedDocType: "",
      subfield: "",
    },
    {
      name: "id",
      ftype: "",
      dbField: "",
      description: "",
      info: {},
      embeddedDocType: "",
      subfield: "",
    },
  ],
};

describe("options", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selectedMediaField: media field is not 'filepath' if the selected field is in the schema", async () => {
    const testSnapshot = snapshot_UNSTABLE(({ set }) => {
      set(selectedMediaFieldAtomFamily(false), "thumbnail_path");
      set(dataset, testDataset);
    });

    const contents = testSnapshot.getLoadable(
      selectedMediaField(false)
    ).contents;

    expect(contents).toEqual("thumbnail_path");
  });

  it("selectedMediaField: media field is 'filepath' if other selected field is not in the dataset schema", async () => {
    const testSnapshot = snapshot_UNSTABLE(({ set }) => {
      set(selectedMediaFieldAtomFamily(false), "thumbnail_path");
      set(dataset, testDatasetNoThumbnailPath);
    });

    const contents = testSnapshot.getLoadable(
      selectedMediaField(false)
    ).contents;

    expect(contents).toEqual("filepath");
  });
});
