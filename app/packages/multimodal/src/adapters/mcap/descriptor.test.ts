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
          kind: "lerobot-episode",
          key: "source:17",
        },
        mediaType: "multimodal",
      }),
    ).toBe(false);
  });
});
