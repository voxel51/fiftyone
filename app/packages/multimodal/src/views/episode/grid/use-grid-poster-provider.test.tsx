import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerGridPosterProvider,
  type GridPosterProvider,
  type GridPosterProviderDescriptor,
} from "../../../extensions/grid-posters";
import { resetGridPosterProviderForTests } from "../../../extensions/grid-posters/registry";
import {
  getGridPosterCache,
  resetGridPosterCacheForTests,
  type GridPosterCacheEntry,
} from "./grid-poster-cache";
import {
  resetGridPosterPersistenceForTests,
  type GridPosterPersistence,
} from "./grid-poster-persistence";
import {
  useGridPosterProviderDescriptor,
  useProvidedGridPoster,
} from "./use-grid-poster-provider";

const load = vi.fn<(signal: AbortSignal) => Promise<Uint8Array>>();
const resolveDescriptor = vi.fn<GridPosterProvider["resolveDescriptor"]>();
const provider: GridPosterProvider = {
  id: "test:posters",
  resolveDescriptor,
};
const persistence: GridPosterPersistence = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
};

beforeEach(() => {
  load.mockReset();
  resolveDescriptor.mockReset();
  vi.mocked(persistence.get).mockClear();
  vi.mocked(persistence.put).mockClear();
  resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
  resetGridPosterPersistenceForTests(persistence);
  resetGridPosterProviderForTests();
  registerGridPosterProvider(provider);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetGridPosterPersistenceForTests();
  resetGridPosterProviderForTests();
});

describe("useGridPosterProviderDescriptor", () => {
  it("settles immediately when this product has no provider", () => {
    resetGridPosterProviderForTests();

    const { result } = renderHook(() =>
      useGridPosterProviderDescriptor("dataset", "sample", true),
    );

    expect(result.current).toEqual({ resolved: null, status: "miss" });
    expect(resolveDescriptor).not.toHaveBeenCalled();
  });

  it("resolves provider metadata", async () => {
    resolveDescriptor.mockResolvedValue(descriptor);

    const { result } = renderHook(() =>
      useGridPosterProviderDescriptor("dataset", "sample", true),
    );

    await waitFor(() => expect(result.current.status).toBe("hit"));
    expect(result.current.resolved).toEqual({ descriptor, provider });
  });

  it("times out and aborts a stalled descriptor lookup", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    resolveDescriptor.mockImplementation((_context, value) => {
      signal = value;
      return new Promise(() => undefined);
    });
    const { result } = renderHook(() =>
      useGridPosterProviderDescriptor("dataset", "sample", true),
    );

    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(result.current.status).toBe("miss");
    expect(signal?.aborted).toBe(true);
  });

  it("aborts the descriptor lookup on unmount", () => {
    let signal: AbortSignal | undefined;
    resolveDescriptor.mockImplementation((_context, value) => {
      signal = value;
      return new Promise(() => undefined);
    });
    const { unmount } = renderHook(() =>
      useGridPosterProviderDescriptor("dataset", "sample", true),
    );

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});

describe("useProvidedGridPoster", () => {
  it("rejects an artifact whose byte length does not match", async () => {
    load.mockResolvedValue(new Uint8Array([1]));

    const { result } = renderPosterHook();

    await waitFor(() => expect(result.current.status).toBe("miss"));
    expect(getGridPosterCache().peek("cache-key")).toBeNull();
    expect(persistence.put).not.toHaveBeenCalled();
  });

  it("retains a better captured poster without persisting the provided one", async () => {
    const captured = posterEntry({ height: 512, width: 512 });
    getGridPosterCache().put("cache-key", captured);
    load.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const { result } = renderPosterHook();

    await waitFor(() => expect(result.current.status).toBe("hit"));
    expect(result.current.entry).toEqual(captured);
    expect(getGridPosterCache().peek("cache-key")).toEqual(captured);
    expect(persistence.put).not.toHaveBeenCalled();
  });

  it("writes provider provenance to both poster tiers", async () => {
    load.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const { result } = renderPosterHook();

    await waitFor(() => expect(result.current.status).toBe("hit"));
    expect(getGridPosterCache().peek("cache-key")).toMatchObject({
      bytes: new Uint8Array([1, 2, 3]),
      provider: {
        artifactIdentity: "artifact",
        id: "test:posters",
        revision: "revision",
      },
    });
    expect(persistence.put).toHaveBeenCalledWith(
      "cache-key",
      expect.objectContaining({
        provider: expect.objectContaining({
          artifactIdentity: "artifact",
          revision: "revision",
        }),
      }),
    );
  });
});

function renderPosterHook() {
  return renderHook(() =>
    useProvidedGridPoster({
      cacheKey: "cache-key",
      cameraPose: null,
      enabled: true,
      posterStartTimeNs: null,
      resolved,
      selectedSourceName: null,
    }),
  );
}

const descriptor: GridPosterProviderDescriptor = {
  cacheRevision: "revision",
  select: () => ({
    byteLength: 3,
    height: 64,
    identity: "artifact",
    load,
    mediaKind: "image",
    mimeType: "image/webp",
    policyVersion: "image-grid-poster-v1",
    sourceKind: "image",
    streamId: "stream",
    streamSourceName: "/camera",
    streamSourceNames: ["/camera"],
    variant: "frame",
    width: 64,
  }),
};
const resolved = { descriptor, provider };

function posterEntry(
  overrides: Partial<GridPosterCacheEntry> = {},
): GridPosterCacheEntry {
  return {
    bytes: new Uint8Array([4, 5, 6]),
    height: 64,
    mimeType: "image/webp",
    sourceKind: "image",
    streamId: "stream",
    streamSourceName: "/camera",
    streamSourceNames: ["/camera"],
    width: 64,
    ...overrides,
  };
}
