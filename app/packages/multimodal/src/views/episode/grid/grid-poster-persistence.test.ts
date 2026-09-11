// @vitest-environment node

import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestResult,
  transactionDone,
} from "../../../runtime/persistence/indexeddb";
import type { GridPosterCacheEntry } from "./grid-poster-cache";
import {
  createIndexedDbGridPosterPersistence,
  GRID_POSTER_DATABASE_NAME,
} from "./grid-poster-persistence";

afterEach(() => vi.restoreAllMocks());

describe("grid poster persistence", () => {
  it("round-trips encoded posters through IndexedDB", async () => {
    const persistence = createIndexedDbGridPosterPersistence({
      factory: new IDBFactory(),
    });
    const entry = poster([1, 2, 3]);

    await persistence.put("poster", entry);

    await expect(persistence.get("poster")).resolves.toEqual(entry);
  });

  it("evicts the oldest poster under the configured entry budget", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(3).mockReturnValueOnce(1).mockReturnValueOnce(2);
    const persistence = createIndexedDbGridPosterPersistence({
      factory: new IDBFactory(),
      maxEntries: 1,
      maxSizeBytes: 1_000,
    });
    const newest = poster([2]);

    await persistence.put("a-oldest", poster([1]));
    await persistence.put("b-newest", newest);

    await expect(persistence.get("a-oldest")).resolves.toBeNull();
    await expect(persistence.get("b-newest")).resolves.toEqual(newest);
  });

  it("evicts the oldest poster under the configured byte budget", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(3).mockReturnValueOnce(1).mockReturnValueOnce(2);
    const persistence = createIndexedDbGridPosterPersistence({
      factory: new IDBFactory(),
      maxEntries: 10,
      maxSizeBytes: 2,
    });
    const newest = poster([3]);

    await persistence.put("a-oldest", poster([1, 2]));
    await persistence.put("b-newest", newest);

    await expect(persistence.get("a-oldest")).resolves.toBeNull();
    await expect(persistence.get("b-newest")).resolves.toEqual(newest);
  });

  it("accounts for replacement bytes without evicting valid posters", async () => {
    const factory = new IDBFactory();
    const persistence = createIndexedDbGridPosterPersistence({
      factory,
      maxEntries: 2,
      maxSizeBytes: 3,
    });
    const replacement = poster([4]);
    const second = poster([5, 6]);

    await persistence.put("replacement", poster([1, 2, 3]));
    await persistence.put("replacement", replacement);
    await persistence.put("second", second);

    await expect(persistence.get("replacement")).resolves.toEqual(replacement);
    await expect(persistence.get("second")).resolves.toEqual(second);
  });

  it("deletes a corrupt poster discovered during a read", async () => {
    const factory = new IDBFactory();
    const persistence = createIndexedDbGridPosterPersistence({ factory });
    await persistence.put("seed", poster([1]));
    const database = await requestResult<IDBDatabase>(
      factory.open(GRID_POSTER_DATABASE_NAME),
    );
    const corruptWrite = database.transaction("entries", "readwrite");
    const corruptWritten = transactionDone(corruptWrite);
    corruptWrite.objectStore("entries").put(
      {
        bytes: new Blob(),
        version: 1,
      },
      "corrupt",
    );
    await corruptWritten;

    await expect(persistence.get("corrupt")).resolves.toBeNull();
    const check = database.transaction("entries", "readonly");
    const checked = transactionDone(check);
    await expect(
      requestResult(check.objectStore("entries").get("corrupt")),
    ).resolves.toBeUndefined();
    await checked;
    database.close();
  });
});

function poster(bytes: readonly number[]): GridPosterCacheEntry {
  return {
    bytes: new Uint8Array(bytes),
    height: 10,
    mimeType: "image/webp",
    sourceKind: "image",
    streamId: "camera",
    streamSourceName: "/camera",
    streamSourceNames: ["/camera"],
    width: 10,
  };
}
