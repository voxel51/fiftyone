import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import {
  TestGraphQLSelector,
  TestGraphQLSelectorFamily,
} from "../../../../__mocks__/recoil-relay";
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
      _datasetName__setter: "dataset",
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
      groupSamples: () => [
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
      groupSamples: () => [{ sample: { group: { name: "pcd" } } }],
    });

    expect(testCurrentGroupSliceNames()).toStrictEqual([]);
  });
});

describe("modalGroupIdLookup", () => {
  const testModalGroupIdLookup = <
    TestGraphQLSelector<
      typeof groups.modalGroupIdLookup,
      Record<string, unknown>,
      string | null
    >
  >(<unknown>groups.modalGroupIdLookup);

  it("skips the lookup when the modal selector already has a group id", () => {
    setMockAtoms({
      __modalSelector_selector: { id: "sample-id", groupId: "group-id" },
      hasGroupSlices: true,
      groupSlices: ["left", "pcd"],
    });
    expect(testModalGroupIdLookup.variables()).toBeNull();
  });

  it("skips the lookup without a modal or without group slices", () => {
    setMockAtoms({
      __modalSelector_selector: null,
      hasGroupSlices: true,
      groupSlices: ["left", "pcd"],
    });
    expect(testModalGroupIdLookup.variables()).toBeNull();

    setMockAtoms({
      __modalSelector_selector: { id: "sample-id", groupId: null },
      hasGroupSlices: false,
      groupSlices: [],
    });
    expect(testModalGroupIdLookup.variables()).toBeNull();
  });

  it("selects the modal sample across every slice of the current view", () => {
    setMockAtoms({
      __modalSelector_selector: { id: "sample-id", groupId: null },
      hasGroupSlices: true,
      groupSlices: ["left", "pcd"],
      groupSlice: "left",
      _datasetName__setter: "dataset",
      _view__setter: [{ _cls: "fiftyone.core.stages.Select", kwargs: [] }],
    });

    expect(testModalGroupIdLookup.variables()).toStrictEqual({
      count: 1,
      dataset: "dataset",
      view: [{ _cls: "fiftyone.core.stages.Select", kwargs: [] }],
      filter: { group: { slice: "left", id: null, slices: ["left", "pcd"] } },
      extendedStages: {
        "fiftyone.core.stages.Select": { sample_ids: ["sample-id"] },
      },
      paginationData: false,
    });
  });
});

describe("readGroupIdFromSamples", () => {
  const connection = (edges: unknown[]) =>
    ({
      samples: { __typename: "SampleItemStrConnection", edges },
    }) as unknown as Parameters<typeof groups.readGroupIdFromSamples>[0];

  it("reads the group id from the first sample", () => {
    expect(
      groups.readGroupIdFromSamples(
        connection([
          { node: { sample: { group: { _id: "group-id", name: "pcd" } } } },
        ]),
        "group",
      ),
    ).toBe("group-id");
  });

  it("deserializes string-encoded samples", () => {
    expect(
      groups.readGroupIdFromSamples(
        connection([
          {
            node: {
              sample: JSON.stringify({ group: { _id: "group-id" } }),
            },
          },
        ]),
        "group",
      ),
    ).toBe("group-id");
  });

  it("returns null without a sample, without a group, or on a timeout", () => {
    expect(groups.readGroupIdFromSamples(connection([]), "group")).toBeNull();
    expect(
      groups.readGroupIdFromSamples(
        connection([{ node: { sample: { filepath: "x.pcd" } } }]),
        "group",
      ),
    ).toBeNull();
    expect(
      groups.readGroupIdFromSamples(
        {
          samples: { __typename: "QueryTimeout" },
        } as unknown as Parameters<typeof groups.readGroupIdFromSamples>[0],
        "group",
      ),
    ).toBeNull();
  });
});

describe("groupId", () => {
  const testGroupId = <TestSelector<typeof groups.groupId>>(
    (<unknown>groups.groupId)
  );

  it("uses the modal selector's group id when present", () => {
    setMockAtoms({
      __modalSelector_selector: { id: "sample-id", groupId: "group-id" },
      modalGroupIdLookup: "other-group-id",
    });
    expect(testGroupId()).toBe("group-id");
  });

  it("falls back to the resolved group id when the selector has none", () => {
    setMockAtoms({
      __modalSelector_selector: { id: "sample-id", groupId: null },
      modalGroupIdLookup: "resolved-group-id",
    });
    expect(testGroupId()).toBe("resolved-group-id");
  });

  it("is null when nothing resolves", () => {
    setMockAtoms({ __modalSelector_selector: null, modalGroupIdLookup: null });
    expect(testGroupId()).toBeNull();
  });

  it("degrades to null when the lookup request fails", () => {
    setMockAtoms({
      __modalSelector_selector: { id: "sample-id", groupId: null },
      modalGroupIdLookup: () => {
        throw new Error("network error");
      },
    });
    expect(testGroupId()).toBeNull();
  });
});
