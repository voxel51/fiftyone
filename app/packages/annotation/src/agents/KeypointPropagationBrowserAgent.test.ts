import { describe, expect, it } from "vitest";
import { interpolateKeypointNodes } from "./KeypointPropagationBrowserAgent";

const HOLE: [number, number] = [NaN, NaN];

describe("interpolateKeypointNodes", () => {
  it("lerps each node linearly", () => {
    const result = interpolateKeypointNodes(
      [
        [0, 0],
        [0.2, 0.4],
      ],
      [
        [1, 1],
        [0.4, 0.8],
      ],
      0.5,
    );

    expect(result[0]).toEqual([0.5, 0.5]);
    expect(result[1][0]).toBeCloseTo(0.3);
    expect(result[1][1]).toBeCloseTo(0.6);
  });

  it("keeps a hole when the left keyframe has one", () => {
    const result = interpolateKeypointNodes([HOLE], [[1, 1]], 0.5);
    expect(result[0][0]).toBeNaN();
    expect(result[0][1]).toBeNaN();
  });

  it("keeps a hole when the right keyframe has one", () => {
    const result = interpolateKeypointNodes([[0, 0]], [HOLE], 0.5);
    expect(result[0][0]).toBeNaN();
  });

  it("lerps placed nodes independently of holes at other indices", () => {
    const result = interpolateKeypointNodes(
      [[0, 0], HOLE],
      [[1, 1], HOLE],
      0.25,
    );

    expect(result[0]).toEqual([0.25, 0.25]);
    expect(result[1][0]).toBeNaN();
  });

  it("emits holes for a node-count mismatch tail", () => {
    const result = interpolateKeypointNodes(
      [[0, 0]],
      [
        [1, 1],
        [0.5, 0.5],
      ],
      0.5,
    );

    expect(result[0]).toEqual([0.5, 0.5]);
    expect(result[1][0]).toBeNaN();
  });
});
