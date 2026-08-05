import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncodedImageVisualization } from "../../../decoders";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapGridPreviewResult } from "../grid-preview";
import { firstImageByte } from "../grid-preview-test-utils";
import {
  getMcapSourceBootstrap,
  resetMcapSourceBootstrapCacheForTests,
} from "../source-bootstrap-cache";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "../worker/playback-worker-types";
import {
  MCAP_GRID_BUFFERING_DELAY_MS,
  useMcapGridPreview,
  type McapGridPreviewState,
} from "./use-mcap-grid-preview";

const poolHarness = vi.hoisted(() => {
  const pool = {
    acquire: vi.fn(),
    release: vi.fn(),
    request: vi.fn(),
  };

  return {
    getMcapGridPreviewPool: vi.fn(() => pool),
    pool,
  };
});

vi.mock("../worker", () => ({
  getMcapGridPreviewPool: poolHarness.getMcapGridPreviewPool,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetMcapSourceBootstrapCacheForTests();
});

describe("useMcapGridPreview", () => {
  beforeEach(() => {
    poolHarness.getMcapGridPreviewPool.mockClear();
    poolHarness.pool.acquire.mockClear();
    poolHarness.pool.release.mockClear();
    poolHarness.pool.request.mockReset();
  });

  it("loads an initial preview through the shared pool", async () => {
    poolHarness.pool.request.mockResolvedValueOnce(
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

    expect(poolHarness.pool.acquire).toHaveBeenCalledTimes(1);
    expect(poolHarness.pool.request).toHaveBeenCalledWith(
      { source: sourceForId("initial") },
      {
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
        signal: expect.any(AbortSignal),
      },
    );
    expect(
      firstImageByte(
        getMcapSourceBootstrap(sourceForId("initial"))?.poster ?? null,
      ),
    ).toBe(1);

    const signal = poolHarness.pool.request.mock.calls[0]?.[1]
      ?.signal as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
    expect(poolHarness.pool.release).toHaveBeenCalledTimes(1);
  });

  it("promotes a pending initial frame when its tile is hovered", async () => {
    const background = deferred<McapGridPreviewResult>();
    const foreground = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
      .mockReturnValueOnce(background.promise)
      .mockReturnValueOnce(foreground.promise);
    const source = sourceForId("hover-priority");
    const { rerender } = render(
      <PreviewHarness id="hover-priority" source={source} />,
    );
    const backgroundSignal = poolHarness.pool.request.mock.calls[0]?.[1]
      ?.signal as AbortSignal;

    rerender(<PreviewHarness hovered id="hover-priority" source={source} />);

    expect(backgroundSignal.aborted).toBe(true);
    expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);
    expect(poolHarness.pool.request.mock.calls[1]?.[1]).toMatchObject({
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
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
    const first = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(emptyResult(false));

    const { rerender } = render(
      <PreviewHarness id="source" source={sourceForId("first")} />,
    );
    const firstSignal = poolHarness.pool.request.mock.calls[0]?.[1]
      ?.signal as AbortSignal;

    rerender(<PreviewHarness id="source" source={sourceForId("second")} />);

    expect(firstSignal.aborted).toBe(true);
    first.resolve(readyResult({ bytes: [9], nextStartTimeNs: 9n }));

    await waitFor(() => {
      expect(screen.getByTestId("preview-source").textContent).toBe(
        "empty:0:no-frame:",
      );
    });
    expect(poolHarness.pool.acquire).toHaveBeenCalledTimes(2);
    expect(poolHarness.pool.release).toHaveBeenCalledTimes(1);
  });

  it("surfaces initial load failures", async () => {
    poolHarness.pool.request.mockRejectedValueOnce(new Error("boom"));

    render(<PreviewHarness id="error" source={sourceForId("error")} />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-error").textContent).toBe(
        "error:0:no-frame:boom",
      );
    });
  });

  it("plays additional preview frames on hover", async () => {
    const latestState = { current: null as McapGridPreviewState | null };
    const hover = deferred<McapGridPreviewResult>();
    const nextRequest = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
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
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);
    });
    expect(poolHarness.pool.request.mock.calls[1]?.[0]).toMatchObject({
      source: sourceForId("hover"),
      startTimeNs: 1n,
    });
    expect(poolHarness.pool.request.mock.calls[1]?.[1]).toMatchObject({
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
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
      firstImageByte(
        getMcapSourceBootstrap(sourceForId("hover"))?.poster ?? null,
      ),
    ).toBe(9);

    act(() => {
      latestState.current?.pause();
    });
    expect(poolHarness.pool.release).toHaveBeenCalledTimes(1);
  });

  it("reports buffering only when a hover frame read stays pending", async () => {
    vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
    const latestState = { current: null as McapGridPreviewState | null };
    const hover = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
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
      vi.advanceTimersByTime(MCAP_GRID_BUFFERING_DELAY_MS - 1);
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
    const latestState = { current: null as McapGridPreviewState | null };
    const nextRequest = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
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
    const latestState = { current: null as McapGridPreviewState | null };
    const retry = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
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
    expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(82));
    expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(2));
    expect(poolHarness.pool.request).toHaveBeenCalledTimes(3);

    act(() => latestState.current?.pause());
  });

  it("reloads and sends the selected stream topic when it changes", async () => {
    poolHarness.pool.request
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], streamTopic: "/camera/front" }),
      )
      .mockResolvedValueOnce(
        readyResult({ bytes: [2], streamTopic: "/camera/back" }),
      );

    const { rerender } = render(
      <PreviewHarness
        id="selected"
        selectedStreamTopic="/camera/front"
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
        selectedStreamTopic="/camera/back"
        source={sourceForId("selected")}
      />,
    );

    await waitFor(() => {
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);
    });
    expect(poolHarness.pool.request.mock.calls[1]?.[0]).toMatchObject({
      selectedStreamTopic: "/camera/back",
      source: sourceForId("selected"),
    });
  });

  it("does not play while a selected stream reload is still loading", async () => {
    const latestState = { current: null as McapGridPreviewState | null };
    const reload = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], streamTopic: "/camera/front" }),
      )
      .mockReturnValueOnce(reload.promise);

    const { rerender } = render(
      <PreviewHarness
        id="reload-play"
        onState={(state) => {
          latestState.current = state;
        }}
        selectedStreamTopic="/camera/front"
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
          selectedStreamTopic="/camera/back"
          source={sourceForId("reload-play")}
        />,
      );
    });

    await waitFor(() => {
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);
    });
    await act(async () => undefined);
    expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);

    reload.resolve(readyResult({ bytes: [2], streamTopic: "/camera/back" }));
  });

  it("defers hidden cells and reuses their loaded frame on re-entry", async () => {
    poolHarness.pool.request.mockResolvedValueOnce(
      readyResult({ bytes: [7], nextStartTimeNs: 10n }),
    );
    const source = sourceForId("visibility");
    const { rerender } = render(
      <PreviewHarness enabled={false} id="visibility" source={source} />,
    );

    expect(poolHarness.pool.request).not.toHaveBeenCalled();

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

    expect(poolHarness.pool.request).toHaveBeenCalledTimes(1);
  });

  it("posters the still frame at an embeddings match", async () => {
    poolHarness.pool.request.mockResolvedValueOnce(
      readyResult({ bytes: [9], nextStartTimeNs: 1_700n }),
    );
    const source = sourceForId("poster-match");

    render(
      <PreviewHarness
        id="poster-match"
        posterStartTimeNs={1_500n}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-poster-match").textContent).toBe(
        "ready:1:frame:",
      );
    });
    expect(poolHarness.pool.request.mock.calls[0]?.[0]).toEqual({
      source,
      startTimeNs: 1_500n,
    });
  });

  it("re-posters when the match moves to another window", async () => {
    poolHarness.pool.request
      .mockResolvedValueOnce(readyResult({ bytes: [1] }))
      .mockResolvedValueOnce(readyResult({ bytes: [2] }));
    const source = sourceForId("poster-relasso");
    const { rerender } = render(
      <PreviewHarness
        id="poster-relasso"
        posterStartTimeNs={1_000n}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(1);
    });
    rerender(
      <PreviewHarness
        id="poster-relasso"
        posterStartTimeNs={2_000n}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);
    });
    expect(poolHarness.pool.request.mock.calls[1]?.[0]).toMatchObject({
      startTimeNs: 2_000n,
    });
  });

  it("restarts hover playback once a re-postered tile's replacement frame commits", async () => {
    const latestState = { current: null as McapGridPreviewState | null };
    const loopFetch = deferred<McapGridPreviewResult>();
    const replacementLoad = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
      // initial still-frame load at the first poster
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], nextStartTimeNs: 1_100n }),
      )
      // the hover loop's own fetch — left pending so the loop is still "in
      // flight" when the poster moves underneath it
      .mockReturnValueOnce(loopFetch.promise)
      // the replacement still-frame load once posterStartTimeNs moves
      .mockReturnValueOnce(replacementLoad.promise);
    const source = sourceForId("poster-hover-restart");

    const { rerender } = render(
      <PreviewHarness
        hovered
        id="poster-hover-restart"
        onState={(state) => {
          latestState.current = state;
        }}
        posterStartTimeNs={1_000n}
        source={source}
      />,
    );
    await waitFor(() => expect(latestState.current?.status).toBe("ready"));

    act(() => latestState.current?.play());
    await waitFor(() =>
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(2),
    );
    const releasesBeforeRepost = poolHarness.pool.release.mock.calls.length;
    const acquiresBeforeRepost = poolHarness.pool.acquire.mock.calls.length;

    rerender(
      <PreviewHarness
        hovered
        id="poster-hover-restart"
        onState={(state) => {
          latestState.current = state;
        }}
        posterStartTimeNs={5_000n}
        source={source}
      />,
    );
    await waitFor(() =>
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(3),
    );
    expect(poolHarness.pool.request.mock.calls[2]?.[0]).toMatchObject({
      startTimeNs: 5_000n,
    });
    // The stale loop must not tear down yet — only once the replacement
    // frame actually commits, so a poster move mid-loop doesn't flash a gap
    expect(poolHarness.pool.release.mock.calls.length).toBe(
      releasesBeforeRepost,
    );

    replacementLoad.resolve(
      readyResult({ bytes: [9], nextStartTimeNs: 5_100n }),
    );

    // The stale loop tears down and a fresh one starts against the new
    // poster's frame, rather than silently continuing to chain frames from
    // the old poster's timeline
    await waitFor(() =>
      expect(poolHarness.pool.release.mock.calls.length).toBe(
        releasesBeforeRepost + 1,
      ),
    );
    await waitFor(() =>
      expect(poolHarness.pool.acquire.mock.calls.length).toBe(
        acquiresBeforeRepost + 1,
      ),
    );
    await waitFor(() =>
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(4),
    );
    expect(poolHarness.pool.request.mock.calls[3]?.[0]).toMatchObject({
      startTimeNs: 5_100n,
    });
  });

  it("posters from the matched stream once it is known previewable", async () => {
    // The reported /camera/rear topic triggers a third request beyond the
    // two asserted below; leave it pending so the mock never returns undefined
    poolHarness.pool.request
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], streamTopic: "/camera/front" }),
      )
      .mockResolvedValueOnce(
        readyResult({ bytes: [2], streamTopic: "/camera/rear" }),
      )
      .mockReturnValue(deferred<McapGridPreviewResult>().promise);
    const source = sourceForId("poster-stream");

    render(
      <PreviewHarness
        id="poster-stream"
        posterStartTimeNs={500n}
        posterStreamTopic="/camera/front"
        source={source}
      />,
    );

    // The first request cannot name the stream — nothing has reported which
    // topics this source can preview yet.
    await waitFor(() => {
      expect(poolHarness.pool.request).toHaveBeenCalledTimes(2);
    });
    expect(poolHarness.pool.request.mock.calls[0]?.[0]).toEqual({
      source,
      startTimeNs: 500n,
    });
    expect(poolHarness.pool.request.mock.calls[1]?.[0]).toEqual({
      selectedStreamTopic: "/camera/front",
      source,
      startTimeNs: 500n,
    });
  });

  it("keeps the automatic stream when the match is not previewable", async () => {
    poolHarness.pool.request.mockResolvedValue(
      readyResult({ bytes: [1], streamTopic: "/camera/front" }),
    );
    const source = sourceForId("poster-fused");

    render(
      <PreviewHarness
        id="poster-fused"
        posterStartTimeNs={500n}
        posterStreamTopic="fused::cameras"
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-poster-fused").textContent).toBe(
        "ready:1:frame:",
      );
    });
    expect(poolHarness.pool.request).toHaveBeenCalledTimes(1);
    expect(poolHarness.pool.request.mock.calls[0]?.[0]).toEqual({
      source,
      startTimeNs: 500n,
    });
  });

  it("lets an explicit grid stream choice outrank the matched stream", async () => {
    poolHarness.pool.request.mockResolvedValue(
      readyResult({ bytes: [1], streamTopic: "/camera/rear" }),
    );
    const source = sourceForId("poster-explicit");

    render(
      <PreviewHarness
        id="poster-explicit"
        posterStartTimeNs={500n}
        posterStreamTopic="/camera/front"
        selectedStreamTopic="/camera/rear"
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-poster-explicit").textContent).toBe(
        "ready:1:frame:",
      );
    });
    expect(poolHarness.pool.request).toHaveBeenCalledTimes(1);
    expect(poolHarness.pool.request.mock.calls[0]?.[0]).toEqual({
      selectedStreamTopic: "/camera/rear",
      source,
      startTimeNs: 500n,
    });
  });
});

function PreviewHarness({
  enabled,
  hovered,
  id,
  onState,
  posterStartTimeNs,
  posterStreamTopic,
  selectedStreamTopic,
  source,
}: {
  readonly enabled?: boolean;
  readonly hovered?: boolean;
  readonly id: string;
  readonly onState?: (state: McapGridPreviewState) => void;
  readonly posterStartTimeNs?: bigint | null;
  readonly posterStreamTopic?: string | null;
  readonly selectedStreamTopic?: string | null;
  readonly source: ByteSourceDescriptor | null;
}) {
  const state = useMcapGridPreview({
    enabled,
    hovered,
    posterStartTimeNs,
    posterStreamTopic,
    selectedStreamTopic,
    source,
  });

  // This effect exposes each hook update to tests that inspect live state.
  useEffect(() => {
    onState?.(state);
  }, [onState, state]);

  return <div data-testid={`preview-${id}`}>{formatState(state)}</div>;
}

function formatState(state: McapGridPreviewState): string {
  return [
    state.status,
    state.hasPreviewTopics ? "1" : "0",
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
  streamTopic = "/camera/front",
}: {
  readonly bytes: readonly number[];
  readonly frameTimeNs?: bigint;
  readonly streamTopic?: string;
  readonly nextStartTimeNs?: bigint;
}): McapGridPreviewResult {
  return {
    frameTimeNs,
    nextStartTimeNs,
    state: {
      error: null,
      frame: {
        image: createImage(bytes),
        kind: "image",
      },
      hasPreviewTopics: true,
      streamTopic,
      streamTopics: [streamTopic],
      status: "ready",
    },
  };
}

function emptyResult(hasPreviewTopics: boolean): McapGridPreviewResult {
  return {
    state: {
      error: null,
      frame: null,
      hasPreviewTopics,
      streamTopic: hasPreviewTopics ? "/camera/front" : null,
      streamTopics: hasPreviewTopics ? ["/camera/front"] : [],
      status: "empty",
    },
  };
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
      url: `memory://${id}.mcap`,
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
