import { describe, expect, it } from "vitest";

import { matchesMcapTopicFilter } from "./mcap-topic-filter";

describe("matchesMcapTopicFilter", () => {
  it("matches trimmed queries across topic metadata without case sensitivity", () => {
    expect(
      matchesMcapTopicFilter(
        "  odom  ",
        "/vehicle/ODOMETRY",
        "nav_msgs/Odometry",
      ),
    ).toBe(true);
    expect(matchesMcapTopicFilter("camera", "/vehicle/odometry", null)).toBe(
      false,
    );
    expect(
      matchesMcapTopicFilter(
        "nav_msgs",
        "/vehicle/odometry",
        "NAV_MSGS/Odometry",
      ),
    ).toBe(true);
  });
});
