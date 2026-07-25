import { describe, expect, it } from "vitest";
import { createCachedByteClient } from "./cached-byte-client";
import { createMemoryByteRangeCache } from "./cache";
import { BYTE_SOURCE_READ_PROFILE } from "./constants";
import type {
  ByteClient,
  ByteFillLockManager,
  ByteFillSlotClass,
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
 * order, the lock is held until the granted callback settles, `ifAvailable`
 * invokes the callback with `null` instead of queueing (matching the Web
 * Locks API), and aborting a queued request removes it from its queue.
 */
function createFakeLockManager() {
  const tails = new Map<string, Promise<void>>();
  const queueDepth = new Map<string, number>();
  const granted: string[] = [];
  const abortError = () => {
    const error = new Error("The lock request was aborted.");
    error.name = "AbortError";
    return error;
  };
  const manager: ByteFillLockManager = {
    async request(name, options, callback) {
      if (options.signal?.aborted) {
        throw abortError();
      }
      if (options.ifAvailable && (queueDepth.get(name) ?? 0) > 0) {
        return await callback(null);
      }
      queueDepth.set(name, (queueDepth.get(name) ?? 0) + 1);
      const previous = tails.get(name) ?? Promise.resolve();
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(
        name,
        previous.then(() => held),
      );
      const leaveQueue = () => {
        queueDepth.set(name, (queueDepth.get(name) ?? 1) - 1);
        release();
      };
      try {
        if (options.signal) {
          const signal = options.signal;
          await Promise.race([
            previous,
            new Promise<never>((_, rejectAborted) => {
              signal.addEventListener(
                "abort",
                () => rejectAborted(abortError()),
                { once: true },
              );
            }),
          ]);
        } else {
          await previous;
        }
      } catch (error) {
        leaveQueue();
        throw error;
      }
      granted.push(name);
      try {
        return await callback({ name });
      } finally {
        leaveQueue();
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
  fillSlotClass,
  locks,
  persistent,
  reads,
}: {
  blockSizeBytes?: number;
  fillSlotClass?: ByteFillSlotClass;
  locks?: ByteFillLockManager | false;
  persistent?: ByteRangeCache | false;
  reads: ByteClient;
}) {
  const logs: ByteReadDebugLog[] = [];
  const client = createCachedByteClient(reads, {
    ...(blockSizeBytes !== undefined ? { blockSizeBytes } : {}),
    ...(fillSlotClass !== undefined ? { fillSlotClass } : {}),
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

  it("uses the same fill plan for admission and contained execution", async () => {
    const controlled = createControlledReader();
    const { client } = createClient({
      blockSizeBytes: 16,
      reads: controlled.reader,
    });
    const boundedRequest = request({
      cachePolicy: { readahead: false },
      range: { length: 4n, offset: 3n },
      source: remoteSource(),
    });

    expect(client.planRead?.(boundedRequest).range).toEqual({
      length: 16n,
      offset: 0n,
    });
    const coldRead = client.readBytes(boundedRequest);
    await flushAsync();

    // Readahead is explicitly contained to the admitted fill.
    expect(controlled.pending).toHaveLength(1);
    expect(controlled.pending[0].request.range).toEqual({
      length: 16n,
      offset: 0n,
    });
    controlled.pending[0].resolve(fillResult(controlled.pending[0].request));
    const cold = await coldRead;
    expect(cold.readUsage).toEqual({
      cacheResult: "fetched",
      fillRange: { length: 16n, offset: 0n },
      transferredBytes: 16,
    });

    const warm = await client.readBytes(boundedRequest);
    expect(warm.readUsage).toEqual({
      cacheResult: "fill-hit",
      fillRange: { length: 16n, offset: 0n },
      transferredBytes: 0,
    });
    expect(controlled.pending).toHaveLength(1);
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

describe("createCachedByteClient remote fill slots", () => {
  // No sizeBytes: reads stay exact-shape, so these tests exercise slot
  // metering without block-widening or readahead in the way.
  const remoteSource = () =>
    source({ readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE });

  const remoteRead = (offset: bigint) =>
    request({ range: { length: 8n, offset }, source: remoteSource() });

  it("caps concurrent remote fills at the slot count, in need order", async () => {
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

    const reads = [0n, 8n, 16n, 24n, 32n].map((offset) =>
      client.readBytes(remoteRead(offset)),
    );
    await flushAsync();

    // Three slots → three fetches on the wire; the rest wait their turn.
    expect(controlled.pending).toHaveLength(3);
    expect(
      controlled.pending.map((entry) => entry.request.range.offset),
    ).toEqual([0n, 8n, 16n]);

    controlled.pending[0].resolve(fillResult(controlled.pending[0].request));
    await flushAsync();
    expect(controlled.pending).toHaveLength(4);
    expect(controlled.pending[3].request.range.offset).toBe(24n);

    controlled.pending[1].resolve(fillResult(controlled.pending[1].request));
    await flushAsync();
    expect(controlled.pending).toHaveLength(5);
    expect(controlled.pending[4].request.range.offset).toBe(32n);

    for (const entry of controlled.pending.slice(2)) {
      entry.resolve(fillResult(entry.request));
    }
    await Promise.all(reads);
  });

  it("does not meter local-profile fills through slots", async () => {
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

    const reads = [0n, 8n, 16n, 24n, 32n].map((offset) =>
      client.readBytes(request({ range: { length: 8n, offset } })),
    );
    await flushAsync();

    expect(controlled.pending).toHaveLength(5);
    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    await Promise.all(reads);
  });

  it("skips readahead while demand holds every slot", async () => {
    const { manager } = createFakeLockManager();
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const { client } = createClient({
      blockSizeBytes: 16,
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });
    const sized = () =>
      source({ readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE, sizeBytes: "96" });

    // Exact block-sized reads never widen, so they occupy slots without
    // spawning readahead of their own.
    const occupying = [32n, 48n, 64n].map((offset) =>
      client.readBytes(
        request({ range: { length: 16n, offset }, source: sized() }),
      ),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(3);

    // This read widens to [0,16) and would normally queue readahead for
    // [16,32) — with every slot busy, both wait/skip respectively.
    const widened = client.readBytes(
      request({ range: { length: 4n, offset: 0n }, source: sized() }),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(3);

    for (const entry of controlled.pending.slice(0, 3)) {
      entry.resolve(fillResult(entry.request));
    }
    await Promise.all(occupying);
    await flushAsync();

    // The demand fill proceeds once a slot frees; the skipped readahead
    // does not come back on its own.
    expect(controlled.pending).toHaveLength(4);
    expect(controlled.pending[3].request.range.offset).toBe(0n);
    controlled.pending[3].resolve(fillResult(controlled.pending[3].request));
    await widened;
    await flushAsync();
    expect(
      controlled.pending.some((entry) => entry.request.range.offset === 16n),
    ).toBe(false);
  });

  it("runs readahead in spare slots and hands its bytes to other contexts", async () => {
    const { manager } = createFakeLockManager();
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const first = createClient({
      blockSizeBytes: 16,
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });
    const second = createClient({
      blockSizeBytes: 16,
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });
    const sized = () =>
      source({ readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE, sizeBytes: "48" });

    const read = first.client.readBytes(
      request({ range: { length: 4n, offset: 0n }, source: sized() }),
    );
    await flushAsync();

    // Slots were free: the widened fill and its readahead both fetch.
    expect(controlled.pending).toHaveLength(2);
    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    await read;
    await flushAsync();

    // Another context wants the readahead block: served from the
    // persistent handoff, never the network.
    const handoff = await second.client.readBytes(
      request({ range: { length: 4n, offset: 16n }, source: sized() }),
    );
    expect(handoff.bytes).toEqual(new Uint8Array(4).fill(7));
    expect(controlled.pending).toHaveLength(2);
    expect(second.logs.map((entry) => entry.cacheResult)).toEqual([
      "persistent-hit",
    ]);
  });

  it("coalesces demand onto an in-flight readahead fill", async () => {
    const { manager } = createFakeLockManager();
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const { client, logs } = createClient({
      blockSizeBytes: 16,
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });
    // Two blocks exactly, so the demand read below cannot spawn a
    // successor readahead of its own past the end of the source.
    const sized = () =>
      source({ readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE, sizeBytes: "32" });

    const read = client.readBytes(
      request({ range: { length: 4n, offset: 0n }, source: sized() }),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(2);

    // Demand for the readahead's block while it is still in flight: no
    // third network request.
    const demand = client.readBytes(
      request({ range: { length: 4n, offset: 16n }, source: sized() }),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(2);

    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    const [, demandResult] = await Promise.all([read, demand]);
    expect(demandResult.bytes).toEqual(new Uint8Array(4).fill(7));
    expect(logs.map((entry) => entry.cacheResult).includes("coalesced")).toBe(
      true,
    );
  });

  it("cancels a waiter without aborting its shared readahead fill", async () => {
    const { manager } = createFakeLockManager();
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const { client } = createClient({
      blockSizeBytes: 16,
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });
    const sized = () =>
      source({ readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE, sizeBytes: "32" });

    const read = client.readBytes(
      request({ range: { length: 4n, offset: 0n }, source: sized() }),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(2);

    const controller = new AbortController();
    const waiter = client.readBytes(
      request({
        range: { length: 4n, offset: 16n },
        signal: controller.signal,
        source: sized(),
      }),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(2);

    controller.abort();
    await expect(waiter).rejects.toMatchObject({ name: "AbortError" });
    expect(controlled.pending).toHaveLength(2);

    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    await read;
  });

  it("frees the slot queue position when a waiting fill aborts", async () => {
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

    const occupying = [0n, 8n, 16n].map((offset) =>
      client.readBytes(remoteRead(offset)),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(3);

    const controller = new AbortController();
    const waiting = client.readBytes({
      ...remoteRead(24n),
      signal: controller.signal,
    });
    await flushAsync();
    expect(controlled.pending).toHaveLength(3);

    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });

    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    await Promise.all(occupying);
    await flushAsync();
    // The aborted fill left the slot queues: nothing fetches for it.
    expect(controlled.pending).toHaveLength(3);
  });

  it("keeps the reserved slot open for priority fills past background queues", async () => {
    const { manager } = createFakeLockManager();
    const shared = createMemoryByteRangeCache({
      maxSizeBytes: MEMORY_CACHE_BYTES,
    });
    const controlled = createControlledReader();
    const background = createClient({
      fillSlotClass: "background",
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });
    const priority = createClient({
      locks: manager,
      persistent: shared,
      reads: controlled.reader,
    });

    // Background never takes the reserved slot: four fills, only two on
    // the wire.
    const backgroundReads = [0n, 8n, 16n, 24n].map((offset) =>
      background.client.readBytes(remoteRead(offset)),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(2);

    // A priority fill lands immediately on the reserved slot.
    const priorityRead = priority.client.readBytes(remoteRead(64n));
    await flushAsync();
    expect(controlled.pending).toHaveLength(3);
    expect(controlled.pending[2].request.range.offset).toBe(64n);

    for (const entry of controlled.pending) {
      entry.resolve(fillResult(entry.request));
    }
    await priorityRead;
    await flushAsync();
    for (const entry of controlled.pending.slice(3)) {
      entry.resolve(fillResult(entry.request));
    }
    await Promise.all(backgroundReads);
  });

  it("passes a freed slot to the next waiter when a fetch fails", async () => {
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

    const reads = [0n, 8n, 16n, 24n].map((offset) =>
      client.readBytes(remoteRead(offset)),
    );
    await flushAsync();
    expect(controlled.pending).toHaveLength(3);

    controlled.pending[0].reject(new Error("network down"));
    await expect(reads[0]).rejects.toThrow("network down");
    await flushAsync();

    expect(controlled.pending).toHaveLength(4);
    for (const entry of controlled.pending.slice(1)) {
      entry.resolve(fillResult(entry.request));
    }
    await Promise.all(reads.slice(1));
  });
});
