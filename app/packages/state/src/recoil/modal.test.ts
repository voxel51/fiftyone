/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { buildModalSampleVariables } from "./modal";

describe("buildModalSampleVariables", () => {
  it("builds non-group variables with a null group and threads dataset/view/id", () => {
    expect(
      buildModalSampleVariables({
        dataset: "ds",
        view: [],
        id: "sample-1",
        slice: null,
        sliceSelect: null,
        groupId: null,
      }),
    ).toEqual({
      dataset: "ds",
      view: [],
      filter: { id: "sample-1", group: null },
    });
  });

  it("treats an empty-string slice as non-group (group is null)", () => {
    const vars = buildModalSampleVariables({
      dataset: "ds",
      view: [],
      id: "sample-1",
      slice: "",
      sliceSelect: null,
      groupId: null,
    });
    expect(vars.filter.group).toBeNull();
  });

  it("builds group variables from slice, sliceSelect, and groupId", () => {
    expect(
      buildModalSampleVariables({
        dataset: "ds",
        view: [],
        id: "sample-2",
        slice: "left",
        sliceSelect: "right",
        groupId: "group-1",
      }),
    ).toEqual({
      dataset: "ds",
      view: [],
      filter: {
        id: "sample-2",
        group: { slice: "left", slices: ["right"], id: "group-1" },
      },
    });
  });
});
