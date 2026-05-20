import { cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider, usePlayback } from "./PlaybackProvider";
import { PlaybackStreamBase } from "./stream-base";
import type { BufferReadiness } from "./types";
import { usePlaybackStream } from "./use-playback-stream";

class StaticStream extends PlaybackStreamBase<null> {
  bufferState(): BufferReadiness {
    return "ready";
  }
  prefetch(): void {}
  getValue(): null {
    return null;
  }
}

const wrap = ({ children }: { children: React.ReactNode }) => (
  <PlaybackProvider duration={5}>{children}</PlaybackProvider>
);

describe("usePlaybackStream", () => {
  afterEach(() => cleanup());

  it("registers the stream on mount and updates duration to follow it", () => {
    const stream = new StaticStream("graph", { duration: 12 });
    const { result } = renderHook(
      () => {
        usePlaybackStream(stream);
        return usePlayback();
      },
      { wrapper: wrap }
    );
    expect(result.current.duration).toBe(12);
  });

  it("deregisters on unmount, restoring the provider fallback duration", () => {
    const stream = new StaticStream("graph", { duration: 12 });
    const { result, unmount } = renderHook(
      () => {
        usePlaybackStream(stream);
        return usePlayback();
      },
      { wrapper: wrap }
    );
    expect(result.current.duration).toBe(12);
    unmount();

    // Re-mount a probe hook to read post-unmount duration.
    const { result: probe } = renderHook(() => usePlayback(), { wrapper: wrap });
    expect(probe.current.duration).toBe(5);
  });
});
