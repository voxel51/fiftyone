import { describe, expect, it } from "vitest";
import type { ReadWorkBudget, ReadWorkUsage } from "../ports";
import { createSourceReadBudgetLedger } from "./read-budget-account";

const allowance: ReadWorkBudget = {
  maxMessages: 20,
  maxSourceBytes: 2_000,
  maxUncompressedBytes: 8_000,
  maxWallTimeMs: 1_000,
};

function usage(overrides: Partial<ReadWorkUsage> = {}): ReadWorkUsage {
  return {
    chunksOpened: 2,
    decompressedBytes: 4_000,
    decompressionCacheHits: 0,
    elapsedMs: 25,
    logicalSourceBytes: 500,
    logicalUncompressedBytes: 4_000,
    messagesDecoded: 5,
    transferredBytes: 500,
    ...overrides,
  };
}

describe("source read budget ledger", () => {
  it("shares cumulative allowance across independent reservations", () => {
    const ledger = createSourceReadBudgetLedger(allowance, {
      maxPhysicalUnits: 8,
    });
    const grant = {
      maxMessages: 10,
      maxSourceBytes: 1_000,
      maxUncompressedBytes: 4_000,
      maxWallTimeMs: 500,
    };

    const first = ledger.reserve(grant, 4);
    const second = ledger.reserve(grant, 4);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(ledger.reserve(grant, 1)).toBeUndefined();

    first?.commit(
      usage({
        logicalUncompressedBytes: 4_000,
      }),
      2,
      { exact: true },
    );

    expect(ledger.remaining()).toEqual({
      maxMessages: 5,
      maxPhysicalUnits: 2,
      maxSourceBytes: 500,
      maxUncompressedBytes: 0,
      maxWallTimeMs: 475,
    });
  });

  it("retains a conservative reservation after inexact settlement", () => {
    const ledger = createSourceReadBudgetLedger(allowance, {
      maxPhysicalUnits: 8,
    });
    const reservation = ledger.reserve(allowance, 8);

    reservation?.commit(usage(), 2);

    expect(ledger.remaining()).toEqual({
      maxMessages: 0,
      maxPhysicalUnits: 0,
      maxSourceBytes: 0,
      maxUncompressedBytes: 0,
      maxWallTimeMs: 0,
    });
  });

  it("rejects usage that exceeds a reserved hard limit", () => {
    const ledger = createSourceReadBudgetLedger(allowance, {
      maxPhysicalUnits: 8,
    });
    const reservation = ledger.reserve(allowance, 8);

    expect(() =>
      reservation?.commit(
        usage({ logicalSourceBytes: allowance.maxSourceBytes + 1 }),
        2,
        { exact: true },
      ),
    ).toThrow("exceeded its reserved hard budget");
  });
});
