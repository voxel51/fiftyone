import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelectorFamily } from "../../../../__mocks__/recoil";
import * as atoms from "./atoms";

describe("supportsTemporalTags", () => {
  const testSupportsTemporalTags = (modal: boolean) =>
    (<TestSelectorFamily<typeof atoms.supportsTemporalTags>>(
      (<unknown>atoms.supportsTemporalTags(modal))
    ))();

  it("covers the media types that carry a playhead of their own", () => {
    setMockAtoms({ mediaType: "video" });
    expect(testSupportsTemporalTags(false)).toBe(true);

    setMockAtoms({ mediaType: "multimodal" });
    expect(testSupportsTemporalTags(false)).toBe(true);
  });

  it("covers a grouped dataset only on a video slice, grid and modal each by their own slice", () => {
    setMockAtoms({
      mediaType: "group",
      groupMediaTypesMap: { left: "image", video: "video" },
      currentSlice: (modal: boolean) => (modal ? "video" : "left"),
    });

    expect(testSupportsTemporalTags(false)).toBe(false);
    expect(testSupportsTemporalTags(true)).toBe(true);
  });

  it("leaves out datasets with nothing to place an interval on", () => {
    setMockAtoms({ mediaType: "image" });
    expect(testSupportsTemporalTags(false)).toBe(false);
  });
});

describe("isDatasetChange", () => {
  it("is false for the first page", () => {
    expect(atoms.isDatasetChange({ datasetId: "a" }, null)).toBe(false);
  });

  it("is false for a reload of the same dataset, whatever the fetch id", () => {
    // `id` is minted per fetch when a view argument is sent: a layout write
    // or a refresh brings a new one, and must not read as a dataset switch
    // (it dropped a plot lasso's grid scope on every panel tab switch)
    const first = { id: "fetch-1", datasetId: "a" };
    const reload = { id: "fetch-2", datasetId: "a" };
    expect(atoms.isDatasetChange(reload, first)).toBe(false);
  });

  it("is true for another dataset", () => {
    expect(atoms.isDatasetChange({ datasetId: "b" }, { datasetId: "a" })).toBe(
      true,
    );
  });
});

describe("readOverrideStage", () => {
  const stage = { "fiftyone.core.stages.Select": { sample_ids: ["a"] } };

  it("keeps a stage written in step through a reload of the same dataset", () => {
    // A publish whose commit is still pending when a page reload lands: the
    // atom's effect hasn't updated the mirror yet, so the publisher writes it
    atoms.writeOverrideStageMirror(stage);
    expect(
      atoms.readOverrideStage({ datasetId: "a" }, { datasetId: "a" }),
    ).toBe(stage);
  });

  it("drops the stage on a dataset switch", () => {
    atoms.writeOverrideStageMirror(stage);
    expect(
      atoms.readOverrideStage({ datasetId: "b" }, { datasetId: "a" }),
    ).toBe(null);
  });
});
