import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import { TestGraphQLSelectorFamily } from "../../../../__mocks__/recoil-relay";
import * as groups from "./groups";

describe("hasGroupSlices handles nested dynamic groups", () => {
  const testHasGroupSlices = <TestSelector<typeof groups.hasGroupSlices>>(
    (<unknown>groups.hasGroupSlices)
  );

  it("resolves nested dynamic groups with slices", () => {
    setMockAtoms({
      isGroup: true,
      isDynamicGroup: true,
      parentMediaTypeSelector: "group",
    });
    expect(testHasGroupSlices()).toBe(true);
  });

  it("resolves group with slices", () => {
    setMockAtoms({
      isGroup: true,
      isDynamicGroup: false,
      parentMediaTypeSelector: "unused",
    });
    expect(testHasGroupSlices()).toBe(true);
  });
});

describe("groupHasSampleOnSlice", () => {
  const testGroupHasSampleOnSlice = <
    TestGraphQLSelectorFamily<
      typeof groups.groupHasSampleOnSlice,
      Record<string, unknown>,
      boolean | null,
      { groupId: string | null; slice: string | null }
    >
  >(<unknown>groups.groupHasSampleOnSlice);

  it("returns null variables when the lookup is underspecified", () => {
    expect(
      testGroupHasSampleOnSlice({ groupId: null, slice: "target" }).variables(),
    ).toBeNull();
    expect(
      testGroupHasSampleOnSlice({
        groupId: "group-id",
        slice: null,
      }).variables(),
    ).toBeNull();
  });

  it("uses the requested slice instead of the global group slice", () => {
    setMockAtoms({
      datasetName: "dataset",
      groupSlice: "global-slice",
      _view__setter: [],
    });

    expect(
      testGroupHasSampleOnSlice({
        groupId: "group-id",
        slice: "target-slice",
      }).variables(),
    ).toMatchObject({
      count: 1,
      view: [],
      filter: {
        group: {
          slice: "target-slice",
          id: "group-id",
          slices: ["target-slice"],
        },
      },
      paginationData: false,
    });
  });
});

describe("currentGroupSliceNames", () => {
  const testCurrentGroupSliceNames = <
    TestSelector<typeof groups.currentGroupSliceNames>
  >(<unknown>groups.currentGroupSliceNames);

  it("returns only the slices that exist on the active group", () => {
    setMockAtoms({
      hasGroupSlices: true,
      groupId: "group-id",
      groupField: "group",
      groupSlices: ["left", "pcd", "right"],
      groupSamples: [
        { sample: { group: { name: "pcd" } } },
        { sample: { group: { name: "left" } } },
      ],
    });

    expect(testCurrentGroupSliceNames()).toStrictEqual(["left", "pcd"]);
  });

  it("returns an empty list when there is no active group", () => {
    setMockAtoms({
      hasGroupSlices: true,
      groupId: null,
      groupField: "group",
      groupSlices: ["left", "pcd", "right"],
      groupSamples: [{ sample: { group: { name: "pcd" } } }],
    });

    expect(testCurrentGroupSliceNames()).toStrictEqual([]);
  });
});

describe("viewSelectsGroupSlices", () => {
  const testViewSelectsGroupSlices = <
    TestSelector<typeof groups.viewSelectsGroupSlices>
  >(<unknown>groups.viewSelectsGroupSlices);

  const selectGroupSlicesStage = (flat: boolean) => ({
    _cls: "fiftyone.core.stages.SelectGroupSlices",
    kwargs: [
      ["slices", ["left"]],
      ["flat", flat],
    ],
  });

  it("detects flattened slice selections", () => {
    setMockAtoms({
      isGroup: true,
      _view__setter: [selectGroupSlicesStage(true)],
    });
    expect(testViewSelectsGroupSlices()).toBe(true);
  });

  it("detects unflattened slice selections", () => {
    setMockAtoms({
      isGroup: true,
      _view__setter: [selectGroupSlicesStage(false)],
    });
    expect(testViewSelectsGroupSlices()).toBe(true);
  });

  it("is false for views without a slice selection", () => {
    setMockAtoms({
      isGroup: true,
      _view__setter: [
        { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 1]] },
      ],
    });
    expect(testViewSelectsGroupSlices()).toBe(false);
  });

  it("detects selections that flatten the dataset out of being grouped", () => {
    // a flattening selection leaves the view with its slices' media type, so
    // the dataset no longer reads as grouped
    setMockAtoms({
      isGroup: false,
      _view__setter: [selectGroupSlicesStage(true)],
    });
    expect(testViewSelectsGroupSlices()).toBe(true);
  });

  it("is false for empty views", () => {
    setMockAtoms({ isGroup: true, _view__setter: [] });
    expect(testViewSelectsGroupSlices()).toBe(false);
  });
});
