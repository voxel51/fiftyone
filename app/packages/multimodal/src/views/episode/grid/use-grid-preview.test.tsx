import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ByteSourceDescriptor,
  type EncodedImageVisualization,
  type EpisodePosterFrame,
  type EpisodePreviewReadResult,
  VISUALIZATION_KIND,
} from "../../../ir";
import type { EpisodePreviewSession } from "../../../ports";
import {
  getSourceBootstrap,
  resetSourceBootstrapCacheForTests,
} from "../../../runtime";
import {
  GRID_BUFFERING_DELAY_MS,
  useGridPreview,
  type GridPreviewState,
} from "./use-grid-preview";

const sessionHarness = vi.hoisted(() => ({
  session: {
    dispose: vi.fn(),
    read: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetSourceBootstrapCacheForTests();
});

describe("useGridPreview", () => {
  beforeEach(() => {
    sessionHarness.session.read.mockReset();
  });

  it("loads an initial preview through the preview session", async () => {
    sessionHarness.session.read.mockResolvedValueOnce(
      readyResult({ bytes: [1, 2, 3], nextStartTimeNs: 5n }),
    );

    const { unmount } = render(
      <PreviewHarness id="initial" source={sourceForId("initial")} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-initial").textContent).toBe(
        "ready:1:frame:",
      );
    });

    expect(sessionHarness.session.read).toHaveBeenCalledWith(
      {},
      {
        priority: "idle",
        signal: expect.any(AbortSignal),
      },
    );
    expect(
      firstImageByte(
        getSourceBootstrap(sourceForId("initial"))?.poster ?? null,
      ),
    ).toBe(1);

    const signal = sessionHarness.session.read.mock.calls[0]?.[1]
      ?.signal as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
  });

  it("promotes a pending initial frame when its tile is hovered", async () => {
    const background = deferred<EpisodePreviewReadResult>();
    const foreground = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
      .mockReturnValueOnce(background.promise)
      .mockReturnValueOnce(foreground.promise);
    const source = sourceForId("hover-priority");
    const { rerender } = render(
      <PreviewHarness id="hover-priority" source={source} />,
    );
    const backgroundSignal = sessionHarness.session.read.mock.calls[0]?.[1]
      ?.signal as AbortSignal;

    rerender(<PreviewHarness hovered id="hover-priority" source={source} />);

    expect(backgroundSignal.aborted).toBe(true);
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);
    expect(sessionHarness.session.read.mock.calls[1]?.[1]).toMatchObject({
      priority: "current",
    });

    foreground.resolve(readyResult({ bytes: [4] }));
    await waitFor(() => {
      expect(screen.getByTestId("preview-hover-priority").textContent).toBe(
        "ready:1:frame:",
      );
    });
    background.resolve(readyResult({ bytes: [1] }));
  });

  it("aborts stale source loads and ignores late results", async () => {
    const first = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(emptyResult(false));

    const { rerender } = render(
      <PreviewHarness id="source" source={sourceForId("first")} />,
    );
    const firstSignal = sessionHarness.session.read.mock.calls[0]?.[1]
      ?.signal as AbortSignal;

    rerender(<PreviewHarness id="source" source={sourceForId("second")} />);

    expect(firstSignal.aborted).toBe(true);
    first.resolve(readyResult({ bytes: [9], nextStartTimeNs: 9n }));

    await waitFor(() => {
      expect(screen.getByTestId("preview-source").textContent).toBe(
        "empty:0:no-frame:",
      );
    });
  });

  it("surfaces initial load failures", async () => {
    sessionHarness.session.read.mockRejectedValueOnce(new Error("boom"));

    render(<PreviewHarness id="error" source={sourceForId("error")} />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-error").textContent).toBe(
        "error:0:no-frame:boom",
      );
    });
  });

  it("isolates an initial result observer failure from preview state", async () => {
    const observerError = new Error("observer failed");
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    sessionHarness.session.read.mockResolvedValueOnce(
      readyResult({ bytes: [1] }),
    );

    render(
      <PreviewHarness
        id="initial-observer-error"
        onReadResult={() => {
          throw observerError;
        }}
        source={sourceForId("initial-observer-error")}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("preview-initial-observer-error").textContent,
      ).toBe("ready:1:frame:");
    });
    expect(reportError).toHaveBeenCalledWith(observerError);
  });

  it("plays additional preview frames on hover", async () => {
    const latestState = { current: null as GridPreviewState | null };
    const hover = deferred<EpisodePreviewReadResult>();
    const nextRequest = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
      .mockResolvedValueOnce(
        readyResult({
          bytes: [1, 2, 3],
          frameTimeNs: 0n,
          nextStartTimeNs: 1n,
        }),
      )
      .mockReturnValueOnce(hover.promise)
      .mockReturnValue(nextRequest.promise);

    render(
      <PreviewHarness
        id="hover"
        onState={(state) => {
          latestState.current = state;
        }}
        source={sourceForId("hover")}
      />,
    );

    await waitFor(() => {
      expect(latestState.current?.status).toBe("ready");
    });
    expect(firstImageByte(latestState.current?.frame ?? null)).toBe(1);

    act(() => {
      latestState.current?.play();
    });

    await waitFor(() => {
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);
    });
    expect(sessionHarness.session.read.mock.calls[1]?.[0]).toMatchObject({
      startTimeNs: 1n,
    });
    expect(sessionHarness.session.read.mock.calls[1]?.[1]).toMatchObject({
      priority: "current",
    });

    hover.resolve(
      readyResult({
        bytes: [9, 8, 7],
        frameTimeNs: 100_000_000n,
        nextStartTimeNs: 100_000_001n,
      }),
    );

    await waitFor(() => {
      expect(firstImageByte(latestState.current?.frame ?? null)).toBe(9);
    });
    expect(
      firstImageByte(getSourceBootstrap(sourceForId("hover"))?.poster ?? null),
    ).toBe(9);

    act(() => {
      latestState.current?.pause();
    });
  });

  it("delivers every H.264 dependency frame even when UI pacing skips it", async () => {
    vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
    const latestState = { current: null as GridPreviewState | null };
    const onReadResult = vi.fn();
    const pending = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], frameTimeNs: 0n, nextStartTimeNs: 1n }),
      )
      .mockResolvedValueOnce(
        readyResult({
          bytes: [2],
          frameTimeNs: 33_000_000n,
          nextStartTimeNs: 33_000_001n,
        }),
      )
      .mockResolvedValueOnce(
        readyResult({
          bytes: [3],
          frameTimeNs: 66_000_000n,
          nextStartTimeNs: 66_000_001n,
        }),
      )
      .mockResolvedValueOnce(
        readyResult({
          bytes: [4],
          frameTimeNs: 99_000_000n,
          nextStartTimeNs: 99_000_001n,
        }),
      )
      .mockReturnValue(pending.promise);

    render(
      <PreviewHarness
        id="dependencies"
        onReadResult={onReadResult}
        onState={(state) => {
          latestState.current = state;
        }}
        source={sourceForId("dependencies")}
      />,
    );
    await act(async () => undefined);
    expect(onReadResult).toHaveBeenCalledTimes(1);

    act(() => latestState.current?.play());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onReadResult).toHaveBeenCalledTimes(4);
    expect(firstImageByte(latestState.current?.frame ?? null)).toBe(1);
    act(() => latestState.current?.pause());
  });

  it("continues hover playback when a result observer throws", async () => {
    const latestState = { current: null as GridPreviewState | null };
    const observerError = new Error("observer failed");
    const reportError = vi.fn();
    const pending = deferred<EpisodePreviewReadResult>();
    vi.stubGlobal("reportError", reportError);
    sessionHarness.session.read
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], frameTimeNs: 0n, nextStartTimeNs: 1n }),
      )
      .mockResolvedValueOnce(
        readyResult({
          bytes: [2],
          frameTimeNs: 100_000_000n,
          nextStartTimeNs: 100_000_001n,
        }),
      )
      .mockReturnValue(pending.promise);

    render(
      <PreviewHarness
        id="hover-observer-error"
        onReadResult={(result) => {
          if (firstImageByte(result.frame) === 2) throw observerError;
        }}
        onState={(state) => {
          latestState.current = state;
        }}
        source={sourceForId("hover-observer-error")}
      />,
    );
    await waitFor(() => expect(latestState.current?.status).toBe("ready"));

    act(() => latestState.current?.play());
    await waitFor(() => {
      expect(firstImageByte(latestState.current?.frame ?? null)).toBe(2);
    });
    expect(reportError).toHaveBeenCalledWith(observerError);
    expect(latestState.current?.status).toBe("ready");
    expect(latestState.current?.error).toBeNull();
    await waitFor(() =>
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(3),
    );
    act(() => latestState.current?.pause());
  });

  it("reports buffering only when a hover frame read stays pending", async () => {
    vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
    const latestState = { current: null as GridPreviewState | null };
    const hover = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
      .mockResolvedValueOnce(readyResult({ bytes: [1] }))
      .mockReturnValueOnce(hover.promise);

    render(
      <PreviewHarness
        id="buffering"
        onState={(state) => {
          latestState.current = state;
        }}
        source={sourceForId("buffering")}
      />,
    );
    await act(async () => undefined);

    act(() => latestState.current?.play());
    await act(async () => undefined);
    expect(latestState.current?.isBuffering).toBe(false);

    act(() => {
      vi.advanceTimersByTime(GRID_BUFFERING_DELAY_MS - 1);
    });
    expect(latestState.current?.isBuffering).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(latestState.current?.isBuffering).toBe(true);

    act(() => latestState.current?.pause());
    expect(latestState.current?.isBuffering).toBe(false);
  });

  it("presents hover frames at their recorded one-times cadence", async () => {
    vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
    const latestState = { current: null as GridPreviewState | null };
    const nextRequest = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
      .mockResolvedValueOnce(
        readyResult({
          bytes: [1],
          frameTimeNs: 0n,
          nextStartTimeNs: 1n,
        }),
      )
      .mockResolvedValueOnce(
        readyResult({
          bytes: [2],
          frameTimeNs: 500_000_000n,
          nextStartTimeNs: 500_000_001n,
        }),
      )
      .mockReturnValue(nextRequest.promise);

    render(
      <PreviewHarness
        id="paced"
        onState={(state) => {
          latestState.current = state;
        }}
        source={sourceForId("paced")}
      />,
    );
    await act(async () => undefined);
    expect(firstImageByte(latestState.current?.frame ?? null)).toBe(1);

    act(() => latestState.current?.play());
    await act(async () => undefined);
    expect(firstImageByte(latestState.current?.frame ?? null)).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(firstImageByte(latestState.current?.frame ?? null)).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(firstImageByte(latestState.current?.frame ?? null)).toBe(2);

    act(() => latestState.current?.pause());
  });

  it("backs off before retrying a missing hover frame", async () => {
    vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
    const latestState = { current: null as GridPreviewState | null };
    const retry = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
      .mockResolvedValueOnce(readyResult({ bytes: [1] }))
      .mockResolvedValueOnce(emptyResult(true))
      .mockReturnValue(retry.promise);

    render(
      <PreviewHarness
        id="missing-frame"
        onState={(state) => {
          latestState.current = state;
        }}
        source={sourceForId("missing-frame")}
      />,
    );
    await act(async () => undefined);

    act(() => latestState.current?.play());
    await act(async () => undefined);
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(82));
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(2));
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(3);

    act(() => latestState.current?.pause());
  });

  it("reloads and sends the selected source name when it changes", async () => {
    sessionHarness.session.read
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], streamId: "/camera/front" }),
      )
      .mockResolvedValueOnce(
        readyResult({ bytes: [2], streamId: "/camera/back" }),
      );

    const { rerender } = render(
      <PreviewHarness
        id="selected"
        selectedSourceName="/camera/front"
        source={sourceForId("selected")}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-selected").textContent).toBe(
        "ready:1:frame:",
      );
    });

    rerender(
      <PreviewHarness
        id="selected"
        selectedSourceName="/camera/back"
        source={sourceForId("selected")}
      />,
    );

    await waitFor(() => {
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);
    });
    expect(sessionHarness.session.read.mock.calls[1]?.[0]).toMatchObject({
      sourceName: "/camera/back",
    });
  });

  it("does not play while a selected stream reload is still loading", async () => {
    const latestState = { current: null as GridPreviewState | null };
    const reload = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], streamId: "/camera/front" }),
      )
      .mockReturnValueOnce(reload.promise);

    const { rerender } = render(
      <PreviewHarness
        id="reload-play"
        onState={(state) => {
          latestState.current = state;
        }}
        selectedSourceName="/camera/front"
        source={sourceForId("reload-play")}
      />,
    );

    await waitFor(() => {
      expect(latestState.current?.status).toBe("ready");
    });

    act(() => {
      latestState.current?.play();
      rerender(
        <PreviewHarness
          id="reload-play"
          onState={(state) => {
            latestState.current = state;
          }}
          selectedSourceName="/camera/back"
          source={sourceForId("reload-play")}
        />,
      );
    });

    await waitFor(() => {
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);
    });
    await act(async () => undefined);
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);

    reload.resolve(readyResult({ bytes: [2], streamId: "/camera/back" }));
  });

  it("defers hidden cells and reuses their loaded frame on re-entry", async () => {
    sessionHarness.session.read.mockResolvedValueOnce(
      readyResult({ bytes: [7], nextStartTimeNs: 10n }),
    );
    const source = sourceForId("visibility");
    const { rerender } = render(
      <PreviewHarness enabled={false} id="visibility" source={source} />,
    );

    expect(sessionHarness.session.read).not.toHaveBeenCalled();

    rerender(<PreviewHarness enabled id="visibility" source={source} />);
    await waitFor(() => {
      expect(screen.getByTestId("preview-visibility").textContent).toBe(
        "ready:1:frame:",
      );
    });

    rerender(
      <PreviewHarness enabled={false} id="visibility" source={source} />,
    );
    rerender(<PreviewHarness enabled id="visibility" source={source} />);

    expect(sessionHarness.session.read).toHaveBeenCalledTimes(1);
  });
});

function PreviewHarness({
  enabled,
  hovered,
  id,
  onReadResult,
  onState,
  selectedSourceName,
  source,
}: {
  readonly enabled?: boolean;
  readonly hovered?: boolean;
  readonly id: string;
  readonly onReadResult?: (result: EpisodePreviewReadResult) => void;
  readonly onState?: (state: GridPreviewState) => void;
  readonly selectedSourceName?: string | null;
  readonly source: ByteSourceDescriptor | null;
}) {
  const state = useGridPreview({
    enabled,
    hovered,
    onReadResult,
    previewSession: sessionHarness.session as EpisodePreviewSession,
    previewSessionStatus: "ready",
    selectedSourceName,
    source,
  });

  // This effect exposes each hook update to tests that inspect live state.
  useEffect(() => {
    onState?.(state);
  }, [onState, state]);

  return <div data-testid={`preview-${id}`}>{formatState(state)}</div>;
}

function formatState(state: GridPreviewState): string {
  return [
    state.status,
    state.hasPreviewStreams ? "1" : "0",
    state.frame ? "frame" : "no-frame",
    state.error ?? "",
  ].join(":");
}

function readyResult({
  bytes,
  nextStartTimeNs = 5n,
  frameTimeNs = nextStartTimeNs === undefined
    ? undefined
    : nextStartTimeNs - 1n,
  streamId = "/camera/front",
}: {
  readonly bytes: readonly number[];
  readonly frameTimeNs?: bigint;
  readonly streamId?: string;
  readonly nextStartTimeNs?: bigint;
}): EpisodePreviewReadResult {
  return {
    frame: {
      image: createImage(bytes),
      kind: "image",
    },
    frameTimeNs,
    nextStartTimeNs,
    streamId,
    streamSourceName: streamId,
    streamSourceNames: [streamId],
    status: "ready",
  };
}

function emptyResult(hasPreviewStreams: boolean): EpisodePreviewReadResult {
  return {
    frame: null,
    streamId: hasPreviewStreams ? "/camera/front" : null,
    streamSourceName: hasPreviewStreams ? "/camera/front" : null,
    streamSourceNames: hasPreviewStreams ? ["/camera/front"] : [],
    status: "empty",
  };
}

function firstImageByte(frame: EpisodePosterFrame | null): number | undefined {
  return frame?.kind === "image" && "bytes" in frame.image
    ? frame.image.bytes[0]
    : undefined;
}

function createImage(bytes: readonly number[]): EncodedImageVisualization {
  return {
    bytes: new Uint8Array(bytes),
    kind: VISUALIZATION_KIND.ENCODED_IMAGE,
  };
}

const SOURCES_BY_ID = new Map<string, ByteSourceDescriptor>();

function sourceForId(id: string): ByteSourceDescriptor {
  let source = SOURCES_BY_ID.get(id);
  if (!source) {
    source = {
      sourceId: id,
      url: `memory://${id}.episode`,
    };
    SOURCES_BY_ID.set(id, source);
  }

  return source;
}

function deferred<T>() {
  let resolveDeferred: ((value: T) => void) | undefined;
  let rejectDeferred: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = resolvePromise;
    rejectDeferred = rejectPromise;
  });

  return {
    promise,
    reject(reason?: unknown) {
      rejectDeferred?.(reason);
    },
    resolve(value: T) {
      resolveDeferred?.(value);
    },
  };
}
