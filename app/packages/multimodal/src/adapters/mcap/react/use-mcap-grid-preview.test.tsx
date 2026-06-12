import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncodedImageVisualization } from "../../../decoders";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapGridPreviewResult } from "../grid-preview";
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
      readyResult({ bytes: [1, 2, 3], nextStartTimeNs: 5n })
    );

    const { unmount } = render(
      <PreviewHarness id="initial" source={sourceForId("initial")} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-initial").textContent).toBe(
        "ready:1:frame:"
      );
    });

    expect(poolHarness.pool.acquire).toHaveBeenCalledTimes(1);
    expect(poolHarness.pool.request).toHaveBeenCalledWith(
      { source: sourceForId("initial") },
      { signal: expect.any(AbortSignal) }
    );

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
      <PreviewHarness id="source" source={sourceForId("first")} />
    );
    const firstSignal = poolHarness.pool.request.mock.calls[0]?.[1]
      ?.signal as AbortSignal;

    rerender(<PreviewHarness id="source" source={sourceForId("second")} />);

    expect(firstSignal.aborted).toBe(true);
    first.resolve(readyResult({ bytes: [9], nextStartTimeNs: 9n }));

    await waitFor(() => {
      expect(screen.getByTestId("preview-source").textContent).toBe(
        "empty:0:no-frame:"
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
        "error:0:no-frame:boom"
      );
    });
  });

  it("plays additional preview frames on hover", async () => {
    const latestState = { current: null as McapGridPreviewState | null };
    const hover = deferred<McapGridPreviewResult>();
    poolHarness.pool.request
      .mockResolvedValueOnce(
        readyResult({ bytes: [1, 2, 3], nextStartTimeNs: 10n })
      )
      .mockReturnValueOnce(hover.promise);

    render(
      <PreviewHarness
        id="hover"
        onState={(state) => {
          latestState.current = state;
        }}
        source={sourceForId("hover")}
      />
    );

    await waitFor(() => {
      expect(latestState.current?.status).toBe("ready");
    });
    expect(latestState.current?.frame?.image.bytes[0]).toBe(1);

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

    hover.resolve(readyResult({ bytes: [9, 8, 7], nextStartTimeNs: 20n }));

    await waitFor(() => {
      expect(latestState.current?.frame?.image.bytes[0]).toBe(9);
    });

    act(() => {
      latestState.current?.pause();
    });
    expect(poolHarness.pool.release).not.toHaveBeenCalled();
  });
});

function PreviewHarness({
  id,
  onState,
  source,
}: {
  readonly id: string;
  readonly onState?: (state: McapGridPreviewState) => void;
  readonly source: ByteSourceDescriptor | null;
}) {
  const state = useMcapGridPreview({ source });

  useEffect(() => {
    onState?.(state);
  }, [onState, state]);

  return <div data-testid={`preview-${id}`}>{formatState(state)}</div>;
}

function formatState(state: McapGridPreviewState): string {
  return [
    state.status,
    state.hasImageTopics ? "1" : "0",
    state.frame ? "frame" : "no-frame",
    state.error ?? "",
  ].join(":");
}

function readyResult({
  bytes,
  nextStartTimeNs,
}: {
  readonly bytes: readonly number[];
  readonly nextStartTimeNs: bigint;
}): McapGridPreviewResult {
  return {
    delayMs: 83,
    nextStartTimeNs,
    state: {
      error: null,
      frame: {
        annotations: null,
        image: createImage(bytes),
      },
      hasImageTopics: true,
      imageTopic: "/camera/front",
      status: "ready",
    },
  };
}

function emptyResult(hasImageTopics: boolean): McapGridPreviewResult {
  return {
    state: {
      error: null,
      frame: null,
      hasImageTopics,
      imageTopic: hasImageTopics ? "/camera/front" : null,
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
