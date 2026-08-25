import { describe, expect, it } from "vitest";

import type { RawRecordIndexWindowRequest } from "../ir";
import type { StateActionScenario } from "../adapters/fixture/fixture-state-action";
import type { StateActionCapability } from "../ports";
import {
  isEpisodeExactCursorError,
  isEpisodeReadCancelledError,
} from "../ports";

/** One opened provider under contract test. */
export interface StateActionContractSession {
  readonly capability: StateActionCapability;
  /** End of the episode's declared time range in the provider's domain. */
  readonly declaredEndNs: bigint;
  dispose(): void;
  /** Physical data-asset reads issued by the capability, excluding tasks. */
  physicalReads?(): number;
}

/** Factory used to run the shared state/action capability contract. */
export interface StateActionContractHarness {
  createSession(
    scenario: StateActionScenario,
  ): Promise<StateActionContractSession>;
  readonly name: string;
}

const CANONICAL_SCENARIO: StateActionScenario = {
  action: {
    dtype: "float32",
    rows: [
      [
        [0, 1],
        [2, 3],
      ],
      [
        [10, 11],
        [12, 13],
      ],
      [
        [20, 21],
        [22, 23],
      ],
      [
        [30, 31],
        [32, 33],
      ],
      [
        [40, 41],
        [42, 43],
      ],
    ],
    shape: [2, 2],
  },
  episodeTasks: ["fold the towel", "stack the cube"],
  state: {
    dtype: "float32",
    names: ["shoulder", "elbow"],
    rows: [
      [0.1, 0.2, 0.3],
      [1.1, Number.NaN, 1.3],
      [2.1, 2.2, Number.POSITIVE_INFINITY],
      [3.1, 3.2, null],
      [4.1, 4.2, 4.3],
    ],
    shape: [3],
  },
  taskIndexes: [0, 0, 1, 1, 7],
  taskLabelsByIndex: { 0: "fold the towel", 1: "stack the cube" },
  timestampsSeconds: [0, 0.05, 0.1, 0.15, 0.2],
};

// The anchor union is exclusive at the type level; an ambiguous request is
// not constructible.
// @ts-expect-error two anchors must not be accepted together
const AMBIGUOUS_ANCHOR: RawRecordIndexWindowRequest = {
  after: 1,
  anchorCursor: "row:0",
  anchorTimestampNs: 0n,
  before: 1,
};
void AMBIGUOUS_ANCHOR;

/** Defines the reusable behavioral contract every state/action provider must pass. */
export function defineStateActionCapabilityContractTests({
  createSession,
  name,
}: StateActionContractHarness): void {
  const withSession = async (
    scenario: StateActionScenario,
    run: (session: StateActionContractSession) => Promise<void>,
  ) => {
    const session = await createSession(scenario);
    try {
      await run(session);
    } finally {
      session.dispose();
    }
  };
  const allEntries = async (
    session: StateActionContractSession,
    rowCount: number,
  ) => {
    const window = await session.capability.readIndexWindow({
      after: 0,
      anchorTimestampNs: session.declaredEndNs,
      before: rowCount,
    });
    return window.entries;
  };

  describe(`${name} state/action capability contract`, () => {
    it("derives the schema without any value read", async () => {
      await withSession(CANONICAL_SCENARIO, async ({ capability }) => {
        const { schema } = capability;
        expect(schema.rowCount).toBe(5);
        expect(schema.state).toMatchObject({
          dtype: "float32",
          featureName: "observation.state",
          shape: [3],
        });
        expect(schema.state?.dimensions).toEqual([
          { index: 0, name: "shoulder" },
          { index: 1, name: "elbow" },
          { index: 2 },
        ]);
        expect(schema.action).toMatchObject({
          dtype: "float32",
          featureName: "action",
          shape: [2, 2],
        });
        expect(schema.action?.dimensions).toEqual([
          { index: 0 },
          { index: 1 },
          { index: 2 },
          { index: 3 },
        ]);
      });
    });

    it("returns state and action from the same selected row and cursor", async () => {
      await withSession(CANONICAL_SCENARIO, async (session) => {
        const entries = await allEntries(session, 5);
        const row = await session.capability.readAtTime({
          timestampNs: entries[1].timestampNs,
        });
        expect(row).not.toBeNull();
        expect(row?.cursor).toBe(entries[1].cursor);
        expect(row?.frameIndex).toBe(1);
        expect(row?.timestampNs).toBe(entries[1].timestampNs);
        expect(row?.state).toEqual([1.1, Number.NaN, 1.3]);
        expect(row?.action).toEqual([10, 11, 12, 13]);
        const exact = await session.capability.readAtCursor({
          cursor: entries[1].cursor,
        });
        expect(exact.cursor).toBe(entries[1].cursor);
        expect(exact.state).toEqual(row?.state);
        expect(exact.action).toEqual(row?.action);
      });
    });

    it("resolves time with latest-row-at-or-before semantics", async () => {
      await withSession(CANONICAL_SCENARIO, async (session) => {
        const entries = await allEntries(session, 5);
        const exact = await session.capability.readAtTime({
          timestampNs: entries[2].timestampNs,
        });
        expect(exact?.cursor).toBe(entries[2].cursor);
        const between = await session.capability.readAtTime({
          timestampNs: (entries[1].timestampNs + entries[2].timestampNs) / 2n,
        });
        expect(between?.cursor).toBe(entries[1].cursor);
        await expect(
          session.capability.readAtTime({
            timestampNs: entries[0].timestampNs - 1n,
          }),
        ).resolves.toBeNull();
        const atEnd = await session.capability.readAtTime({
          timestampNs: session.declaredEndNs,
        });
        expect(atEnd?.cursor).toBe(entries[4].cursor);
        await expect(
          session.capability.readAtTime({
            timestampNs: session.declaredEndNs + 1n,
          }),
        ).resolves.toBeNull();
      });
    });

    it("keeps cursor reads independent of interleaved time reads", async () => {
      await withSession(CANONICAL_SCENARIO, async (session) => {
        const entries = await allEntries(session, 5);
        const first = await session.capability.readAtCursor({
          cursor: entries[1].cursor,
        });
        await session.capability.readAtTime({
          timestampNs: entries[4].timestampNs,
        });
        const second = await session.capability.readAtCursor({
          cursor: entries[1].cursor,
        });
        expect(second).toEqual(first);
      });
    });

    it("walks every cursor exactly once through bounded index windows", async () => {
      await withSession(CANONICAL_SCENARIO, async (session) => {
        const start = await session.capability.readIndexWindow({
          after: 0,
          anchorTimestampNs: 0n,
          before: 5,
        });
        expect(start.hasPrevious).toBe(false);
        let cursor = start.entries[0].cursor;
        const visited: string[] = [];
        for (;;) {
          visited.push(cursor);
          const window = await session.capability.readIndexWindow({
            after: 1,
            anchorCursor: cursor,
            before: 0,
          });
          expect(window.selectedCursor).toBe(cursor);
          expect(window.entries[0].cursor).toBe(cursor);
          const next = window.entries[1];
          if (!next) {
            expect(window.hasNext).toBe(false);
            break;
          }
          cursor = next.cursor;
        }
        expect(visited).toHaveLength(5);
        expect(new Set(visited).size).toBe(5);
      });
    });

    it("shares one physical fill and never rereads after it", async () => {
      await withSession(CANONICAL_SCENARIO, async (session) => {
        if (!session.physicalReads) return;
        const entries = await allEntries(session, 5);
        expect(session.physicalReads()).toBe(0);
        await Promise.all([
          session.capability.readAtTime({
            timestampNs: entries[0].timestampNs,
          }),
          session.capability.readAtTime({
            timestampNs: entries[3].timestampNs,
          }),
        ]);
        expect(session.physicalReads()).toBe(1);
        await session.capability.readAtCursor({ cursor: entries[2].cursor });
        await session.capability.readAtTime({
          timestampNs: entries[4].timestampNs,
        });
        await session.capability.readIndexWindow({
          after: 2,
          anchorCursor: entries[2].cursor,
          before: 2,
        });
        expect(session.physicalReads()).toBe(1);
      });
    });

    it("rejects an aborted read without poisoning the shared fill", async () => {
      await withSession(
        { ...CANONICAL_SCENARIO, fillLatencyMs: 20 },
        async (session) => {
          const entries = await allEntries(session, 5);
          const controller = new AbortController();
          const aborted = session.capability.readAtTime({
            signal: controller.signal,
            timestampNs: entries[1].timestampNs,
          });
          controller.abort();
          await expect(aborted).rejects.toSatisfy(isEpisodeReadCancelledError);
          const row = await session.capability.readAtTime({
            timestampNs: entries[1].timestampNs,
          });
          expect(row?.state).toEqual([1.1, Number.NaN, 1.3]);
          if (session.physicalReads) {
            expect(session.physicalReads()).toBe(1);
          }
        },
      );
    });

    it("preserves booleans and integers without float coercion", async () => {
      await withSession(
        {
          action: {
            dtype: "int64",
            rows: [
              [1n, -2n],
              [3n, 4n],
            ],
            shape: [2],
          },
          state: {
            dtype: "bool",
            rows: [
              [true, false],
              [false, true],
            ],
            shape: [2],
          },
          timestampsSeconds: [0, 0.1],
        },
        async (session) => {
          const entries = await allEntries(session, 2);
          const row = await session.capability.readAtCursor({
            cursor: entries[0].cursor,
          });
          expect(row.state).toEqual([true, false]);
          expect(row.state?.every((value) => typeof value === "boolean")).toBe(
            true,
          );
          expect(row.action).toEqual([1n, -2n]);
          expect(row.action?.every((value) => typeof value === "bigint")).toBe(
            true,
          );
        },
      );
    });

    it("omits an undeclared feature instead of inventing values", async () => {
      await withSession(
        {
          action: {
            dtype: "float32",
            rows: [[1, 2]],
            shape: [2],
          },
          timestampsSeconds: [0],
        },
        async (session) => {
          expect(session.capability.schema.state).toBeUndefined();
          expect(session.capability.schema.action).toBeDefined();
          const entries = await allEntries(session, 1);
          const row = await session.capability.readAtCursor({
            cursor: entries[0].cursor,
          });
          expect(row.state).toBeUndefined();
          expect(row.action).toEqual([1, 2]);
          expect(row.featureErrors).toBeUndefined();
        },
      );
    });

    it("reports a shape mismatch without padding or truncating values", async () => {
      await withSession(
        {
          state: {
            dtype: "float32",
            rows: [
              [1, 2, 3],
              [4, 5],
            ],
            shape: [3],
          },
          timestampsSeconds: [0, 0.1],
        },
        async (session) => {
          const entries = await allEntries(session, 2);
          const healthy = await session.capability.readAtCursor({
            cursor: entries[0].cursor,
          });
          expect(healthy.state).toEqual([1, 2, 3]);
          expect(healthy.featureErrors).toBeUndefined();
          const malformed = await session.capability.readAtCursor({
            cursor: entries[1].cursor,
          });
          expect(malformed.state).toEqual([4, 5]);
          expect(malformed.featureErrors?.state).toBeTruthy();
        },
      );
    });

    it("resolves tasks through the ladder without blocking on any rung", async () => {
      await withSession(CANONICAL_SCENARIO, async (session) => {
        const entries = await allEntries(session, 5);
        const mapped = await session.capability.readAtCursor({
          cursor: entries[0].cursor,
        });
        expect(mapped.task).toEqual({ index: 0, label: "fold the towel" });
        const secondTask = await session.capability.readAtCursor({
          cursor: entries[2].cursor,
        });
        expect(secondTask.task).toEqual({ index: 1, label: "stack the cube" });
        const unknown = await session.capability.readAtCursor({
          cursor: entries[4].cursor,
        });
        expect(unknown.task).toEqual({ index: 7 });
      });
      await withSession(
        {
          episodeTasks: ["only task"],
          state: { dtype: "float32", rows: [[1]], shape: [1] },
          taskIndexes: [3],
          timestampsSeconds: [0],
        },
        async (session) => {
          const entries = await allEntries(session, 1);
          const row = await session.capability.readAtCursor({
            cursor: entries[0].cursor,
          });
          expect(row.task).toEqual({ index: 3, label: "only task" });
        },
      );
      await withSession(
        {
          episodeTasks: ["one", "two"],
          state: { dtype: "float32", rows: [[1]], shape: [1] },
          taskIndexes: [5],
          timestampsSeconds: [0],
        },
        async (session) => {
          const entries = await allEntries(session, 1);
          const row = await session.capability.readAtCursor({
            cursor: entries[0].cursor,
          });
          expect(row.task).toEqual({ index: 5 });
        },
      );
    });

    it("rejects unknown or foreign cursors with a typed error", async () => {
      await withSession(CANONICAL_SCENARIO, async ({ capability }) => {
        await expect(
          capability.readAtCursor({ cursor: "row:99" }),
        ).rejects.toSatisfy(isEpisodeExactCursorError);
        await expect(
          capability.readAtCursor({ cursor: "bogus" }),
        ).rejects.toSatisfy(isEpisodeExactCursorError);
        await expect(
          capability.readIndexWindow({
            after: 1,
            anchorCursor: "row:99",
            before: 1,
          }),
        ).rejects.toSatisfy(isEpisodeExactCursorError);
      });
    });

    it("cancels reads after disposal", async () => {
      const session = await createSession(CANONICAL_SCENARIO);
      const entries = await allEntries(session, 5);
      session.dispose();
      await expect(
        session.capability.readAtTime({ timestampNs: entries[0].timestampNs }),
      ).rejects.toSatisfy(isEpisodeReadCancelledError);
      await expect(
        session.capability.readAtCursor({ cursor: entries[0].cursor }),
      ).rejects.toSatisfy(isEpisodeReadCancelledError);
    });
  });
}
