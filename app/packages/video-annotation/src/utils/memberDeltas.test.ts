import { describe, expect, it } from "vitest";
import type { JSONDeltas } from "@fiftyone/utilities";
import { splitMemberDeltas } from "./memberDeltas";

describe("splitMemberDeltas", () => {
  it("rebases frame ops onto the member root, keyed by frame", () => {
    const deltas = [
      {
        op: "replace",
        path: "/frames/7/detections/detections/0/label",
        value: "dog",
      },
      {
        op: "add",
        path: "/frames/7/detections/detections/1",
        value: { _cls: "Detection", label: "new" },
      },
      { op: "remove", path: "/frames/12/detections/detections/0" },
    ] as JSONDeltas;

    const { byFrame, rest } = splitMemberDeltas(deltas);

    expect(rest).toEqual([]);
    expect([...byFrame.keys()]).toEqual([7, 12]);
    expect(byFrame.get(7)).toEqual([
      {
        op: "replace",
        path: "/detections/detections/0/label",
        value: "dog",
      },
      {
        op: "add",
        path: "/detections/detections/1",
        value: { _cls: "Detection", label: "new" },
      },
    ]);
    expect(byFrame.get(12)).toEqual([
      { op: "remove", path: "/detections/detections/0" },
    ]);
  });

  it("passes non-frame ops through untouched", () => {
    const deltas = [
      { op: "replace", path: "/classification/label", value: "sunny" },
      {
        op: "replace",
        path: "/frames/3/detections/detections/0/label",
        value: "dog",
      },
    ] as JSONDeltas;

    const { byFrame, rest } = splitMemberDeltas(deltas);

    expect(rest).toEqual([
      { op: "replace", path: "/classification/label", value: "sunny" },
    ]);
    expect(byFrame.get(3)).toHaveLength(1);
  });

  it("does not mutate the input ops", () => {
    const op = {
      op: "replace",
      path: "/frames/1/detections/detections/0/label",
      value: "dog",
    };

    splitMemberDeltas([op] as JSONDeltas);

    expect(op.path).toBe("/frames/1/detections/detections/0/label");
  });

  it("rebases a same-frame move's from pointer", () => {
    const deltas = [
      {
        op: "move",
        from: "/frames/2/detections/detections/0",
        path: "/frames/2/detections/detections/1",
      },
    ] as JSONDeltas;

    const { byFrame } = splitMemberDeltas(deltas);

    expect(byFrame.get(2)).toEqual([
      {
        op: "move",
        from: "/detections/detections/0",
        path: "/detections/detections/1",
      },
    ]);
  });

  it("rejects a cross-frame move", () => {
    const deltas = [
      {
        op: "move",
        from: "/frames/2/detections/detections/0",
        path: "/frames/3/detections/detections/0",
      },
    ] as JSONDeltas;

    expect(() => splitMemberDeltas(deltas)).toThrow(/cross-frame/);
  });

  it("keeps a bare /frames pointer without a frame number in rest", () => {
    const deltas = [
      { op: "replace", path: "/frames", value: [] },
    ] as JSONDeltas;

    const { byFrame, rest } = splitMemberDeltas(deltas);

    expect(byFrame.size).toBe(0);
    expect(rest).toHaveLength(1);
  });
});
