import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIndexedDbConnection,
  requestResult,
  transactionDone,
} from "./indexeddb";

afterEach(() => vi.unstubAllGlobals());

describe("IndexedDB runtime persistence", () => {
  it("retries unavailable factories and memoizes a successful open", async () => {
    let factory: IDBFactory | null = null;
    const resolveFactory = vi.fn(() => factory);
    const upgrade = vi.fn((database: IDBDatabase) => {
      database.createObjectStore("entries");
    });
    const connection = createIndexedDbConnection({
      name: "retryable",
      resolveFactory,
      upgrade,
      version: 1,
    });

    await expect(connection.open()).resolves.toBeNull();
    factory = new IDBFactory();
    const first = connection.open();
    const second = connection.open();

    expect(second).toBe(first);
    await expect(first).resolves.not.toBeNull();
    expect(resolveFactory).toHaveBeenCalledTimes(2);
    expect(upgrade).toHaveBeenCalledOnce();
  });

  it("resolves the default factory lazily and reopens after invalidation", async () => {
    const upgrade = vi.fn((database: IDBDatabase) => {
      database.createObjectStore("entries");
    });
    const connection = createIndexedDbConnection({
      name: "lazy-global",
      upgrade,
      version: 1,
    });
    vi.stubGlobal("indexedDB", new IDBFactory());

    const first = await connection.open();
    if (!first) throw new Error("Expected IndexedDB to open");
    first.onversionchange?.(
      new Event("versionchange") as IDBVersionChangeEvent,
    );
    const second = await connection.open();

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(upgrade).toHaveBeenCalledOnce();
  });

  it("reopens after the browser closes a connection", async () => {
    const factory = new IDBFactory();
    const connection = createIndexedDbConnection({
      name: "browser-close",
      resolveFactory: () => factory,
      upgrade: (database) => database.createObjectStore("entries"),
      version: 1,
    });

    const first = await connection.open();
    if (!first) throw new Error("Expected IndexedDB to open");
    first.close();
    first.onclose?.(new Event("close"));
    const second = await connection.open();

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it("degrades synchronous open failures to retryable misses", async () => {
    const open = vi.fn(() => {
      throw new Error("storage disabled");
    });
    const connection = createIndexedDbConnection({
      name: "throwing-open",
      resolveFactory: () => ({ open }) as unknown as IDBFactory,
      upgrade: vi.fn(),
      version: 1,
    });

    await expect(connection.open()).resolves.toBeNull();
    await expect(connection.open()).resolves.toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("adapts successful and failed requests and transactions", async () => {
    const factory = new IDBFactory();
    const connection = createIndexedDbConnection({
      name: "adapters",
      resolveFactory: () => factory,
      upgrade: (database) => database.createObjectStore("entries"),
      version: 1,
    });
    const database = await connection.open();
    if (!database) throw new Error("Expected IndexedDB to open");

    const write = database.transaction("entries", "readwrite");
    const written = transactionDone(write);
    write.objectStore("entries").add("first", "key");
    await written;

    const read = database.transaction("entries", "readonly");
    const readDone = transactionDone(read);
    await expect(
      requestResult<string>(read.objectStore("entries").get("key")),
    ).resolves.toBe("first");
    await expect(readDone).resolves.toBeUndefined();

    const duplicate = database.transaction("entries", "readwrite");
    const duplicateDone = transactionDone(duplicate);
    await expect(
      requestResult(duplicate.objectStore("entries").add("second", "key")),
    ).rejects.toBeTruthy();
    await expect(duplicateDone).rejects.toBeTruthy();
  });
});
