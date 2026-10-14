/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getColor } from "@fiftyone/utilities";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  getKeypointPointColors,
  type ColorMappingContext,
} from "./colorMapping";

const POOL = ["#111111", "#222222", "#333333"];

const context = (
  overrides: Pick<
    ColorMappingContext["colorScheme"],
    "colorBy" | "fields"
  > = {},
): ColorMappingContext => ({
  colorScheme: {
    colorBy: "value",
    colorPool: POOL,
    fields: [
      {
        path: "pose",
        colorByAttribute: "occluded",
        valueColors: [{ value: "true", color: "#ff0000" }],
      },
    ],
    ...overrides,
  },
  seed: 0,
});

const keypoint = (occluded: unknown) => ({
  _cls: "Keypoint",
  label: "person",
  points: [
    [0.1, 0.1],
    [0.2, 0.2],
    [0.3, 0.3],
  ],
  occluded,
});

describe("getKeypointPointColors", () => {
  beforeAll(() => {
    // isValidColor uses CSS.supports, which the node test environment lacks
    vi.stubGlobal("CSS", {
      supports: (_property: string, value: string) =>
        /^#[0-9a-f]{6}$/i.test(value),
    });
  });

  it("colors each point by its own list entry", () => {
    expect(
      getKeypointPointColors("pose", keypoint([true, false, null]), context()),
    ).toEqual([
      // explicit value color
      "#ff0000",
      // no value color for false: the pool, keyed by the value
      getColor(POOL, 0, false),
      // unset: no override, the point keeps the label color
      null,
    ]);
  });

  it("is null for a label that is not a keypoint", () => {
    const polyline = { ...keypoint([true, false, null]), _cls: "Polyline" };
    expect(getKeypointPointColors("pose", polyline, context())).toBeNull();
    expect(getKeypointPointColors("pose", null, context())).toBeNull();
  });

  it("is null outside color-by-value", () => {
    expect(
      getKeypointPointColors(
        "pose",
        keypoint([true, false, null]),
        context({ colorBy: "field" }),
      ),
    ).toBeNull();
  });

  it("is null when the field has no per-point attribute", () => {
    const label = keypoint([true, false, null]);
    expect(
      getKeypointPointColors(
        "pose",
        label,
        context({ fields: [{ path: "pose" }] }),
      ),
    ).toBeNull();
    // the attribute is configured for another field
    expect(getKeypointPointColors("other", label, context())).toBeNull();
  });

  it("is null when the attribute is not a parallel list", () => {
    expect(
      getKeypointPointColors("pose", keypoint([true]), context()),
    ).toBeNull();
    expect(
      getKeypointPointColors("pose", keypoint(true), context()),
    ).toBeNull();
  });

  it("is null for a keypoint with no points", () => {
    const empty = { ...keypoint([]), points: [] };
    expect(getKeypointPointColors("pose", empty, context())).toBeNull();
  });
});
