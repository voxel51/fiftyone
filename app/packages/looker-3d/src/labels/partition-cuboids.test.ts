import { describe, expect, it } from "vitest";
import { partitionCuboidsByEditedLabel } from "./partition-cuboids";

function overlay(id: string) {
  return { data: { _id: id } };
}

describe("partitionCuboidsByEditedLabel", () => {
  it("puts everything in instancedDetections when nothing is being edited", () => {
    const detections = [overlay("a"), overlay("b"), overlay("c")];

    const { standaloneDetections, instancedDetections } =
      partitionCuboidsByEditedLabel(detections, undefined);

    expect(standaloneDetections).toEqual([]);
    expect(instancedDetections).toEqual(detections);
  });

  it("moves only the edited label into standaloneDetections", () => {
    const a = overlay("a");
    const b = overlay("b");
    const c = overlay("c");

    const { standaloneDetections, instancedDetections } =
      partitionCuboidsByEditedLabel([a, b, c], "b");

    expect(standaloneDetections).toEqual([b]);
    expect(instancedDetections).toEqual([a, c]);
  });

  it("preserves the relative order of the batched labels", () => {
    const detections = [overlay("a"), overlay("b"), overlay("c"), overlay("d")];

    const { instancedDetections } = partitionCuboidsByEditedLabel(
      detections,
      "c",
    );

    expect(instancedDetections.map((d) => d.data._id)).toEqual(["a", "b", "d"]);
  });

  it("falls back to instancedDetections-only when the edited id isn't present", () => {
    const detections = [overlay("a"), overlay("b")];

    const { standaloneDetections, instancedDetections } =
      partitionCuboidsByEditedLabel(detections, "does-not-exist");

    expect(standaloneDetections).toEqual([]);
    expect(instancedDetections).toEqual(detections);
  });

  it("returns a new instancedDetections array rather than the input reference", () => {
    const detections = [overlay("a")];

    const { instancedDetections } = partitionCuboidsByEditedLabel(
      detections,
      undefined,
    );

    expect(instancedDetections).not.toBe(detections);
    expect(instancedDetections).toEqual(detections);
  });

  it("handles an empty input", () => {
    expect(partitionCuboidsByEditedLabel([], "a")).toEqual({
      standaloneDetections: [],
      instancedDetections: [],
    });
  });
});
