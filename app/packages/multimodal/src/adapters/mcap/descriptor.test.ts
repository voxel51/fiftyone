import { describe, expect, it } from "vitest";

import { detectMcapSample } from "./descriptor";

describe("detectMcapSample", () => {
  it("keeps ordinary MCAP and legacy pathless multimodal detection", () => {
    expect(
      detectMcapSample({ mediaType: "multimodal", path: "/tmp/run.mcap" }),
    ).toBe(true);
    expect(detectMcapSample({ mediaType: "multimodal" })).toBe(true);
  });

  it("rejects pathless media-reference samples", () => {
    expect(
      detectMcapSample({
        mediaReference: {
          kind: "lerobot-episode",
          key: "source:17",
          version: "1",
        },
        mediaType: "multimodal",
      }),
    ).toBe(false);
  });
});
