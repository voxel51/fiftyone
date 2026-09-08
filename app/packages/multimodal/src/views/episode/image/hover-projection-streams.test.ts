import { describe, expect, it } from "vitest";

import { projectionStreamsForHover } from "./hover-projection-streams";

describe("image hover projection streams", () => {
  it("subscribes to a hovered source without enabling its full overlay", () => {
    expect(projectionStreamsForHover([], ["/lidar"], "/lidar")).toEqual([
      "/lidar",
    ]);
  });

  it("preserves rendered streams without duplicates or unavailable sources", () => {
    const rendered = ["/lidar"] as const;
    expect(projectionStreamsForHover(rendered, ["/lidar"], "/lidar")).toBe(
      rendered,
    );
    expect(projectionStreamsForHover([], ["/other"], "/lidar")).toEqual([]);
  });
});
