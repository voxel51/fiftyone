import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider, usePlayback } from "./PlaybackProvider";
import { PlaybackStreamBase } from "./stream-base";
import type { BufferReadiness } from "./types";
import { useStream } from "./use-stream";

class StaticStream extends PlaybackStreamBase<{ at: number }> {
  bufferState(): BufferReadiness {
    return "ready";
  }
  prefetch(): void {}
  getValue(time: number): { at: number } {
    return { at: time };
  }
}

const wrap = ({ children }: { children: React.ReactNode }) => (
  <PlaybackProvider duration={10}>{children}</PlaybackProvider>
);

describe("useStream", () => {
  afterEach(() => cleanup());

  it("returns null until a stream with the matching id is registered + committed", () => {
    const { result } = renderHook(() => useStream<{ at: number }>("camera"), {
      wrapper: wrap,
    });
    expect(result.current).toBeNull();
  });

  it("reflects the stream's current value once committed", () => {
    const { result } = renderHook(
      () => {
        const stream = useStream<{ at: number }>("camera");
        const { registerStream, seek } = usePlayback();
        return { stream, registerStream, seek };
      },
      { wrapper: wrap },
    );

    // Register a stream and seek — seeking commits since the stream is "ready".
    let dispose = () => {};
    act(() => {
      dispose = result.current.registerStream(new StaticStream("camera"));
    });
    act(() => {
      result.current.seek(3.5);
    });
    expect(result.current.stream).toEqual({ at: 3.5 });

    // Unregister → no further commits, but the last value sticks until cleared.
    act(() => dispose());
  });
});
