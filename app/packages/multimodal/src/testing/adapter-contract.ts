import { describe, expect, it } from "vitest";
import {
  readSynchronizedFallback,
  readSynchronizedPlaybackFallback,
  readSynchronizedWindow,
  readTransformsFallback,
  readTransformWindow,
} from "../runtime";
import type {
  EpisodeSession,
  FrameBatch,
  ReadPriority,
  ReadRequest,
} from "../ports";
import { isEpisodeReadCancelledError } from "../ports";

/** Factory used to run the shared format-adapter behavioral contract. */
export interface EpisodeSessionContractHarness {
  /** Creates two sessions owned by one adapter for activation-cancellation checks. */
  readonly createActivationPair?: () => Promise<
    readonly [EpisodeSession, EpisodeSession]
  >;
  /** Creates a session whose reads stay pending long enough to test pressure. */
  readonly createDelayedSession?: () => Promise<EpisodeSession>;
  /** Creates a session with one contained payload failure. */
  readonly createPoisonedSession?: () => Promise<{
    readonly session: EpisodeSession;
    readonly streamId: string;
  }>;
  readonly createSession: () => Promise<EpisodeSession>;
  readonly name: string;
}

/** Defines the reusable behavioral contract every format adapter must pass. */
export function defineEpisodeSessionContractTests({
  createActivationPair,
  createDelayedSession,
  createPoisonedSession,
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
        expect(first.manifest.timeDomain.id).not.toBe("");
        expect(["duration", "sequence", "timestamp"]).toContain(
          first.manifest.timeDomain.kind,
        );
        if (first.manifest.timeDomain.kind !== "timestamp") {
          expect(first.manifest.timeDomain.originNs).toBeDefined();
        }
        for (const stream of first.manifest.streams) {
          expect(stream.timeRange.endNs).toBeGreaterThanOrEqual(
            stream.timeRange.startNs,
          );
          expect(stream.timeRange.startNs).toBeGreaterThanOrEqual(
            first.manifest.timeRange.startNs,
          );
          expect(stream.timeRange.endNs).toBeLessThanOrEqual(
            first.manifest.timeRange.endNs,
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
        const previousByStream = new Map<string, bigint>();
        for (const batch of batches) {
          const cloned = structuredClone(batch);
          expect(cloned.stream).toBe(batch.stream);
          expect(cloned.frames).toHaveLength(batch.frames.length);
          for (const frame of batch.frames) {
            expect(frame.streamId).toBe(batch.stream);
            expect(frame.timestampNs).toBeGreaterThanOrEqual(window.startNs);
            expect(frame.timestampNs).toBeLessThanOrEqual(window.endNs);
            const previous = previousByStream.get(batch.stream);
            if (previous !== undefined) {
              expect(frame.timestampNs).toBeGreaterThanOrEqual(previous);
            }
            expect(frame.output.resourceHints?.transferables).toBeDefined();
            previousByStream.set(batch.stream, frame.timestampNs);
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

    if (createDelayedSession) {
      it("observes aborts after a read is already in flight", async () => {
        const session = await createDelayedSession();
        const controller = new AbortController();
        try {
          const pending = session
            .read({
              signal: controller.signal,
              streams: [session.manifest.streams[0].id],
              window: session.manifest.timeRange,
            })
            [Symbol.asyncIterator]()
            .next();
          controller.abort();
          await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        } finally {
          session.dispose();
        }
      });

      it("does not let speculative lanes starve current or playback reads", async () => {
        const session = await createDelayedSession();
        const stream = session.manifest.streams[0].id;
        const completion: ReadPriority[] = [];
        const request = (priority: ReadPriority) =>
          collectBatches(
            session.read({
              priority,
              streams: [stream],
              window: session.manifest.timeRange,
            }),
          ).then(() => completion.push(priority));
        try {
          await Promise.all([request("idle"), request("current")]);
          expect(completion).toEqual(["current", "idle"]);
        } finally {
          session.dispose();
        }
      });

      it("canonically cancels queued and in-flight speculative work", async () => {
        const session = await createDelayedSession();
        try {
          const pending = session
            .read({
              priority: "idle",
              streams: [session.manifest.streams[0].id],
              window: session.manifest.timeRange,
            })
            [Symbol.asyncIterator]()
            .next();
          session.cancelIdle?.();
          await expect(pending).rejects.toSatisfy(isEpisodeReadCancelledError);
        } finally {
          session.dispose();
        }
      });

      it("does not cancel current work when speculative work is discarded", async () => {
        const session = await createDelayedSession();
        try {
          const pending = collectBatches(
            session.read({
              priority: "current",
              streams: [session.manifest.streams[0].id],
              window: session.manifest.timeRange,
            }),
          );
          session.cancelIdle?.();
          await expect(pending).resolves.not.toHaveLength(0);
        } finally {
          session.dispose();
        }
      });

      it("canonically cancels a read that is in flight during disposal", async () => {
        const session = await createDelayedSession();
        const pending = session
          .read({
            streams: [session.manifest.streams[0].id],
            window: session.manifest.timeRange,
          })
          [Symbol.asyncIterator]()
          .next();
        session.dispose();
        await expect(pending).rejects.toSatisfy(isEpisodeReadCancelledError);
      });
    }

    if (createActivationPair) {
      it("activation canonically cancels the previous source", async () => {
        const [first, second] = await createActivationPair();
        try {
          first.activate?.();
          const pending = first
            .read({
              streams: [first.manifest.streams[0].id],
              window: first.manifest.timeRange,
            })
            [Symbol.asyncIterator]()
            .next();
          second.activate?.();
          await expect(pending).rejects.toSatisfy(isEpisodeReadCancelledError);
        } finally {
          first.dispose();
          second.dispose();
        }
      });
    }

    if (createPoisonedSession) {
      it("contains a poisoned payload as a per-stream diagnostic", async () => {
        const { session, streamId } = await createPoisonedSession();
        try {
          const batches = await collectBatches(
            session.read({
              streams: [streamId],
              window: session.manifest.timeRange,
            }),
          );
          const frames = batches.flatMap((batch) => batch.frames);
          expect(frames.length).toBeGreaterThan(1);
          expect(
            frames.some((frame) => (frame.output.diagnostics?.length ?? 0) > 0),
          ).toBe(true);
          expect(
            frames.some((frame) => !frame.output.diagnostics?.length),
          ).toBe(true);
        } finally {
          session.dispose();
        }
      });
    }

    it("keeps optional accelerations equivalent to mandatory-read fallbacks", async () => {
      const session = await createSession();
      const request: ReadRequest = {
        streams: session.manifest.streams.map((stream) => stream.id),
        window: session.manifest.timeRange,
      };
      try {
        if (session.synchronizedRead) {
          expect(await readSynchronizedWindow(session, request)).toEqual(
            await readSynchronizedFallback(session, request),
          );
        }
        if (session.transformRead) {
          expect(await readTransformWindow(session, request)).toEqual(
            await readTransformsFallback(session, request),
          );
        }
        if (session.playback) {
          const playbackRequest = {
            streams: [session.manifest.streams[0].id],
            timeNs: session.manifest.timeRange.startNs,
          };
          expect(
            withoutUndefinedFields(
              await session.playback.readSynchronized(playbackRequest),
            ),
          ).toEqual(
            withoutUndefinedFields(
              await readSynchronizedPlaybackFallback(session, playbackRequest),
            ),
          );
        }
      } finally {
        session.dispose();
      }
    });

    it("preserves pull-based backpressure for a stalled consumer", async () => {
      const session = await createSession();
      const iterator = session
        .read({
          streams: session.manifest.streams.map((stream) => stream.id),
          window: session.manifest.timeRange,
        })
        [Symbol.asyncIterator]();
      try {
        const first = await iterator.next();
        expect(first.done).toBe(false);
        if (session.stats) {
          expect(session.stats().returnedBatches).toBe(1);
        }
      } finally {
        await iterator.return?.();
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

function withoutUndefinedFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutUndefinedFields);
  }
  if (value && typeof value === "object") {
    if (
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value) ||
      value instanceof Date
    ) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, withoutUndefinedFields(entry)]),
    );
  }
  return value;
}

/** Collects a bounded contract-test read into cloneable batches. */
export async function collectBatches(
  iterable: AsyncIterable<FrameBatch>,
): Promise<readonly FrameBatch[]> {
  const batches: FrameBatch[] = [];
  for await (const batch of iterable) batches.push(batch);
  return batches;
}
