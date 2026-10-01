/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import {
  frameNumbersByMember,
  runLengthEncode,
  runLengthEncodeValues,
  toFrameIndexInstances,
} from "./memberIndexInstances";

const metadata = {
  instanceId: "i1",
  classLabel: "person",
  persistedIndex: 1,
  instance: { _cls: "Instance" as const, _id: "i1" },
};

describe("runLengthEncode", () => {
  it("folds unsorted, duplicated frames into contiguous runs", () => {
    expect(runLengthEncode([6, 1, 2, 5, 2, 3])).toEqual([
      [1, 3],
      [5, 6],
    ]);
    expect(runLengthEncode([])).toEqual([]);
  });
});

describe("runLengthEncodeValues", () => {
  it("breaks runs on value changes and gaps, a later value winning", () => {
    expect(
      runLengthEncodeValues([
        [2, "left"],
        [1, "off"],
        [2, "right"],
        [3, "right"],
        [5, "right"],
        [6, { a: 1 }],
        [7, { a: 1 }],
      ]),
    ).toEqual([
      [1, 1, "off"],
      [2, 3, "right"],
      [5, 5, "right"],
      [6, 7, { a: 1 }],
    ]);
  });
});

describe("toFrameIndexInstances", () => {
  const frameOf = frameNumbersByMember(["m1", "m2", "m3", "m4", "m5"]);

  it("maps members to frames and builds the frame runs", () => {
    expect(
      toFrameIndexInstances(
        [
          {
            ...metadata,
            members: ["m5", "m1", "m2", "m4"],
            keyframeMembers: ["m4", "m1", "m4"],
            attributeValues: {
              turn_signal: [
                ["m1", "off"],
                ["m2", "off"],
                ["m4", "left"],
                ["m5", null],
              ],
              color: [],
            },
          },
        ],
        frameOf,
      ),
    ).toEqual([
      {
        ...metadata,
        segments: [
          [1, 2],
          [4, 5],
        ],
        keyframes: [1, 4],
        attributeSegments: {
          turn_signal: [
            [1, 2, "off"],
            [4, 4, "left"],
            [5, 5, null],
          ],
        },
      },
    ]);
  });

  it("skips members missing from the member order", () => {
    const [entry] = toFrameIndexInstances(
      [
        {
          ...metadata,
          members: ["m2", "deleted"],
          keyframeMembers: ["deleted"],
        },
      ],
      frameOf,
    );

    expect(entry.segments).toEqual([[2, 2]]);
    expect(entry.keyframes).toEqual([]);
    expect(entry).not.toHaveProperty("attributeSegments");
  });

  it("drops an instance none of whose members are in the member order", () => {
    expect(
      toFrameIndexInstances(
        [{ ...metadata, members: ["deleted"], keyframeMembers: [] }],
        frameOf,
      ),
    ).toEqual([]);
  });
});
