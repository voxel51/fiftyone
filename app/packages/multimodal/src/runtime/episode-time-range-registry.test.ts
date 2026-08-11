import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEpisodeTimeRange,
  publishEpisodeTimeRange,
  releaseEpisodeTimeRange,
  resetEpisodeTimeRangesForTests,
  subscribeEpisodeTimeRange,
} from "./episode-time-range-registry";

afterEach(resetEpisodeTimeRangesForTests);

describe("episode time-range registry", () => {
  it("publishes, releases, and notifies one episode independently", () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribe = subscribeEpisodeTimeRange("first", firstListener);
    subscribeEpisodeTimeRange("second", secondListener);

    publishEpisodeTimeRange("first", { endNs: 2n, startNs: 1n });
    expect(getEpisodeTimeRange("first")).toEqual({ endNs: 2n, startNs: 1n });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).not.toHaveBeenCalled();

    releaseEpisodeTimeRange("first");
    expect(getEpisodeTimeRange("first")).toBeNull();
    expect(firstListener).toHaveBeenCalledTimes(2);
    releaseEpisodeTimeRange("missing");
    expect(firstListener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
