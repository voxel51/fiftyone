import { describe, expect, it, vi } from "vitest";
import type { PointCloudRenderChannelPayload } from "../../../ir";
import {
  evictOldestPointCloudChannels,
  POINT_CLOUD_CHANNEL_CACHE_LIMIT,
  pointCloudChannelKey,
  readPointCloudChannelWithCache,
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

  it("does not coalesce reads owned by different caller signals", async () => {
    const cache = new Map<string, Promise<PointCloudRenderChannelPayload>>();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const read = vi.fn(
      (signal: AbortSignal) =>
        new Promise<{ readonly kind: "none"; readonly samplePlanKey: string }>(
          (resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("first canceled")),
              { once: true },
            );
            if (signal === secondController.signal) {
              resolve({ kind: "none", samplePlanKey: "plan" });
            }
          },
        ),
    );

    const first = readPointCloudChannelWithCache(
      cache,
      "same-key",
      firstController.signal,
      () => read(firstController.signal),
    );
    const second = readPointCloudChannelWithCache(
      cache,
      "same-key",
      secondController.signal,
      () => read(secondController.signal),
    );

    firstController.abort();
    await expect(first).rejects.toThrow("first canceled");
    await expect(second).resolves.toEqual({
      kind: "none",
      samplePlanKey: "plan",
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(cache).toHaveLength(0);
  });

  it("still coalesces unsigned cache-owned reads", () => {
    const cache = new Map<string, Promise<PointCloudRenderChannelPayload>>();
    const read = vi.fn(() =>
      Promise.resolve({ kind: "none" as const, samplePlanKey: "plan" }),
    );

    const first = readPointCloudChannelWithCache(
      cache,
      "same-key",
      undefined,
      read,
    );
    const second = readPointCloudChannelWithCache(
      cache,
      "same-key",
      undefined,
      read,
    );

    expect(first).toBe(second);
    expect(read).toHaveBeenCalledOnce();
  });
});
