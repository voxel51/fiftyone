import { describe, expect, it } from "vitest";
import { createCachedByteClient } from "./cached-byte-client";
import { createMemoryByteRangeCache } from "./cache";
import { BYTE_SOURCE_READ_PROFILE } from "./constants";
import type {
  ByteClient,
  ByteFillLockManager,
  ByteRangeCache,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteReadDebugLog,
  ByteSourceDescriptor,
} from "./types";

const MEMORY_CACHE_BYTES = 1024 * 1024;

function source(
  overrides: Partial<ByteSourceDescriptor> = {},
): ByteSourceDescriptor {
  // No sizeBytes on purpose: fills stay exact-range so tests exercise the
  // lock path without block-widening arithmetic.
  return {
    sourceId: "source-a",
    url: "https://bytes.example/a.mcap",
    ...overrides,
  };
}

function request(
  overrides: Partial<ByteRangeReadRequest> = {},
): ByteRangeReadRequest {
  return {
    range: { length: 8n, offset: 64n },
    source: source(),
    ...overrides,
  };
}

function fillResult(forRequest: ByteRangeReadRequest): ByteRangeReadResult {
  return {
    bytes: new Uint8Array(Number(forRequest.range.length)).fill(7),
    range: forRequest.range,
    source: forRequest.source,
  };
}

/**
 * FIFO exclusive lock fake: requests for one name run strictly in arrival
 * order, and the lock is held until the granted callback settles.
 */
function createFakeLockManager() {
  const tails = new Map<string, Promise<void>>();
  const granted: string[] = [];
  const manager: ByteFillLockManager = {
    async request(name, options, callback) {
      if (options.signal?.aborted) {
        const error = new Error("The lock request was aborted.");
        error.name = "AbortError";
        throw error;
      }
      const previous = tails.get(name) ?? Promise.resolve();
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(
        name,
        previous.then(() => held),
      );
      await previous;
      granted.push(name);
      try {
        return await callback();
      } finally {
        release();
      }
    },
  };

  return { granted, manager };
}

/** Reader whose fetches only settle when the test releases them. */
function createControlledReader() {
  const pending: Array<{
    reject: (error: Error) => void;
    request: ByteRangeReadRequest;
    resolve: (result: ByteRangeReadResult) => void;
  }> = [];
  const reader: ByteClient = {
    readBytes(readRequest) {
      return new Promise<ByteRangeReadResult>((resolve, reject) => {
        pending.push({ reject, request: readRequest, resolve });
      });
    },
  };

  return { pending, reader };
}

/** Persistent cache whose puts block until the test opens the gate. */
function createGatedPersistent(inner: ByteRangeCache) {
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });

  const cache: ByteRangeCache = {
    clear: () => inner.clear(),
    get: (getRequest) => inner.get(getRequest),
    async put(result) {
      await gate;
      return inner.put(result);
    },
  };

  return { cache, openGate };
}

function createClient({
  blockSizeBytes,
  locks,
  persistent,
  reads,
}: {
  blockSizeBytes?: number;
  locks?: ByteFillLockManager | false;
  persistent?: ByteRangeCache | false;
  reads: ByteClient;
}) {
  const logs: ByteReadDebugLog[] = [];
  const client = createCachedByteClient(reads, {
    ...(blockSizeBytes !== undefined ? { blockSizeBytes } : {}),
    ...(locks !== undefined ? { locks } : {}),
    memory: createMemoryByteRangeCache({ maxSizeBytes: MEMORY_CACHE_BYTES }),
    onRead: (entry) => logs.push(entry),
    ...(persistent !== undefined ? { persistent } : {}),
  });

  return { client, logs };
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createCachedByteClient cross-context fill locking", () => {
  it("single-flights identical fills across clients via lock + persistent handoff", async () => {
    const { manager } = createFakeLockManager();
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const first = createClient({
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });
    const second = createClient({
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });

    const firstRead = first.client.readBytes(request());
    await flushAsync();
    const secondRead = second.client.readBytes(request());
    await flushAsync();

    // Only the lock winner reaches the network.
    expect(controlled.pending).toHaveLength(1);
    controlled.pending[0].resolve(fillResult(controlled.pending[0].request));

    const [firstResult, secondResult] = await Promise.all([
      firstRead,
      secondRead,
    ]);
    expect(firstResult.bytes).toEqual(new Uint8Array(8).fill(7));
    expect(secondResult.bytes).toEqual(new Uint8Array(8).fill(7));
    expect(controlled.pending).toHaveLength(1);
    expect(first.logs.map((entry) => entry.cacheResult)).toEqual(["fetched"]);
    expect(second.logs.map((entry) => entry.cacheResult)).toEqual([
      "persistent-hit",
    ]);
    // The handoff must never masquerade as transport bytes to the meter.
    expect(second.logs[0].fetchedBytes).toBe(0);
  });

  it("holds the lock through the persistent put so waiters re-check against a landed entry", async () => {
    const { manager } = createFakeLockManager();
    const gated = createGatedPersistent(
      createMemoryByteRangeCache({ maxSizeBytes: MEMORY_CACHE_BYTES }),
    );
    const controlled = createControlledReader();
    const first = createClient({
      locks: manager,
      persistent: gated.cache,
      reads: controlled.reader,
    });
    const second = createClient({
      locks: manager,
      persistent: gated.cache,
      reads: controlled.reader,
    });

    const firstRead = first.client.readBytes(request());
    await flushAsync();
    const secondRead = second.client.readBytes(request());
    await flushAsync();

    controlled.pending[0].resolve(fillResult(controlled.pending[0].request));

    // The winner's caller resolves without waiting for the put...
    await expect(firstRead).resolves.toBeDefined();
    let secondSettled = false;
    void secondRead.then(() => {
      secondSettled = true;
    });
    await flushAsync();
    // ...but the waiter stays queued (and off the network) until it lands.
    expect(secondSettled).toBe(false);
    expect(controlled.pending).toHaveLength(1);

    gated.openGate();
    const secondResult = await secondRead;
    expect(secondResult.bytes).toEqual(new Uint8Array(8).fill(7));
    expect(controlled.pending).toHaveLength(1);
  });

  it("fetches independently when no lock manager is configured", async () => {
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const first = createClient({
      persistent: shared,
      reads: controlled.reader,
    });
    const second = createClient({
      persistent: shared,
      reads: controlled.reader,
    });

    const firstRead = first.client.readBytes(request());
    const secondRead = second.client.readBytes(request());
    await flushAsync();

    expect(controlled.pending).toHaveLength(2);
    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    await Promise.all([firstRead, secondRead]);
  });

  it("does not serialize fills when the persistent handoff layer is absent", async () => {
    const { granted, manager } = createFakeLockManager();
    const controlled = createControlledReader();
    const first = createClient({
      locks: manager,
      persistent: false,
      reads: controlled.reader,
    });
    const second = createClient({
      locks: manager,
      persistent: false,
      reads: controlled.reader,
    });

    const firstRead = first.client.readBytes(request());
    const secondRead = second.client.readBytes(request());
    await flushAsync();

    // Without the persistent layer a lock could only delay independent
    // fetches, so it must not even be requested.
    expect(granted).toHaveLength(0);
    expect(controlled.pending).toHaveLength(2);
    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    await Promise.all([firstRead, secondRead]);
  });

  it("rejects a fill whose signal is already aborted without touching the network", async () => {
    const { manager } = createFakeLockManager();
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const { client } = createClient({
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      client.readBytes(request({ signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(controlled.pending).toHaveLength(0);
  });

  it("releases waiters to fetch for themselves when the winner fails", async () => {
    const { manager } = createFakeLockManager();
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const first = createClient({
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });
    const second = createClient({
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });

    const firstRead = first.client.readBytes(request());
    await flushAsync();
    const secondRead = second.client.readBytes(request());
    await flushAsync();

    expect(controlled.pending).toHaveLength(1);
    controlled.pending[0].reject(new Error("network down"));
    await expect(firstRead).rejects.toThrow("network down");

    await flushAsync();
    // The waiter acquired the lock, re-checked persistent (miss), and fetched.
    expect(controlled.pending).toHaveLength(2);
    controlled.pending[1].resolve(fillResult(controlled.pending[1].request));
    const secondResult = await secondRead;
    expect(secondResult.bytes).toEqual(new Uint8Array(8).fill(7));
  });
});

describe("createCachedByteClient sequential remote readahead", () => {
  const remoteSource = () =>
    source({
      readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
      sizeBytes: "48",
    });

  it("queues the successor block behind a remote block-widened fill", async () => {
    const controlled = createControlledReader();
    const { client } = createClient({
      blockSizeBytes: 16,
      reads: controlled.reader,
    });

    const read = client.readBytes(
      request({ range: { length: 4n, offset: 0n }, source: remoteSource() }),
    );
    await flushAsync();

    // The widened fill [0,16) plus its speculative successor [16,32).
    expect(controlled.pending).toHaveLength(2);
    const ranges = controlled.pending
      .map((entry) => entry.request.range)
      .sort((left, right) => Number(left.offset - right.offset));
    expect(ranges).toEqual([
      { length: 16n, offset: 0n },
      { length: 16n, offset: 16n },
    ]);
    // Readahead never carries the triggering request's abort signal.
    const readahead = controlled.pending.find(
      (entry) => entry.request.range.offset === 16n,
    );
    expect(readahead?.request.signal).toBeUndefined();

    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    await read;
    await flushAsync();
    // The readahead fill is exactly block-shaped, so it must not cascade.
    expect(controlled.pending).toHaveLength(2);
  });

  it("clamps the readahead block at the end of the source", async () => {
    const controlled = createControlledReader();
    const { client } = createClient({
      blockSizeBytes: 16,
      reads: controlled.reader,
    });

    const read = client.readBytes(
      request({ range: { length: 4n, offset: 32n }, source: remoteSource() }),
    );
    await flushAsync();

    expect(controlled.pending).toHaveLength(1);
    expect(controlled.pending[0].request.range).toEqual({
      length: 16n,
      offset: 32n,
    });
    controlled.pending[0].resolve(fillResult(controlled.pending[0].request));
    await read;
  });

  it("does not queue readahead for non-remote sources", async () => {
    const controlled = createControlledReader();
    const { client } = createClient({
      blockSizeBytes: 16,
      reads: controlled.reader,
    });

    const read = client.readBytes(
      request({
        range: { length: 4n, offset: 0n },
        source: source({ sizeBytes: "48" }),
      }),
    );
    await flushAsync();

    expect(controlled.pending).toHaveLength(1);
    controlled.pending[0].resolve(fillResult(controlled.pending[0].request));
    await read;
  });
});
