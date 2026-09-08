import type { ReadWorkBudget, ReadWorkUsage } from "../../../ports";

/** Adapter-private physical-unit limits layered under the neutral byte budget. */
export interface SourceReadBudgetPhysicalLimits {
  readonly maxPhysicalUnits: number;
}

/** Remaining cumulative work, including an adapter-private physical unit. */
export interface SourceReadBudgetSnapshot extends ReadWorkBudget {
  readonly maxPhysicalUnits: number;
}

/** One conservative reservation made before a bounded grant starts. */
export interface PhysicalReadBudgetReservation {
  readonly budget: ReadWorkBudget;
  readonly maxPhysicalUnits: number;
  commit(
    usage: ReadWorkUsage,
    physicalUnits: number,
    options?: { readonly exact?: boolean },
  ): void;
}

/** MCAP-owned source budget ledger used by bounded acquisition. */
export interface SourceReadBudgetLedger {
  remaining(): SourceReadBudgetSnapshot;
  reserve(
    budget: ReadWorkBudget,
    physicalUnits: number,
  ): PhysicalReadBudgetReservation | undefined;
}

/**
 * Creates one cumulative source allowance.
 *
 * Reservations charge their full grant immediately. A settled grant refunds
 * only exact, demonstrably unused work; failed or cancelled grants retain the
 * conservative reservation by never committing it as exact.
 */
export function createSourceReadBudgetLedger(
  allowance: ReadWorkBudget,
  physical: SourceReadBudgetPhysicalLimits,
): SourceReadBudgetLedger {
  assertReadWorkBudget(allowance, "source allowance");
  assertNonNegativeInteger(
    physical.maxPhysicalUnits,
    "source allowance maxPhysicalUnits",
  );

  const initial = {
    ...allowance,
    maxPhysicalUnits: physical.maxPhysicalUnits,
  };
  const remaining = { ...initial };

  return {
    remaining: () => ({ ...remaining }),

    reserve(budget, physicalUnits) {
      assertReadWorkBudget(budget, "read grant");
      assertNonNegativeInteger(physicalUnits, "read grant physicalUnits");
      if (
        budget.maxMessages > remaining.maxMessages ||
        budget.maxSourceBytes > remaining.maxSourceBytes ||
        budget.maxUncompressedBytes > remaining.maxUncompressedBytes ||
        budget.maxWallTimeMs > remaining.maxWallTimeMs ||
        physicalUnits > remaining.maxPhysicalUnits
      ) {
        return undefined;
      }

      remaining.maxMessages -= budget.maxMessages;
      remaining.maxSourceBytes -= budget.maxSourceBytes;
      remaining.maxUncompressedBytes -= budget.maxUncompressedBytes;
      remaining.maxWallTimeMs -= budget.maxWallTimeMs;
      remaining.maxPhysicalUnits -= physicalUnits;

      let settled = false;
      return {
        budget: { ...budget },
        maxPhysicalUnits: physicalUnits,
        commit(usage, usedPhysicalUnits, options = {}) {
          if (settled) {
            throw new Error("read budget reservation already settled");
          }
          settled = true;
          assertReadWorkUsageWithinReservation(
            usage,
            usedPhysicalUnits,
            budget,
            physicalUnits,
          );
          if (options.exact !== true) {
            return;
          }

          remaining.maxMessages += budget.maxMessages - usage.messagesDecoded;
          remaining.maxSourceBytes +=
            budget.maxSourceBytes - usage.logicalSourceBytes;
          remaining.maxUncompressedBytes +=
            budget.maxUncompressedBytes - usage.logicalUncompressedBytes;
          remaining.maxWallTimeMs += Math.max(
            0,
            budget.maxWallTimeMs - usage.elapsedMs,
          );
          remaining.maxPhysicalUnits += physicalUnits - usedPhysicalUnits;
        },
      };
    },
  };
}

/** Validates finite, non-negative hard work limits. */
function assertReadWorkBudget(
  budget: ReadWorkBudget,
  label = "read budget",
): void {
  assertNonNegativeInteger(budget.maxMessages, `${label} maxMessages`);
  assertNonNegativeInteger(budget.maxSourceBytes, `${label} maxSourceBytes`);
  assertNonNegativeInteger(
    budget.maxUncompressedBytes,
    `${label} maxUncompressedBytes`,
  );
  assertNonNegativeFinite(budget.maxWallTimeMs, `${label} maxWallTimeMs`);
}

function assertReadWorkUsageWithinReservation(
  usage: ReadWorkUsage,
  physicalUnits: number,
  budget: ReadWorkBudget,
  maxPhysicalUnits: number,
): void {
  assertNonNegativeInteger(usage.messagesDecoded, "usage messagesDecoded");
  assertNonNegativeInteger(
    usage.logicalSourceBytes,
    "usage logicalSourceBytes",
  );
  assertNonNegativeInteger(
    usage.logicalUncompressedBytes,
    "usage logicalUncompressedBytes",
  );
  assertNonNegativeFinite(usage.elapsedMs, "usage elapsedMs");
  assertNonNegativeInteger(physicalUnits, "usage physicalUnits");
  if (
    usage.messagesDecoded > budget.maxMessages ||
    usage.logicalSourceBytes > budget.maxSourceBytes ||
    usage.logicalUncompressedBytes > budget.maxUncompressedBytes ||
    physicalUnits > maxPhysicalUnits
  ) {
    throw new Error("bounded read usage exceeded its reserved hard budget");
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}
