import { describe, expect, it } from "vitest";
import {
  evictOldestPointCloudChannels,
  POINT_CLOUD_CHANNEL_CACHE_LIMIT,
  pointCloudChannelKey,
} from "./point-cloud-channel-cache";

describe("point-cloud channel cache policy", () => {
  it("builds the full source, stream, time, plan, and color identity", () => {
    expect(pointCloudChannelKey("source", "stream", 12n, "plan", "rgb")).toBe(
      ["source", "stream", "12", "plan", "rgb"].join("\0"),
    );
  });

  it("evicts oldest inserted channels at the shared limit", () => {
    const cache = new Map<string, unknown>();
    for (let index = 0; index <= POINT_CLOUD_CHANNEL_CACHE_LIMIT; index += 1) {
      cache.set(String(index), index);
    }
    evictOldestPointCloudChannels(cache);
    expect(cache).toHaveLength(POINT_CLOUD_CHANNEL_CACHE_LIMIT);
    expect(cache.has("0")).toBe(false);
    expect(cache.has("1")).toBe(true);
  });
});
