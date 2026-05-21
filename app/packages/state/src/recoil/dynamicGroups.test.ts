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

describe("groupByFieldValue reconstruction", () => {
  const testGroupByFieldValue = <
    TestSelector<typeof dynamicGroups.groupByFieldValue>
  >(<unknown>dynamicGroups.groupByFieldValue);

  it("returns server-provided _group as-is", () => {
    setMockAtoms({
      modalSample: { sample: { _group: ["scene-1", "CAM_BACK"] } },
      dynamicGroupParameters: { groupBy: ["scene_id", "sensor_name"] },
    });
    expect(testGroupByFieldValue()).toEqual(["scene-1", "CAM_BACK"]);
  });

  it("reconstructs from array groupBy when _group missing (pagination edge case)", () => {
    setMockAtoms({
      modalSample: {
        sample: { scene_id: "scene-7", sensor_name: "CAM_FRONT" },
      },
      dynamicGroupParameters: { groupBy: ["scene_id", "sensor_name"] },
    });
    expect(testGroupByFieldValue()).toEqual(["scene-7", "CAM_FRONT"]);
  });

  it("reconstructs from string groupBy when _group missing", () => {
    setMockAtoms({
      modalSample: { sample: { scene_id: "scene-7" } },
      dynamicGroupParameters: { groupBy: "scene_id" },
    });
    expect(testGroupByFieldValue()).toEqual("scene-7");
  });

  it("returns null when no dynamicGroupParameters present", () => {
    setMockAtoms({
      modalSample: { sample: { _id: "abc" } },
      dynamicGroupParameters: null,
    });
    expect(testGroupByFieldValue()).toBeNull();
  });

  it("returns null when modalSample is unavailable", () => {
    setMockAtoms({
      modalSample: null,
      dynamicGroupParameters: { groupBy: "scene_id" },
    });
    expect(testGroupByFieldValue()).toBeNull();
  });
});
