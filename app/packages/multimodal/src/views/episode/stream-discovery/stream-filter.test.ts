import { describe, expect, it } from "vitest";

import { matchesStreamFilter } from "./stream-filter";

describe("matchesStreamFilter", () => {
  it("matches trimmed queries across stream metadata without case sensitivity", () => {
    expect(
      matchesStreamFilter("  odom  ", "/vehicle/ODOMETRY", "nav_msgs/Odometry"),
    ).toBe(true);
    expect(matchesStreamFilter("camera", "/vehicle/odometry", null)).toBe(
      false,
    );
    expect(
      matchesStreamFilter("nav_msgs", "/vehicle/odometry", "NAV_MSGS/Odometry"),
    ).toBe(true);
  });
});
