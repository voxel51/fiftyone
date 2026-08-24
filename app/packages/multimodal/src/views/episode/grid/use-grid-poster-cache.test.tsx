import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getGridPosterCache,
  resetGridPosterCacheForTests,
  type GridPosterCacheEntry,
} from "./grid-poster-cache";
import {
  resetGridPosterPersistenceForTests,
  type GridPosterPersistence,
} from "./grid-poster-persistence";
import { useGridPosterCache } from "./use-grid-poster-cache";

afterEach(() => {
  cleanup();
  resetGridPosterCacheForTests();
  resetGridPosterPersistenceForTests();
});

describe("useGridPosterCache", () => {
  it("returns memory hits synchronously without reading IndexedDB", () => {
    const persistence = persistenceHarness();
    resetGridPosterPersistenceForTests(persistence);
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    getGridPosterCache().put("cached", entry([1]));

    const { result } = renderHook(() => useGridPosterCache("cached", true));

    expect(result.current).toMatchObject({ status: "hit" });
    expect(result.current.entry?.bytes[0]).toBe(1);
    expect(persistence.get).not.toHaveBeenCalled();
  });

  it("falls back to persistence when a visible memory hit is evicted", async () => {
    const persistence = persistenceHarness();
    resetGridPosterPersistenceForTests(persistence);
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    getGridPosterCache().put("evicted", entry([1]));

    const { rerender, result } = renderHook(() =>
      useGridPosterCache("evicted", true),
    );
    expect(result.current.status).toBe("hit");

    getGridPosterCache().clear();
    rerender();

    await waitFor(() => expect(result.current.status).toBe("miss"));
    expect(persistence.get).toHaveBeenCalledWith("evicted");
  });

  it("hydrates visible misses and promotes the poster into memory", async () => {
    const read = deferred<GridPosterCacheEntry | null>();
    const persistence = persistenceHarness();
    vi.mocked(persistence.get).mockReturnValue(read.promise);
    resetGridPosterPersistenceForTests(persistence);
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });

    const { result } = renderHook(() => useGridPosterCache("disk", true));
    expect(result.current).toEqual({ entry: null, status: "loading" });

    act(() => read.resolve(entry([7, 8])));
    await waitFor(() => expect(result.current.status).toBe("hit"));

    expect(result.current.entry?.bytes).toEqual(new Uint8Array([7, 8]));
    expect(getGridPosterCache().peek("disk")?.bytes).toEqual(
      new Uint8Array([7, 8]),
    );
  });

  it("does not read persistent storage until the cell is visible", async () => {
    const persistence = persistenceHarness();
    vi.mocked(persistence.get).mockResolvedValue(null);
    resetGridPosterPersistenceForTests(persistence);

    const { rerender, result } = renderHook(
      ({ visible }) => useGridPosterCache("lazy", visible),
      { initialProps: { visible: false } },
    );
    expect(result.current.status).toBe("idle");
    expect(persistence.get).not.toHaveBeenCalled();

    rerender({ visible: true });
    await waitFor(() => expect(result.current.status).toBe("miss"));
    expect(persistence.get).toHaveBeenCalledWith("lazy");
  });

  it("ignores a persistent result after the requested key changes", async () => {
    const oldRead = deferred<GridPosterCacheEntry | null>();
    const persistence = persistenceHarness();
    vi.mocked(persistence.get).mockImplementation((key) =>
      key === "old" ? oldRead.promise : Promise.resolve(null),
    );
    resetGridPosterPersistenceForTests(persistence);

    const { rerender, result } = renderHook(
      ({ cacheKey }) => useGridPosterCache(cacheKey, true),
      { initialProps: { cacheKey: "old" } },
    );
    rerender({ cacheKey: "new" });
    act(() => oldRead.resolve(entry([9])));

    await waitFor(() => expect(result.current.status).toBe("miss"));
    expect(result.current.entry).toBeNull();
    expect(getGridPosterCache().peek("old")).toBeNull();
  });
});

function persistenceHarness(): GridPosterPersistence {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

function entry(bytes: readonly number[]): GridPosterCacheEntry {
  return {
    bytes: new Uint8Array(bytes),
    height: 20,
    mimeType: "image/webp",
    sourceKind: "image",
    streamId: "stream-id",
    streamSourceName: "/camera",
    streamSourceNames: ["/camera"],
    width: 30,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
