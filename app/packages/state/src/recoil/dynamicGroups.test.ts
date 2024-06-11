import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import {
  setMockAtoms,
  TestSelector,
  TestSelectorFamily,
} from "../../../../__mocks__/recoil";
import * as dynamicGroups from "./dynamicGroups";

describe("handles dynamic groups", () => {
  const testNesting = <
    TestSelector<typeof dynamicGroups.isNonNestedDynamicGroup>
  >(<unknown>dynamicGroups.isNonNestedDynamicGroup);

  it("resolves as non-nesting", () => {
    setMockAtoms({
      isDynamicGroup: true,
      parentMediaTypeSelector: "image",
    });
    expect(testNesting()).toBe(true);
  });

  it("resolves nesting", () => {
    setMockAtoms({
      isDynamicGroup: true,
      parentMediaTypeSelector: "group",
    });
    expect(testNesting()).toBe(false);
  });

  const modalPageSelector = <
    TestSelectorFamily<typeof dynamicGroups.dynamicGroupPageSelector>
  >(<unknown>(
    dynamicGroups.dynamicGroupPageSelector({ value: "test", modal: true })
  ));
  const pageSelector = <
    TestSelectorFamily<typeof dynamicGroups.dynamicGroupPageSelector>
  >(<unknown>(
    dynamicGroups.dynamicGroupPageSelector({ value: "test", modal: false })
  ));

  it("uses correct slice", () => {
    setMockAtoms({
      datasetName: "dataset",
      dynamicGroupViewQuery: () => [],
      groupSlice: "main",
      modalGroupSlice: "modal",
    });

    expect(pageSelector()(0, 1).filter).toStrictEqual({
      group: { slice: "main" },
    });
    expect(modalPageSelector()(0, 1).filter).toStrictEqual({
      group: { slice: "modal" },
    });
  });
});
