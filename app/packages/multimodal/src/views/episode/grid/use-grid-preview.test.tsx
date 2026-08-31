import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ByteSourceDescriptor,
  type EncodedImageVisualization,
  type EpisodePosterFrame,
  type EpisodePreviewNativeVideo,
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
import type { GridPosterCacheEntry } from "./grid-poster-cache";

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

  it("seeds a cached poster synchronously and never reads without session demand", () => {
    const latest = { current: null as GridPreviewState | null };
    const source = sourceForId("cached");
    const { rerender } = render(
      <PreviewHarness
        cacheRequestKey="cached-key"
        cachedPoster={cachedPoster()}
        id="cached"
        onState={(state) => {
          latest.current = state;
        }}
        previewSession={null}
        source={source}
      />,
    );

    expect(latest.current?.cachedPoster?.bytes[0]).toBe(7);
    expect(latest.current?.status).toBe("ready");
    expect(sessionHarness.session.read).not.toHaveBeenCalled();

    rerender(
      <PreviewHarness
        cacheRequestKey="other-key"
        cachedPoster={null}
        id="cached"
        onState={(state) => {
          latest.current = state;
        }}
        previewSession={null}
        source={sourceForId("other")}
      />,
    );
    expect(latest.current?.cachedPoster).toBeNull();
    expect(latest.current?.status).toBe("loading");
  });

  it("adopts a same-key poster that hydrates after mount", async () => {
    const latest = { current: null as GridPreviewState | null };
    const source = sourceForId("persisted");
    const renderState = (poster: GridPosterCacheEntry | null) => (
      <PreviewHarness
        cacheRequestKey="persisted-key"
        cachedPoster={poster}
        id="persisted"
        onState={(state) => {
          latest.current = state;
        }}
        previewSession={null}
        source={source}
      />
    );
    const { rerender } = render(renderState(null));
    expect(latest.current?.status).toBe("loading");

    rerender(renderState(cachedPoster()));

    await waitFor(() => expect(latest.current?.status).toBe("ready"));
    expect(latest.current?.cachedPoster?.bytes[0]).toBe(7);
    expect(latest.current?.streamSourceNames).toEqual(["/camera/cached"]);
    expect(sessionHarness.session.read).not.toHaveBeenCalled();
  });

  it("preserves a cached poster when the preview session fails", async () => {
    const latest = { current: null as GridPreviewState | null };
    render(
      <PreviewHarness
        cacheRequestKey="cached-error"
        cachedPoster={cachedPoster()}
        id="cached-error"
        onState={(state) => {
          latest.current = state;
        }}
        previewSession={null}
        previewSessionStatus="error"
        source={sourceForId("cached-error")}
      />,
    );

    await waitFor(() =>
      expect(latest.current?.error).toBe("Episode preview failed to open"),
    );
    expect(latest.current?.cachedPoster?.bytes[0]).toBe(7);
    expect(latest.current?.status).toBe("ready");
  });

  it("does not reset a live preview when same-key poster identity changes", async () => {
    sessionHarness.session.read.mockResolvedValue(
      readyResult({ bytes: [1, 2, 3] }),
    );
    const source = sourceForId("same-key-poster");
    const { rerender } = render(
      <PreviewHarness
        cacheRequestKey="same-key"
        cachedPoster={cachedPoster()}
        id="same-key-poster"
        source={source}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("preview-same-key-poster").textContent).toBe(
        "ready:1:frame:",
      ),
    );

    rerender(
      <PreviewHarness
        cacheRequestKey="same-key"
        cachedPoster={{ ...cachedPoster(), bytes: new Uint8Array([9]) }}
        id="same-key-poster"
        source={source}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(sessionHarness.session.read).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("preview-same-key-poster").textContent).toBe(
      "ready:1:frame:",
    );
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

  it("delegates native hover playback without starting a frame-read loop", async () => {
    const latest = { current: null as GridPreviewState | null };
    const video = nativeVideo();
    sessionHarness.session.read.mockResolvedValueOnce(
      readyResult({ bytes: [1, 2, 3], nativeVideo: video }),
    );
    const source = sourceForId("native-hover");
    const { rerender } = render(
      <PreviewHarness
        enabled
        id="native-hover"
        onState={(state) => {
          latest.current = state;
        }}
        source={source}
      />,
    );
    await waitFor(() => expect(latest.current?.nativeVideo).toBe(video));

    act(() => latest.current?.play());
    await waitFor(() => expect(latest.current?.isPlaying).toBe(true));
    expect(sessionHarness.session.read).toHaveBeenCalledOnce();

    rerender(
      <PreviewHarness
        enabled={false}
        id="native-hover"
        onState={(state) => {
          latest.current = state;
        }}
        source={source}
      />,
    );
    await waitFor(() => expect(latest.current?.isPlaying).toBe(false));
    expect(sessionHarness.session.read).toHaveBeenCalledOnce();
  });

  it("cancels pending demand and starts no replacement while the grid is inactive", async () => {
    const pending = deferred<EpisodePreviewReadResult>();
    const onReadResult = vi.fn();
    sessionHarness.session.read.mockReturnValueOnce(pending.promise);
    const source = sourceForId("modal-activation");
    const { rerender } = render(
      <PreviewHarness
        enabled
        id="modal-activation"
        onReadResult={onReadResult}
        source={source}
      />,
    );
    await waitFor(() =>
      expect(sessionHarness.session.read).toHaveBeenCalledOnce(),
    );
    const signal = sessionHarness.session.read.mock.calls[0]?.[1]
      ?.signal as AbortSignal;

    // Opening the modal marks every grid renderer inactive. Its outstanding
    // demand must be preempted, and prop churn from the retained grid must not
    // start replacement work behind the modal's current-frame reads.
    rerender(
      <PreviewHarness
        enabled={false}
        hovered
        id="modal-activation"
        onReadResult={onReadResult}
        selectedSourceName="/camera/rear"
        source={source}
      />,
    );

    expect(signal.aborted).toBe(true);
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(1);

    pending.resolve(readyResult({ bytes: [9] }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onReadResult).not.toHaveBeenCalled();
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(1);
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
    });
    expect(onReadResult).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(84));

    expect(onReadResult).toHaveBeenCalledTimes(4);
    expect(firstImageByte(latestState.current?.frame ?? null)).toBe(2);
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

  it("flushes the final source frame before wrapping", async () => {
    vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
    const latestState = { current: null as GridPreviewState | null };
    const pending = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read.mockResolvedValueOnce(
      readyResult({ bytes: [0], frameTimeNs: 0n, nextStartTimeNs: 1n }),
    );
    for (let frame = 1; frame <= 7; frame += 1) {
      sessionHarness.session.read.mockResolvedValueOnce(
        readyResult({
          bytes: [frame],
          frameTimeNs: BigInt(frame) * 70_000_000n,
          nextStartTimeNs: BigInt(frame) * 70_000_000n + 1n,
        }),
      );
    }
    sessionHarness.session.read
      .mockResolvedValueOnce(emptyResult(true))
      .mockReturnValue(pending.promise);

    render(
      <PreviewHarness
        id="full-source"
        onState={(state) => {
          latestState.current = state;
        }}
        source={sourceForId("full-source")}
      />,
    );
    await act(async () => undefined);
    act(() => latestState.current?.play());
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(sessionHarness.session.read).toHaveBeenCalledTimes(10);
    expect(firstImageByte(latestState.current?.frame ?? null)).toBe(7);
    expect(sessionHarness.session.read.mock.calls[8]?.[0]).toMatchObject({
      startTimeNs: 490_000_001n,
    });
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

  it("posters the still frame at an embeddings match", async () => {
    sessionHarness.session.read.mockResolvedValueOnce(
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
    expect(sessionHarness.session.read.mock.calls[0]?.[0]).toEqual({
      startTimeNs: 1_500n,
    });
  });

  it("re-posters when the match moves to another window", async () => {
    sessionHarness.session.read
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
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(1);
    });
    rerender(
      <PreviewHarness
        id="poster-relasso"
        posterStartTimeNs={2_000n}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);
    });
    expect(sessionHarness.session.read.mock.calls[1]?.[0]).toMatchObject({
      startTimeNs: 2_000n,
    });
  });

  it("restarts hover playback once a re-postered tile's replacement frame commits", async () => {
    const latestState = { current: null as GridPreviewState | null };
    const loopFetch = deferred<EpisodePreviewReadResult>();
    const replacementLoad = deferred<EpisodePreviewReadResult>();
    sessionHarness.session.read
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
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(2),
    );

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
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(3),
    );
    expect(sessionHarness.session.read.mock.calls[2]?.[0]).toMatchObject({
      startTimeNs: 5_000n,
    });

    replacementLoad.resolve(
      readyResult({ bytes: [9], nextStartTimeNs: 5_100n }),
    );

    // The stale loop tears down and a fresh one starts against the new
    // poster's frame, rather than silently continuing to chain frames from
    // the old poster's timeline
    await waitFor(() =>
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(4),
    );
    expect(sessionHarness.session.read.mock.calls[3]?.[0]).toMatchObject({
      startTimeNs: 5_100n,
    });
  });

  it("posters from the matched stream once it is known previewable", async () => {
    // The reported /camera/rear source triggers a third request beyond the
    // two asserted below; leave it pending so the mock never returns undefined
    sessionHarness.session.read
      .mockResolvedValueOnce(
        readyResult({ bytes: [1], streamId: "/camera/front" }),
      )
      .mockResolvedValueOnce(
        readyResult({ bytes: [2], streamId: "/camera/rear" }),
      )
      .mockReturnValue(deferred<EpisodePreviewReadResult>().promise);
    const source = sourceForId("poster-stream");

    render(
      <PreviewHarness
        id="poster-stream"
        posterStartTimeNs={500n}
        posterSourceName="/camera/front"
        source={source}
      />,
    );

    // The first request cannot name the stream — nothing has reported which
    // sources this episode can preview yet.
    await waitFor(() => {
      expect(sessionHarness.session.read).toHaveBeenCalledTimes(2);
    });
    expect(sessionHarness.session.read.mock.calls[0]?.[0]).toEqual({
      startTimeNs: 500n,
    });
    expect(sessionHarness.session.read.mock.calls[1]?.[0]).toEqual({
      sourceName: "/camera/front",
      startTimeNs: 500n,
    });
  });

  it("keeps the automatic stream when the match is not previewable", async () => {
    sessionHarness.session.read.mockResolvedValue(
      readyResult({ bytes: [1], streamId: "/camera/front" }),
    );
    const source = sourceForId("poster-fused");

    render(
      <PreviewHarness
        id="poster-fused"
        posterStartTimeNs={500n}
        posterSourceName="fused::cameras"
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-poster-fused").textContent).toBe(
        "ready:1:frame:",
      );
    });
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(1);
    expect(sessionHarness.session.read.mock.calls[0]?.[0]).toEqual({
      startTimeNs: 500n,
    });
  });

  it("lets an explicit grid stream choice outrank the matched stream", async () => {
    sessionHarness.session.read.mockResolvedValue(
      readyResult({ bytes: [1], streamId: "/camera/rear" }),
    );
    const source = sourceForId("poster-explicit");

    render(
      <PreviewHarness
        id="poster-explicit"
        posterStartTimeNs={500n}
        posterSourceName="/camera/front"
        selectedSourceName="/camera/rear"
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-poster-explicit").textContent).toBe(
        "ready:1:frame:",
      );
    });
    expect(sessionHarness.session.read).toHaveBeenCalledTimes(1);
    expect(sessionHarness.session.read.mock.calls[0]?.[0]).toEqual({
      sourceName: "/camera/rear",
      startTimeNs: 500n,
    });
  });
});

function PreviewHarness({
  cacheRequestKey,
  cachedPoster,
  enabled,
  hovered,
  id,
  onReadResult,
  onState,
  posterStartTimeNs,
  posterSourceName,
  previewSession,
  previewSessionStatus,
  selectedSourceName,
  source,
}: {
  readonly cacheRequestKey?: string | null;
  readonly cachedPoster?: GridPosterCacheEntry | null;
  readonly enabled?: boolean;
  readonly hovered?: boolean;
  readonly id: string;
  readonly onReadResult?: (result: EpisodePreviewReadResult) => void;
  readonly onState?: (state: GridPreviewState) => void;
  readonly posterStartTimeNs?: bigint | null;
  readonly posterSourceName?: string | null;
  readonly previewSession?: EpisodePreviewSession | null;
  readonly previewSessionStatus?:
    | "error"
    | "idle"
    | "loading"
    | "ready"
    | "unavailable";
  readonly selectedSourceName?: string | null;
  readonly source: ByteSourceDescriptor | null;
}) {
  const state = useGridPreview({
    cacheRequestKey,
    cachedPoster,
    enabled,
    hovered,
    onReadResult,
    posterStartTimeNs,
    posterSourceName,
    previewSession:
      previewSession === undefined
        ? (sessionHarness.session as EpisodePreviewSession)
        : previewSession,
    previewSessionStatus:
      previewSessionStatus ?? (previewSession === null ? "idle" : "ready"),
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
  nativeVideo,
  nextStartTimeNs = 5n,
  frameTimeNs = nextStartTimeNs === undefined
    ? undefined
    : nextStartTimeNs - 1n,
  streamId = "/camera/front",
}: {
  readonly bytes: readonly number[];
  readonly frameTimeNs?: bigint;
  readonly nativeVideo?: EpisodePreviewNativeVideo;
  readonly streamId?: string;
  readonly nextStartTimeNs?: bigint;
}): EpisodePreviewReadResult {
  return {
    frame: {
      image: createImage(bytes),
      kind: "image",
    },
    frameTimeNs,
    ...(nativeVideo ? { nativeVideo } : {}),
    nextStartTimeNs,
    streamId,
    streamSourceName: streamId,
    streamSourceNames: [streamId],
    status: "ready",
  };
}

function nativeVideo(): EpisodePreviewNativeVideo {
  return {
    codec: "h264",
    codecString: "avc1.64000a",
    endTimeSeconds: 37.5,
    source: { sourceId: "video", url: "/asset/video.mp4" },
    startTimeSeconds: 14.2,
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

function cachedPoster(): GridPosterCacheEntry {
  return {
    bytes: new Uint8Array([7, 8]),
    height: 100,
    mimeType: "image/webp",
    sourceKind: "image",
    streamId: "cached-stream",
    streamSourceName: "/camera/cached",
    streamSourceNames: ["/camera/cached"],
    width: 100,
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
