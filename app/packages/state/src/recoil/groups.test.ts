import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
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

describe("groupView  does not contain GroupBy stage", () => {
  it("filters the GroupBy stage", () => {
    const testGroupView = <TestSelector<typeof groups.groupView>>(
      (<unknown>groups.groupView)
    );
    setMockAtoms({
      //  _NAME_setter syntax due to graphQLSyncFrangmentImplementation
      _view__setter: [
        {
          _cls: "fiftyone.core.stages.GroupBy",
          kwargs: [
            ["field_or_expr", "scene_id"],
            ["order_by", "timestamp"],
            ["reverse", false],
            ["flat", false],
            ["match_expr", null],
            ["sort_expr", null],
            ["create_index", true],
          ],
        },
      ],
    });

    expect(testGroupView()).toStrictEqual([]);
  });
});
