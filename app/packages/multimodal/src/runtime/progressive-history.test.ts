import { describe, expect, it, vi } from "vitest";

import type { DecodedFrame } from "../ir";
import type {
  BudgetedReadJob,
  BudgetedReadResult,
  EpisodeSession,
  FrameBatch,
  ReadWorkUsage,
  SourceReadBudgetAccount,
} from "../ports";
import {
  getProgressiveHistoryJob,
  ProgressiveHistoryHub,
  type ProgressiveHistoryJobConfig,
  type ProgressiveHistorySnapshot,
} from "./progressive-history";

const budget = {
  maxMessages: 10,
  maxSourceBytes: 1_000,
  maxUncompressedBytes: 2_000,
  maxWallTimeMs: 10,
} as const;

describe("ProgressiveHistoryHub", () => {
  it("retains a physically bounded center-out continuation across dense interleaved grants", async () => {
    const continuation = {};
    const read = vi
      .fn<BudgetedReadJob["read"]>()
      .mockResolvedValueOnce(
        boundedResult({
          batches: [batch("noisy", 50n), batch("quiet", 51n)],
          continuation,
          coverageByStream: new Map([
            ["noisy", [{ endNs: 60n, startNs: 40n }]],
            ["quiet", [{ endNs: 60n, startNs: 40n }]],
          ]),
          resumeAtNs: 61n,
          stopReason: "budget-exhausted",
          usage: { ...emptyUsage(), chunksOpened: 1, decompressedBytes: 900 },
        }),
      )
      .mockResolvedValueOnce(
        boundedResult({
          batches: [batch("noisy", 10n), batch("quiet", 90n)],
          coverageByStream: new Map([
            ["noisy", [{ endNs: 100n, startNs: 0n }]],
            ["quiet", [{ endNs: 100n, startNs: 0n }]],
          ]),
          stopReason: "source-exhausted",
          usage: { ...emptyUsage(), chunksOpened: 1, decompressedBytes: 900 },
        }),
      );
    const account = accountFor(read);
    const hub = new ProgressiveHistoryHub(session(), account);
    const job = hub.get(
      config({
        key: "interleaved",
        preferredTimeNs: 50n,
        streams: ["noisy", "quiet"],
      }),
    );

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    release();

    expect(snapshot.status).toBe("complete");
    expect(snapshot.value.get("quiet")).toEqual([51n, 90n]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]?.[0]).toMatchObject({ preferredTimeNs: 50n });
    expect(read.mock.calls[1]?.[0]).toMatchObject({
      continuation,
      preferredTimeNs: 50n,
    });
  });

  it("skips an ungrantable source unit once and retains exact unavailable coverage", async () => {
    const firstContinuation = {};
    const secondContinuation = {};
    const read = vi
      .fn<BudgetedReadJob["read"]>()
      .mockResolvedValueOnce(
        boundedResult({
          batches: [],
          continuation: firstContinuation,
          coverageByStream: new Map(),
          resumeAtNs: 0n,
          stopReason: "budget-exhausted",
        }),
      )
      .mockResolvedValueOnce(
        boundedResult({
          batches: [],
          continuation: secondContinuation,
          coverageByStream: new Map(),
          resumeAtNs: 50n,
          stopReason: "oversized-source-unit",
          unavailableByStream: new Map([
            ["pose", [{ endNs: 49n, startNs: 0n }]],
          ]),
        }),
      )
      .mockResolvedValueOnce(
        boundedResult({
          batches: [batch("pose", 75n)],
          coverageByStream: new Map([["pose", [{ endNs: 99n, startNs: 50n }]]]),
          stopReason: "source-exhausted",
        }),
      );
    const hub = new ProgressiveHistoryHub(session(), accountFor(read));
    const job = hub.get(config({ key: "oversized", streams: ["pose"] }));

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    release();

    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls[1]?.[0]).toMatchObject({
      continuation: firstContinuation,
      skipOversizedSourceUnit: true,
    });
    expect(read.mock.calls[2]?.[0]).toMatchObject({
      continuation: secondContinuation,
    });
    expect(snapshot.status).toBe("truncated");
    expect(snapshot.terminalCause).toBe("source-unit-unavailable");
    expect(snapshot.value.get("pose")).toEqual([75n]);
    expect(snapshot.unavailableByStream.get("pose")).toEqual([
      { endNs: 49n, startNs: 0n },
    ]);
  });

  it("reports account exhaustion as an honest terminal truncation", async () => {
    const read = vi.fn<BudgetedReadJob["read"]>().mockResolvedValue(
      boundedResult({
        batches: [],
        coverageByStream: new Map(),
        stopReason: "account-exhausted",
      }),
    );
    const hub = new ProgressiveHistoryHub(session(), accountFor(read));
    const job = hub.get(
      config({ key: "account-exhausted", streams: ["pose"] }),
    );

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    release();

    expect(snapshot.status).toBe("truncated");
    expect(snapshot.terminalCause).toBe("account-exhausted");
  });

  it("terminates when an explicit oversized retry still makes no progress", async () => {
    const continuation = {};
    const read = vi.fn<BudgetedReadJob["read"]>().mockResolvedValue(
      boundedResult({
        batches: [],
        continuation,
        coverageByStream: new Map(),
        stopReason: "budget-exhausted",
      }),
    );
    const hub = new ProgressiveHistoryHub(session(), accountFor(read));
    const job = hub.get(config({ key: "zero-progress", streams: ["pose"] }));

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    release();

    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1]?.[0]).toMatchObject({
      continuation,
      skipOversizedSourceUnit: true,
    });
    expect(snapshot.status).toBe("truncated");
    expect(snapshot.terminalCause).toBe("zero-progress");
  });

  it("terminates when an oversized response does not advance or mark coverage", async () => {
    const continuation = {};
    const read = vi
      .fn<BudgetedReadJob["read"]>()
      .mockResolvedValueOnce(
        boundedResult({
          batches: [],
          continuation,
          coverageByStream: new Map(),
          stopReason: "budget-exhausted",
        }),
      )
      .mockResolvedValueOnce(
        boundedResult({
          batches: [],
          continuation,
          coverageByStream: new Map(),
          stopReason: "oversized-source-unit",
        }),
      );
    const hub = new ProgressiveHistoryHub(session(), accountFor(read));
    const job = hub.get(
      config({ key: "no-advance-oversized", streams: ["pose"] }),
    );

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    release();

    expect(read).toHaveBeenCalledTimes(2);
    expect(snapshot.status).toBe("truncated");
    expect(snapshot.terminalCause).toBe("zero-progress");
  });

  it("does not truncate for an empty unavailable-range entry", async () => {
    const read = vi.fn<BudgetedReadJob["read"]>().mockResolvedValue(
      boundedResult({
        batches: [],
        coverageByStream: new Map(),
        stopReason: "source-exhausted",
        unavailableByStream: new Map([["pose", []]]),
      }),
    );
    const hub = new ProgressiveHistoryHub(session(), accountFor(read));
    const job = hub.get(
      config({ key: "empty-unavailable", streams: ["pose"] }),
    );

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    release();

    expect(snapshot.status).toBe("complete");
    expect(snapshot.truncated).toBe(false);
  });

  it("does not reuse a retained job when its physical read contract changes", () => {
    const hub = new ProgressiveHistoryHub(session(), null);
    const firstConfig = config({ key: "same", streams: ["pose"] });
    const first = hub.get(firstConfig);
    const second = hub.get({
      ...firstConfig,
      streams: ["pose", "quiet"],
      window: { endNs: 199n, startNs: 100n },
    });

    expect(second).not.toBe(first);
  });

  it("does not lock a session into generic fallback before an account arrives", () => {
    const activeSession = session();
    const activeConfig = config({ key: "account", streams: ["pose"] });
    const generic = getProgressiveHistoryJob(activeSession, null, activeConfig);
    const bounded = getProgressiveHistoryJob(
      activeSession,
      accountFor(vi.fn()),
      activeConfig,
    );

    expect(bounded).not.toBe(generic);
  });

  it("constructs pathological fallback ranges without materializing every tile", () => {
    const hub = new ProgressiveHistoryHub(session(), null);

    expect(() =>
      hub.get(
        config({
          key: "huge-window",
          streams: ["pose"],
          tileDurationNs: 1n,
          window: { endNs: 10_000_000_000_000n, startNs: 0n },
        }),
      ),
    ).not.toThrow();
  });

  it("marks a capped generic tile unavailable instead of complete", async () => {
    const read = vi.fn(async function* () {
      yield batch("dense", 1n);
      yield batch("dense", 2n);
    });
    const hub = new ProgressiveHistoryHub(session(read), null);
    const job = hub.get(
      config({
        fallbackLimit: 2,
        key: "cap",
        streams: ["dense"],
      }),
    );

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    release();

    expect(snapshot.status).toBe("truncated");
    expect(snapshot.terminalCause).toBe("fallback-message-cap");
    expect(snapshot.coverageByStream.get("dense")).toBeUndefined();
    expect(snapshot.unavailableByStream.get("dense")).toEqual([
      { endNs: 99n, startNs: 0n },
    ]);
  });

  it("aborts only the incomplete generic tile and resumes it on renewed demand", async () => {
    let calls = 0;
    const read = vi.fn(async function* (request) {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((resolve) =>
          request.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
        return;
      }
      yield batch("pose", 5n);
    });
    const hub = new ProgressiveHistoryHub(session(read), null);
    const job = hub.get(config({ key: "resume", streams: ["pose"] }));

    const firstRelease = job.acquire(demand());
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    firstRelease();
    await vi.waitFor(() => expect(job.snapshot().status).toBe("loading"));

    const secondRelease = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    secondRelease();

    expect(read).toHaveBeenCalledTimes(2);
    expect(snapshot.status).toBe("complete");
    expect(snapshot.value.get("pose")).toEqual([5n]);
  });

  it("resumes when an aborted generic tile rejects with AbortError", async () => {
    let calls = 0;
    const read = vi.fn(async function* (request) {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((_resolve, reject) =>
          request.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
        return;
      }
      yield batch("pose", 5n);
    });
    const hub = new ProgressiveHistoryHub(session(read), null);
    const job = hub.get(config({ key: "reject-resume", streams: ["pose"] }));

    const firstRelease = job.acquire(demand());
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    firstRelease();
    await vi.waitFor(() => expect(job.snapshot().status).toBe("loading"));

    const secondRelease = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    secondRelease();

    expect(read).toHaveBeenCalledTimes(2);
    expect(snapshot.status).toBe("complete");
    expect(snapshot.value.get("pose")).toEqual([5n]);
  });

  it("loads a quiet generic stream after a noisy sibling exhausts its cap", async () => {
    const read = vi.fn(async function* (request) {
      const stream = request.streams[0];
      if (stream === "noisy") {
        yield batch("noisy", 1n);
        yield batch("noisy", 2n);
        return;
      }
      yield batch("quiet", 3n);
    });
    const hub = new ProgressiveHistoryHub(session(read), null);
    const job = hub.get(
      config({
        fallbackLimit: 2,
        key: "quiet",
        streams: ["noisy", "quiet"],
      }),
    );

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job);
    release();

    expect(snapshot.status).toBe("truncated");
    expect(snapshot.value.get("quiet")).toEqual([3n]);
    expect(read.mock.calls.map(([request]) => request.streams)).toEqual([
      ["noisy"],
      ["quiet"],
    ]);
  });

  it("completes histories larger than the former pose cap across drained tiles", async () => {
    const messagesPerTile = 12_501;
    const read = vi.fn(async function* (request) {
      for (let index = 0; index < messagesPerTile; index += 1) {
        yield batch("pose", request.window.startNs + BigInt(index));
      }
    });
    const hub = new ProgressiveHistoryHub(
      session(read, { endNs: 1_999n, startNs: 0n }),
      null,
    );
    const job = hub.get(
      config({
        fallbackLimit: 20_000,
        key: "large",
        maxItems: 30_000,
        streams: ["pose"],
        tileDurationNs: 1_000n,
        window: { endNs: 1_999n, startNs: 0n },
      }),
    );

    const release = job.acquire(demand());
    const snapshot = await terminalSnapshot(job, 5_000);
    release();

    expect(snapshot.status).toBe("complete");
    expect(snapshot.itemCount).toBe(25_002);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

function config(overrides: {
  readonly fallbackLimit?: number;
  readonly key: string;
  readonly maxItems?: number;
  readonly preferredTimeNs?: bigint;
  readonly streams: readonly string[];
  readonly tileDurationNs?: bigint;
  readonly window?: { readonly endNs: bigint; readonly startNs: bigint };
}): ProgressiveHistoryJobConfig<ReadonlyMap<string, readonly bigint[]>> {
  return {
    accumulator: {
      initialValue: new Map(),
      consume(current, batches) {
        const value = new Map(
          [...current].map(([stream, times]) => [stream, [...times]]),
        );
        for (const batch of batches) {
          const times = value.get(batch.stream) ?? [];
          times.push(...batch.frames.map((frame) => frame.timestampNs));
          value.set(batch.stream, times);
        }
        return {
          itemCount: [...value.values()].reduce(
            (count, times) => count + times.length,
            0,
          ),
          value,
        };
      },
    },
    budget,
    fallback: {
      maxMessagesPerStream: overrides.fallbackLimit ?? 10,
      tileDurationNs: overrides.tileDurationNs ?? 100n,
    },
    family: "pose",
    key: overrides.key,
    maxItems: overrides.maxItems ?? 1_000,
    ...(overrides.preferredTimeNs !== undefined
      ? { preferredTimeNs: overrides.preferredTimeNs }
      : {}),
    streams: overrides.streams,
    traversal:
      overrides.preferredTimeNs === undefined ? "chronological" : "center-out",
    window: overrides.window ?? { endNs: 99n, startNs: 0n },
  };
}

function accountFor(read: BudgetedReadJob["read"]): SourceReadBudgetAccount {
  return {
    createJob: () => ({ read }),
    remaining: () => ({ ...budget }),
    reserve: () => undefined,
  };
}

function session(
  read: EpisodeSession["read"] = vi.fn(async function* () {
    yield* [];
  }),
  timeRange = { endNs: 99n, startNs: 0n },
): EpisodeSession {
  return {
    dispose: vi.fn(),
    manifest: {
      episodeId: "history-test",
      streams: [],
      timeDomain: { id: "log", kind: "timestamp" },
      timeRange,
    },
    read,
  };
}

function batch(stream: string, timestampNs: bigint): FrameBatch {
  return {
    frames: [
      {
        output: {},
        streamId: stream,
        timestampNs,
      } as DecodedFrame,
    ],
    stream,
  };
}

function boundedResult(
  result: Omit<BudgetedReadResult, "usage"> & {
    readonly usage?: ReadWorkUsage;
  },
): BudgetedReadResult {
  return { usage: emptyUsage(), ...result };
}

function emptyUsage(): ReadWorkUsage {
  return {
    chunksOpened: 0,
    decompressedBytes: 0,
    decompressionCacheHits: 0,
    elapsedMs: 0,
    logicalSourceBytes: 0,
    logicalUncompressedBytes: 0,
    messagesDecoded: 0,
    transferredBytes: 0,
  };
}

function demand() {
  return { retryDelayMs: 1, shouldStandDown: () => false };
}

async function terminalSnapshot<T>(
  job: {
    snapshot(): ProgressiveHistorySnapshot<T>;
    subscribe(listener: () => void): () => void;
  },
  timeoutMs = 1_000,
): Promise<ProgressiveHistorySnapshot<T>> {
  const current = job.snapshot();
  if (["complete", "truncated", "error"].includes(current.status)) {
    return current;
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("history job did not settle"));
    }, timeoutMs);
    const unsubscribe = job.subscribe(() => {
      const snapshot = job.snapshot();
      if (!["complete", "truncated", "error"].includes(snapshot.status)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(snapshot);
    });
  });
}
