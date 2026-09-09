import { describe, expect, it } from "vitest";

import { detectMcapSample } from "./descriptor";

describe("detectMcapSample", () => {
  it("keeps ordinary MCAP and legacy pathless multimodal detection", () => {
    expect(
      detectMcapSample({ mediaType: "multimodal", path: "/tmp/run.mcap" }),
    ).toBe(true);
    expect(detectMcapSample({ mediaType: "multimodal" })).toBe(true);
    expect(
      detectMcapSample({ mediaType: "multimodal", path: "/tmp/run.mcap?x=1" }),
    ).toBe(true);
    expect(
      detectMcapSample({ mediaType: "multimodal", path: "/tmp/run.mcap#part" }),
    ).toBe(true);
    expect(
      detectMcapSample({ mediaType: "multimodal", path: "/tmp/run.json" }),
    ).toBe(false);
  });

  it("rejects pathless media-reference samples", () => {
    expect(
      detectMcapSample({
        mediaReference: {
          _cls: "LeRobotEpisodeReference",
          key: "lerobot-source/0",
        },
        mediaType: "multimodal",
      }),
    ).toBe(false);
  });
});
