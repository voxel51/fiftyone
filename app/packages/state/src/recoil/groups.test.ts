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
