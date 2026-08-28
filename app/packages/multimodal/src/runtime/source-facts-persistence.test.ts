import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  SOURCE_FACTS_SCHEMA_VERSION,
  type StoredSourceFactsV1,
} from "./source-facts";
import { requestResult, transactionDone } from "./persistence/indexeddb";
import {
  createIndexedDbSourceFactsPersistence,
  selectSourceFactsEvictions,
  SOURCE_FACTS_DATABASE_NAME,
} from "./source-facts-persistence";

describe("source facts persistence", () => {
  it("degrades unsupported IndexedDB to a miss", async () => {
    const persistence = createIndexedDbSourceFactsPersistence({
      factory: null,
    });

    await expect(persistence.get("missing")).resolves.toBeNull();
    await expect(persistence.delete("missing")).resolves.toBeUndefined();
    await expect(persistence.clear()).resolves.toBeUndefined();
  });

  it("resolves the default IndexedDB factory when storage first opens", async () => {
    const persistence = createIndexedDbSourceFactsPersistence();
    const factory = new IDBFactory();
    vi.stubGlobal("indexedDB", factory);
    try {
      const entry = storedEntry(1);

      await expect(persistence.put("source", entry)).resolves.toMatchObject({
        stored: true,
      });
      await expect(persistence.get("source")).resolves.toEqual(entry);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("conditionally deletes entries and recency in one IndexedDB transaction", async () => {
    const factory = new IDBFactory();
    const persistence = createIndexedDbSourceFactsPersistence({ factory });
    const entry = storedEntry(10);
    await persistence.put("source", entry);

    await persistence.delete("source", 9);
    await expect(storeCounts(factory)).resolves.toEqual({
      entries: 1,
      recency: 1,
    });

    await persistence.delete("source", entry.createdAt);
    await expect(storeCounts(factory)).resolves.toEqual({
      entries: 0,
      recency: 0,
    });
  });

  it("evicts oldest entries under count and byte budgets", () => {
    const recency = [
      { byteLength: 40, key: "oldest", lastAccessedAt: 1 },
      { byteLength: 40, key: "middle", lastAccessedAt: 2 },
      { byteLength: 40, key: "newest", lastAccessedAt: 3 },
    ];

    expect(selectSourceFactsEvictions(recency, 2, 1_000)).toEqual(["oldest"]);
    expect(selectSourceFactsEvictions(recency, 10, 50)).toEqual([
      "oldest",
      "middle",
    ]);
  });

  it("accounts for replacement metadata once per logical key", () => {
    const replaced = [
      { byteLength: 90, key: "same", lastAccessedAt: 2 },
      { byteLength: 20, key: "other", lastAccessedAt: 1 },
    ];

    expect(selectSourceFactsEvictions(replaced, 2, 100)).toEqual(["other"]);
  });
});

function storedEntry(createdAt: number): StoredSourceFactsV1 {
  return {
    adapterId: "mcap",
    createdAt,
    facts: { timeRange: { endNs: 1n, startNs: 0n } },
    identity: { canonicalLocator: "/run.mcap", sourceId: "sample" },
    scope: {
      cachePartition: "partition",
      datasetId: "dataset",
      mediaField: "filepath",
    },
    version: SOURCE_FACTS_SCHEMA_VERSION,
  };
}

async function storeCounts(factory: IDBFactory): Promise<{
  readonly entries: number;
  readonly recency: number;
}> {
  const database = await requestResult(
    factory.open(SOURCE_FACTS_DATABASE_NAME),
  );
  const transaction = database.transaction(["entries", "recency"], "readonly");
  const completed = transactionDone(transaction);
  const [entries, recency] = await Promise.all([
    requestResult(transaction.objectStore("entries").count()),
    requestResult(transaction.objectStore("recency").count()),
  ]);
  await completed;
  database.close();
  return { entries, recency };
}
