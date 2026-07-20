import { describe, expect, it } from "vitest";
import type { EpisodeSession, FrameBatch } from "../ports";
import { isEpisodeReadCancelledError } from "../ports";

/** Factory used to run the shared format-adapter behavioral contract. */
export interface EpisodeSessionContractHarness {
  readonly createSession: () => Promise<EpisodeSession>;
  readonly name: string;
}

/** Defines the reusable behavioral contract every format adapter must pass. */
export function defineEpisodeSessionContractTests({
  createSession,
  name,
}: EpisodeSessionContractHarness): void {
  describe(`${name} episode session contract`, () => {
    it("reopens with deterministic, unique stream ids and coherent time", async () => {
      const first = await createSession();
      const second = await createSession();
      try {
        const firstIds = first.manifest.streams.map((stream) => stream.id);
        const secondIds = second.manifest.streams.map((stream) => stream.id);
        expect(new Set(firstIds).size).toBe(firstIds.length);
        expect(secondIds).toEqual(firstIds);
        expect(first.manifest.timeRange.endNs).toBeGreaterThanOrEqual(
          first.manifest.timeRange.startNs,
        );
        for (const stream of first.manifest.streams) {
          expect(stream.timeRange.endNs).toBeGreaterThanOrEqual(
            stream.timeRange.startNs,
          );
        }
      } finally {
        first.dispose();
        second.dispose();
      }
    });

    it("streams ordered, in-window, cloneable frame batches", async () => {
      const session = await createSession();
      try {
        const window = session.manifest.timeRange;
        const batches = await collectBatches(
          session.read({
            priority: "current",
            streams: session.manifest.streams.map((stream) => stream.id),
            window,
          }),
        );
        expect(batches.length).toBeGreaterThan(0);
        for (const batch of batches) {
          const cloned = structuredClone(batch);
          expect(cloned.stream).toBe(batch.stream);
          expect(cloned.frames).toHaveLength(batch.frames.length);
          let previous: bigint | undefined;
          for (const frame of batch.frames) {
            expect(frame.streamId).toBe(batch.stream);
            expect(frame.timestampNs).toBeGreaterThanOrEqual(window.startNs);
            expect(frame.timestampNs).toBeLessThanOrEqual(window.endNs);
            if (previous !== undefined) {
              expect(frame.timestampNs).toBeGreaterThanOrEqual(previous);
            }
            expect(frame.output.resourceHints?.transferables).toBeDefined();
            previous = frame.timestampNs;
          }
        }
      } finally {
        session.dispose();
      }
    });

    it("observes per-read abort signals", async () => {
      const session = await createSession();
      const controller = new AbortController();
      controller.abort();
      try {
        const iterator = session
          .read({
            signal: controller.signal,
            streams: [session.manifest.streams[0].id],
            window: session.manifest.timeRange,
          })
          [Symbol.asyncIterator]();
        await expect(iterator.next()).rejects.toMatchObject({
          name: "AbortError",
        });
      } finally {
        session.dispose();
      }
    });

    it("disposes idempotently and cancels subsequent reads canonically", async () => {
      const session = await createSession();
      session.dispose();
      session.dispose();
      const iterator = session
        .read({
          streams: [session.manifest.streams[0].id],
          window: session.manifest.timeRange,
        })
        [Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toSatisfy(
        isEpisodeReadCancelledError,
      );
    });

    it("reports monotone source stats", async () => {
      const session = await createSession();
      try {
        if (!session.stats) return;
        const before = session.stats();
        await collectBatches(
          session.read({
            streams: [session.manifest.streams[0].id],
            window: session.manifest.timeRange,
          }),
        );
        const after = session.stats();
        expect(after.capturedAtMs).toBeGreaterThanOrEqual(before.capturedAtMs);
        expect(after.decodedFrames).toBeGreaterThanOrEqual(
          before.decodedFrames,
        );
        expect(after.readRequests).toBeGreaterThanOrEqual(before.readRequests);
        expect(after.returnedBatches).toBeGreaterThanOrEqual(
          before.returnedBatches,
        );
      } finally {
        session.dispose();
      }
    });
  });
}

/** Collects a bounded contract-test read into cloneable batches. */
export async function collectBatches(
  iterable: AsyncIterable<FrameBatch>,
): Promise<readonly FrameBatch[]> {
  const batches: FrameBatch[] = [];
  for await (const batch of iterable) batches.push(batch);
  return batches;
}
