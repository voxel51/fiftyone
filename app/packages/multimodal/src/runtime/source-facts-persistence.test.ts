import { describe, expect, it } from "vitest";
import {
  createIndexedDbSourceFactsPersistence,
  selectSourceFactsEvictions,
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
