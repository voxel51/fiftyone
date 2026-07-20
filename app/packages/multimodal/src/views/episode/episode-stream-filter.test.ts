import { describe, expect, it } from "vitest";

import { matchesEpisodeStreamFilter } from "./episode-stream-filter";

describe("matchesEpisodeStreamFilter", () => {
  it("matches trimmed queries across stream metadata without case sensitivity", () => {
    expect(
      matchesEpisodeStreamFilter(
        "  odom  ",
        "/vehicle/ODOMETRY",
        "nav_msgs/Odometry",
      ),
    ).toBe(true);
    expect(
      matchesEpisodeStreamFilter("camera", "/vehicle/odometry", null),
    ).toBe(false);
    expect(
      matchesEpisodeStreamFilter(
        "nav_msgs",
        "/vehicle/odometry",
        "NAV_MSGS/Odometry",
      ),
    ).toBe(true);
  });
});
