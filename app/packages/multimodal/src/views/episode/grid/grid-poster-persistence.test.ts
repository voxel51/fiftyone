import { afterEach, describe, expect, it, vi } from "vitest";

import type { GridPosterCacheEntry } from "./grid-poster-cache";
import {
  getGridPosterPersistence,
  resetGridPosterPersistenceForTests,
} from "./grid-poster-persistence";

const MIB = 1024 * 1024;

afterEach(() => {
  vi.unstubAllGlobals();
  resetGridPosterPersistenceForTests();
});

describe("grid poster persistence", () => {
  it("accepts entries through the 512 MiB persistent cache limit", async () => {
    const open = stubUnavailableIndexedDb();
    resetGridPosterPersistenceForTests();

    await getGridPosterPersistence().put(
      "at-limit",
      entryWithReportedByteLength(512 * MIB),
    );

    expect(open).toHaveBeenCalledOnce();
  });

  it("rejects entries larger than the 512 MiB persistent cache limit", async () => {
    const open = stubUnavailableIndexedDb();
    resetGridPosterPersistenceForTests();

    await getGridPosterPersistence().put(
      "over-limit",
      entryWithReportedByteLength(512 * MIB + 1),
    );

    expect(open).not.toHaveBeenCalled();
  });
});

function stubUnavailableIndexedDb() {
  const open = vi.fn(() => {
    throw new Error("unavailable");
  });
  vi.stubGlobal("indexedDB", { open });
  return open;
}

function entryWithReportedByteLength(
  reportedByteLength: number,
): GridPosterCacheEntry {
  const bytes = new Uint8Array([1]);
  // Exercise the admission boundary without allocating a 512 MiB fixture.
  Object.defineProperty(bytes, "byteLength", { value: reportedByteLength });
  return {
    bytes,
    height: 20,
    mimeType: "image/webp",
    sourceKind: "image",
    streamId: "stream-id",
    streamSourceName: "/camera",
    streamSourceNames: ["/camera"],
    width: 30,
  };
}
