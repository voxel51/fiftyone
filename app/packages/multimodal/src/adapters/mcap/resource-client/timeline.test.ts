import { describe, expect, it } from "vitest";
import {
  resolveMcapActiveTimeline,
  resolveMcapTimelineStrategy,
} from "./timeline";
import { MCAP_ACTIVE_TIMELINE } from "../contracts/index";

describe("MCAP timeline helpers", () => {
  it("defaults the active timeline to log", () => {
    expect(resolveMcapActiveTimeline(undefined)).toBe(MCAP_ACTIVE_TIMELINE.LOG);
  });

  it("resolves log timeline behavior through one strategy object", () => {
    const timeline = resolveMcapTimelineStrategy(undefined);

    expect(timeline.id).toBe(MCAP_ACTIVE_TIMELINE.LOG);
    expect(timeline.cacheKeySuffix).toBe("activeTimeline=log");
    expect(
      timeline.messageTimeNs({
        channelId: 1,
        data: new Uint8Array(),
        logTime: 10n,
        publishTime: 20n,
        sequence: 0,
        type: "Message",
      }),
    ).toBe(10n);
  });

  it("rejects unsupported timeline values from untyped callers", () => {
    expect(() => resolveMcapActiveTimeline("publish")).toThrow(
      "Unsupported MCAP active timeline 'publish'",
    );
  });
});
