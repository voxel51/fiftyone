import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EpisodeSession } from "../../../ports";
import { useTimeRange } from "./use-time-range";

describe("useTimeRange", () => {
  it("returns the session manifest range", () => {
    const range = { endNs: 40n, startNs: 30n };
    const session = {
      manifest: {
        episodeId: "test",
        streams: [],
        timeDomain: { id: "time", kind: "timestamp" },
        timeRange: range,
      },
    } as unknown as EpisodeSession;

    const { result } = renderHook(() => useTimeRange(session));

    expect(result.current).toBe(range);
  });

  it("returns null while no session is open", () => {
    const { result } = renderHook(() => useTimeRange(null));
    expect(result.current).toBeNull();
  });
});
