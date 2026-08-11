import { describe, expect, it, vi } from "vitest";

import type {
  BudgetedReadRequest,
  BudgetedReadResult,
  SourceReadBudgetAccount,
} from "../ports";
import { createScheduledSourceReadBudgetAccount } from "./scheduled-read-budget-account";

describe("createScheduledSourceReadBudgetAccount", () => {
  it("round-robins queued grants without reopening the source account", async () => {
    const starts: string[] = [];
    const gates = [deferred(), deferred(), deferred()];
    let sourceJobIndex = 0;
    const createJob = vi.fn(() => {
      const job = sourceJobIndex++ === 0 ? "a" : "b";
      return {
        async read(request: BudgetedReadRequest): Promise<BudgetedReadResult> {
          const label = `${job}:${String(request.window.startNs)}`;
          starts.push(label);
          await gates[starts.length - 1].promise;
          return result();
        },
      };
    });
    const source = {
      createJob,
      remaining: () => budget(),
      reserve: () => undefined,
    } satisfies SourceReadBudgetAccount;
    const account = createScheduledSourceReadBudgetAccount(source);
    const a = account.createJob();
    const b = account.createJob();

    const a1 = a.read(request(1n));
    const a2 = a.read(request(2n));
    const b1 = b.read(request(3n));
    expect(starts).toEqual(["a:1"]);

    gates[0].resolve();
    await a1;
    expect(starts).toEqual(["a:1", "b:3"]);

    gates[1].resolve();
    await b1;
    expect(starts).toEqual(["a:1", "b:3", "a:2"]);

    gates[2].resolve();
    await a2;
    expect(createJob).toHaveBeenCalledTimes(2);
  });

  it("drops a queued grant that was cancelled before admission", async () => {
    const gate = deferred();
    const reads = [
      vi.fn(async () => {
        await gate.promise;
        return result();
      }),
      vi.fn(() => Promise.resolve(result())),
    ];
    let jobIndex = 0;
    const source = {
      createJob: () => ({ read: reads[jobIndex++] }),
      remaining: () => budget(),
      reserve: () => undefined,
    } satisfies SourceReadBudgetAccount;
    const account = createScheduledSourceReadBudgetAccount(source);
    const first = account.createJob();
    const cancelled = account.createJob();
    const controller = new AbortController();

    const active = first.read(request(1n));
    const queued = cancelled.read({
      ...request(2n),
      signal: controller.signal,
    });
    controller.abort();
    gate.resolve();

    await active;
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(reads[1]).not.toHaveBeenCalled();
  });
});

function request(startNs: bigint): BudgetedReadRequest {
  return {
    budget: budget(),
    streams: ["stream"],
    window: { endNs: startNs, startNs },
  };
}

function result(): BudgetedReadResult {
  return {
    batches: [],
    coverageByStream: new Map(),
    stopReason: "source-exhausted",
    usage: {
      chunksOpened: 0,
      decompressedBytes: 0,
      decompressionCacheHits: 0,
      elapsedMs: 0,
      logicalSourceBytes: 0,
      logicalUncompressedBytes: 0,
      messagesDecoded: 0,
      transferredBytes: 0,
    },
  };
}

function budget() {
  return {
    maxMessages: 1,
    maxSourceBytes: 1,
    maxUncompressedBytes: 1,
    maxWallTimeMs: 1,
  };
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
