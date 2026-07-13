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
    poolHarness.pool.request
      .mockResolvedValueOnce(
        readyResult({ bytes: [1, 2, 3], nextStartTimeNs: 10n }),
      )
      .mockReturnValueOnce(hover.promise);

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
      startTimeNs: 10n,
    });
    expect(poolHarness.pool.request.mock.calls[1]?.[1]).toMatchObject({
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
    });

    hover.resolve(readyResult({ bytes: [9, 8, 7], nextStartTimeNs: 20n }));

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
});

function PreviewHarness({
  enabled,
  id,
  onState,
  selectedStreamTopic,
  source,
}: {
  readonly enabled?: boolean;
  readonly id: string;
  readonly onState?: (state: McapGridPreviewState) => void;
  readonly selectedStreamTopic?: string | null;
  readonly source: ByteSourceDescriptor | null;
}) {
  const state = useMcapGridPreview({ enabled, selectedStreamTopic, source });

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
