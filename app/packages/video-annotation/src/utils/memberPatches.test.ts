/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { JSONDeltas } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { toMemberPatches, writtenMemberDeltas } from "./memberPatches";

const INDEX = ["m1", "m2", "m3"];

describe("toMemberPatches", () => {
  it("addresses each frame's ops to the member sample at that frame", () => {
    const deltas = [
      {
        op: "replace",
        path: "/frames/1/detections/detections/0/label",
        value: "dog",
      },
      { op: "remove", path: "/frames/3/detections/detections/0" },
    ] as JSONDeltas;

    const { patches, rest } = toMemberPatches(deltas, INDEX, "m1");

    expect(rest).toEqual([]);
    expect(patches).toEqual([
      {
        sampleId: "m1",
        patch: [
          {
            op: "replace",
            path: "/detections/detections/0/label",
            value: "dog",
          },
        ],
      },
      {
        sampleId: "m3",
        patch: [{ op: "remove", path: "/detections/detections/0" }],
      },
    ]);
  });

  it("rejects a frame with no member sample rather than guessing one", () => {
    const deltas = [
      {
        op: "replace",
        path: "/frames/4/detections/detections/0/label",
        value: "dog",
      },
    ] as JSONDeltas;

    expect(() => toMemberPatches(deltas, INDEX, "m1")).toThrow(
      "no member sample at frame 4",
    );
  });

  it("merges sample-level ops into the anchor's existing patch", () => {
    const deltas = [
      {
        op: "replace",
        path: "/frames/2/detections/detections/0/label",
        value: "dog",
      },
      { op: "replace", path: "/scene", value: "tunnel" },
    ] as JSONDeltas;

    const { patches, rest } = toMemberPatches(deltas, INDEX, "m2");

    expect(rest).toEqual([]);
    expect(patches).toEqual([
      {
        sampleId: "m2",
        patch: [
          {
            op: "replace",
            path: "/detections/detections/0/label",
            value: "dog",
          },
          { op: "replace", path: "/scene", value: "tunnel" },
        ],
      },
    ]);
  });

  it("gives the anchor its own patch when no frame op touched it", () => {
    const deltas = [
      { op: "replace", path: "/scene", value: "tunnel" },
    ] as JSONDeltas;

    const { patches, rest } = toMemberPatches(deltas, INDEX, "m3");

    expect(rest).toEqual([]);
    expect(patches).toEqual([
      {
        sampleId: "m3",
        patch: [{ op: "replace", path: "/scene", value: "tunnel" }],
      },
    ]);
  });

  it("leaves sample-level ops to the single-sample patch when the anchor is not a member", () => {
    const deltas = [
      { op: "replace", path: "/scene", value: "tunnel" },
    ] as JSONDeltas;

    const { patches, rest } = toMemberPatches(deltas, INDEX, "outsider");

    expect(patches).toEqual([]);
    expect(rest).toEqual([{ op: "replace", path: "/scene", value: "tunnel" }]);
  });
});

describe("writtenMemberDeltas", () => {
  const deltas = [
    { op: "add", path: "/frames/1/detections/detections/1", value: {} },
    { op: "remove", path: "/frames/2/detections/detections/0" },
    {
      op: "replace",
      path: "/frames/3/detections/detections/0/label",
      value: "dog",
    },
    { op: "replace", path: "/scene", value: "tunnel" },
  ] as JSONDeltas;

  it("keeps only the ops belonging to the written members", () => {
    expect(writtenMemberDeltas(deltas, INDEX, ["m1", "m3"])).toEqual([
      { op: "add", path: "/frames/1/detections/detections/1", value: {} },
      {
        op: "replace",
        path: "/frames/3/detections/detections/0/label",
        value: "dog",
      },
    ]);
  });

  it("reconciles nothing when the request wrote nothing", () => {
    expect(writtenMemberDeltas(deltas, INDEX, [])).toEqual([]);
  });

  it("ignores a written id the index no longer holds", () => {
    expect(writtenMemberDeltas(deltas, INDEX, ["departed"])).toEqual([]);
  });
});
