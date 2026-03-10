import { STRING_FIELD } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { getMetadataElements } from "./index";
import { MetadataGridTagsElement } from "./metadata";

const makeConfig = (thumbnail: boolean) => ({
  dataset: "test-dataset",
  fieldSchema: {
    filepath: {
      dbField: "filepath",
      description: null,
      embeddedDocType: null,
      fields: {},
      ftype: STRING_FIELD,
      info: null,
      name: "filepath",
      path: "filepath",
      subfield: null,
    },
  },
  isDynamicGroup: false,
  mediaField: "filepath",
  sampleId: "sample-1",
  sources: {
    filepath: "/tmp/sample-1.pdf",
  },
  src: "/tmp/sample-1.pdf",
  symbol: Symbol("sample-1"),
  thumbnail,
  view: [],
});

describe("metadata looker elements", () => {
  it("includes MetadataGridTagsElement and only shows it in grid thumbnails", () => {
    const config = makeConfig(true);

    const root = getMetadataElements({
      abortController: new AbortController(),
      config: config as any,
      dispatchEvent: () => undefined,
      update: () => undefined,
    });

    const tagsElement = root.children.find(
      (child) => child instanceof MetadataGridTagsElement
    ) as MetadataGridTagsElement | undefined;

    expect(tagsElement).toBeTruthy();
    expect(tagsElement?.isShown(config as any)).toBe(true);
    expect(
      tagsElement?.isShown({
        ...config,
        thumbnail: false,
      } as any)
    ).toBe(false);
    expect(
      tagsElement?.isShown({
        ...config,
        isModal: true,
      } as any)
    ).toBe(false);
  });
});
