import { describe, expect, it } from "vitest";

import type { EpisodeSession } from "../../../ports";
import { useEpisodeStreams } from "./use-episode-streams";

describe("useEpisodeStreams", () => {
  it("exposes the neutral manifest streams", () => {
    const session = testSession();
    const state = useEpisodeStreams({ session, sourceAvailable: true });

    expect(state.status).toBe("ready");
    expect(state.streams).toEqual([
      expect.objectContaining({
        count: 12,
        id: "camera",
        sourceName: "/camera/front",
      }),
    ]);
    expect(state.streams[0].payload).toEqual(
      expect.objectContaining({ encoding: "cdr", schema: "sensor_msgs/Image" }),
    );
  });

  it("reports idle, loading, and adapter errors without stale inventory", () => {
    expect(
      useEpisodeStreams({ session: null, sourceAvailable: false }).status,
    ).toBe("idle");
    expect(
      useEpisodeStreams({ session: null, sourceAvailable: true }).status,
    ).toBe("loading");
    expect(
      useEpisodeStreams({
        error: "bad episode",
        session: null,
        sourceAvailable: true,
      }),
    ).toEqual({ error: "bad episode", status: "error", streams: [] });
  });
});

function testSession(): EpisodeSession {
  return {
    dispose: () => undefined,
    manifest: {
      episodeId: "test",
      streams: [
        {
          count: 12,
          id: "camera",
          kind: "image",
          metadata: { role: "front" },
          payload: { encoding: "cdr", schema: "sensor_msgs/Image" },
          sourceName: "/camera/front",
          timeRange: { endNs: 1n, startNs: 0n },
        },
      ],
      timeDomain: { id: "time", kind: "timestamp" },
      timeRange: { endNs: 1n, startNs: 0n },
    },
    async *read() {
      yield* [];
    },
  };
}
