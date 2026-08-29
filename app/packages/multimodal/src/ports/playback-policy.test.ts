import { describe, expect, it } from "vitest";

import { prioritizedStreams } from "./playback-policy";

describe("prioritizedStreams", () => {
  it("deduplicates requested streams without changing their order", () => {
    expect(
      prioritizedStreams(["camera", "state", "camera"], undefined),
    ).toEqual(["camera", "state"]);
  });

  it("prioritizes requested streams once and preserves the remaining order", () => {
    expect(
      prioritizedStreams(
        ["camera", "state", "camera", "audio"],
        ["audio", "camera", "audio", "missing"],
      ),
    ).toEqual(["audio", "camera", "state"]);
  });
});
