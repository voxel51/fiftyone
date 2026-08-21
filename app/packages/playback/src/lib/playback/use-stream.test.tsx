import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider, usePlayback } from "./PlaybackProvider";
import { PlaybackStreamBase } from "./stream-base";
import type { BufferReadiness } from "./types";
import {
  useActivateStream,
  useStream,
  useStreamValue,
  useStreamValueSelector,
  useStreamValuesSelector,
} from "./use-stream";

class StaticStream extends PlaybackStreamBase<{ at: number }> {
  bufferState(): BufferReadiness {
    return "ready";
  }
  prefetch(): void {}
  getValue(time: number): { at: number } {
    return { at: time };
  }
}

/** Counts readiness checks so tests can tell "driven" from "skipped". */
class CountingStream extends PlaybackStreamBase<{ at: number }> {
  bufferStateCalls = 0;

  bufferState(): BufferReadiness {
    this.bufferStateCalls++;
    return "ready";
  }
  prefetch(): void {}
  getValue(time: number): { at: number } {
    return { at: time };
  }
}

const SHARED_CONTENT = { id: "frame" };

class MetadataStream extends PlaybackStreamBase<{
  readonly content: typeof SHARED_CONTENT;
  readonly requestedAt: number;
}> {
  bufferState(): BufferReadiness {
    return "ready";
  }
  prefetch(): void {}
  getValue(time: number) {
    return { content: SHARED_CONTENT, requestedAt: time };
  }
}

const selectContent = (
  value: { readonly content: typeof SHARED_CONTENT } | null,
) => value?.content ?? null;
const CAMERA_STREAM_IDS = ["camera"] as const;

const wrap = ({ children }: { children: React.ReactNode }) => (
  <PlaybackProvider duration={10}>{children}</PlaybackProvider>
);

describe("useActivateStream", () => {
  afterEach(() => cleanup());

  it("leaves a registered stream dormant when nothing subscribes", () => {
    const stream = new CountingStream("camera");
    const { result } = renderHook(
      () => {
        // Non-activating read, so registration is the only thing in play.
        const value = useStreamValue<{ at: number }>("camera");
        const { registerStream, seek } = usePlayback();
        return { value, registerStream, seek };
      },
      { wrapper: wrap },
    );

    act(() => {
      result.current.registerStream(stream);
    });
    act(() => {
      result.current.seek(3.5);
    });

    // The engine neither consults readiness nor publishes for a dormant stream.
    expect(stream.bufferStateCalls).toBe(0);
    expect(result.current.value).toBeNull();
  });

  it("activates a stream whose committed value has no consumer", () => {
    const stream = new CountingStream("camera");
    const { result } = renderHook(
      () => {
        useActivateStream("camera");
        const value = useStreamValue<{ at: number }>("camera");
        const { registerStream, seek } = usePlayback();
        return { value, registerStream, seek };
      },
      { wrapper: wrap },
    );

    act(() => {
      result.current.registerStream(stream);
    });
    act(() => {
      result.current.seek(3.5);
    });

    expect(stream.bufferStateCalls).toBeGreaterThan(0);
    expect(result.current.value).toEqual({ at: 3.5 });
  });

  it("returns the stream to dormancy when activation stops", () => {
    const stream = new CountingStream("camera");
    const { result, rerender } = renderHook(
      // An empty id is the documented no-op, so this toggles activation without
      // conditionally calling the hook.
      ({ id }: { id: string }) => {
        useActivateStream(id);
        const { registerStream, seek } = usePlayback();
        return { registerStream, seek };
      },
      { wrapper: wrap, initialProps: { id: "camera" } },
    );

    act(() => {
      result.current.registerStream(stream);
    });
    act(() => {
      result.current.seek(1);
    });

    const driven = stream.bufferStateCalls;
    expect(driven).toBeGreaterThan(0);

    rerender({ id: "" });
    act(() => {
      result.current.seek(2);
    });

    expect(stream.bufferStateCalls).toBe(driven);
  });
});

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

  it("does not re-render a selector consumer for metadata-only changes", () => {
    const renders = vi.fn();
    const { result } = renderHook(
      () => {
        renders();
        const content = useStreamValueSelector("camera", selectContent);
        const { registerStream, seek, subscribeStream } = usePlayback();
        return { content, registerStream, seek, subscribeStream };
      },
      { wrapper: wrap },
    );

    act(() => {
      result.current.registerStream(new MetadataStream("camera"));
      result.current.subscribeStream("camera");
    });
    act(() => result.current.seek(1));
    expect(result.current.content).toBe(SHARED_CONTENT);
    const rendersAfterContent = renders.mock.calls.length;

    act(() => result.current.seek(2));

    expect(result.current.content).toBe(SHARED_CONTENT);
    expect(renders).toHaveBeenCalledTimes(rendersAfterContent);
  });

  it("does not re-render a multi-stream selector for metadata-only changes", () => {
    const renders = vi.fn();
    const { result } = renderHook(
      () => {
        renders();
        const content = useStreamValuesSelector(
          CAMERA_STREAM_IDS,
          selectContent,
        );
        const { registerStream, seek, subscribeStream } = usePlayback();
        return { content, registerStream, seek, subscribeStream };
      },
      { wrapper: wrap },
    );

    act(() => {
      result.current.registerStream(new MetadataStream("camera"));
      result.current.subscribeStream("camera");
    });
    act(() => result.current.seek(1));
    expect(result.current.content).toEqual([SHARED_CONTENT]);
    const rendersAfterContent = renders.mock.calls.length;

    act(() => result.current.seek(2));

    expect(result.current.content).toEqual([SHARED_CONTENT]);
    expect(renders).toHaveBeenCalledTimes(rendersAfterContent);
  });
});
