import { serializeCacheKey } from "../cache-utils";
import { byteSourceCacheKey } from "./cache";
import type {
  ByteFillLockManager,
  ByteRangeReadRequest,
  ByteSourceDescriptor,
} from "./types";

/**
 * Cross-context single-flight for network block fills.
 *
 * Every worker lane owns a private in-memory cache and in-flight map, so
 * identical block fills racing across contexts each pay a network fetch —
 * the persistent layer only helps after the first fetch has landed. Web
 * Locks are origin-scoped like the Cache API, so an exclusive lock per fill
 * shape turns that race into one fetch plus persistent-cache handoffs,
 * across lanes and even across tabs playing the same source.
 */

const FILL_LOCK_PREFIX = "fo-multimodal-fill-v1";

const FILL_SLOT_PREFIX = "fo-multimodal-fill-slot-v1";

/**
 * Concurrent network block fills allowed per source, across every context
 * that can issue them. Fills that share a link divide its bandwidth, so an
 * unbounded queue makes the block a sequential consumer needs *now* finish
 * behind speculative work started earlier — measured as multi-second fill
 * completions and playhead freezes under saturation. Three slots keep
 * cold-start parallelism (mixed head fills) and let readahead ride the
 * spare slot in steady state, while bounding the backlog the front block
 * can be stuck behind; fewer slots measurably slowed time-to-first-frame
 * without moving in-play stall on deficit links.
 */
export const REMOTE_FILL_SLOTS = 3;

/**
 * Returns the runtime `navigator.locks` manager when available (secure
 * contexts, including dedicated workers), else undefined.
 */
export function defaultByteFillLockManager(): ByteFillLockManager | undefined {
  const locks = (globalThis as { navigator?: { locks?: ByteFillLockManager } })
    .navigator?.locks;

  return locks && typeof locks.request === "function" ? locks : undefined;
}

/**
 * Lock name for one fill shape, aligned with persistent-cache entry
 * identity (content id + discovered size + exact fill range) so contexts
 * that would share a persistent entry contend on the same lock.
 */
export function byteFillLockName(request: ByteRangeReadRequest): string {
  return serializeCacheKey([
    FILL_LOCK_PREFIX,
    byteSourceCacheKey(request.source),
    request.source.sizeBytes ?? "size-unknown",
    request.range.offset.toString(),
    request.range.length.toString(),
  ]);
}

/**
 * Lock name for one of a source's fill slots. Slots are per source so two
 * tabs on different recordings never starve each other through the
 * origin-scoped lock table.
 */
export function byteFillSlotName(
  source: ByteSourceDescriptor,
  slot: number,
): string {
  return serializeCacheKey([
    FILL_SLOT_PREFIX,
    byteSourceCacheKey(source),
    String(slot),
  ]);
}

/**
 * First slot a fill class may use. Priority fills (interactive and foreground
 * playback lanes) may take any slot including slot 0; background fills
 * (paused inspection, idle lookahead, bulk history scans, speculative
 * readahead) start at slot 1 — so however deep the background queue grows, the
 * playhead's next fill always has slot 0 waiting for it.
 *
 * Lock-ordering invariant: a class with floor 0 must acquire its shape before
 * any slot; a class with floor above 0 must acquire one eligible slot before
 * it waits for its shape, and a shape holder must never wait for a second
 * slot. Thus slot 0 is a progress path whose holder never waits on a shape,
 * preventing the mixed ordering from forming a lock cycle. Any new slot class
 * or ordering change must preserve this invariant.
 */
export function byteFillSlotFloor(
  slotClass: "background" | "priority" | undefined,
): number {
  return slotClass === "background" ? 1 : 0;
}

/**
 * Acquires any free fill slot at or above `floorSlot`, waiting in grant
 * order when all are busy. Resolves with the release function; rejects
 * when `signal` aborts first. Demand fills use this — their wait is what
 * keeps arrival order aligned with need order under saturation.
 */
export function acquireByteFillSlot(
  locks: ByteFillLockManager,
  source: ByteSourceDescriptor,
  signal?: AbortSignal,
  floorSlot = 0,
): Promise<() => void> {
  return new Promise<() => void>((resolve, reject) => {
    let winner = false;
    const slots: number[] = [];
    for (let slot = floorSlot; slot < REMOTE_FILL_SLOTS; slot++) {
      slots.push(slot);
    }
    let pending = slots.length;
    let lastError: unknown;
    const controllers = slots.map(() => new AbortController());

    // One request per slot races for the first grant; the losers' pending
    // requests are aborted so they leave the slot queues immediately.
    if (signal) {
      const abortAll = () => {
        for (const controller of controllers) {
          controller.abort(signal.reason);
        }
      };
      if (signal.aborted) {
        abortAll();
      } else {
        signal.addEventListener("abort", abortAll, { once: true });
      }
    }

    controllers.forEach((controller, index) => {
      locks
        .request(
          byteFillSlotName(source, slots[index]),
          { mode: "exclusive", signal: controller.signal },
          () => {
            if (winner) {
              // A sibling grant settled first — hand this slot straight
              // back by returning.
              return undefined;
            }
            winner = true;
            for (const [other, otherController] of controllers.entries()) {
              if (other !== index) {
                otherController.abort();
              }
            }
            // Hold the slot until the caller releases it.
            return new Promise<void>((releaseSlot) => {
              resolve(() => releaseSlot());
            });
          },
        )
        .catch((error) => {
          lastError = error;
          pending -= 1;
          if (!winner && pending === 0) {
            reject(lastError);
          }
        });
    });
  });
}

/**
 * Takes a fill slot at or above `floorSlot` only if one is free right
 * now, else `undefined`. Speculative fills (readahead) use this so they
 * run strictly in the link's spare capacity and never queue in front of
 * demand.
 */
export async function tryAcquireByteFillSlot(
  locks: ByteFillLockManager,
  source: ByteSourceDescriptor,
  floorSlot = 0,
): Promise<(() => void) | undefined> {
  for (let slot = floorSlot; slot < REMOTE_FILL_SLOTS; slot++) {
    const acquired = await new Promise<(() => void) | undefined>((resolve) => {
      locks
        .request(
          byteFillSlotName(source, slot),
          { ifAvailable: true, mode: "exclusive" },
          (lock) => {
            if (!lock) {
              resolve(undefined);
              return undefined;
            }
            return new Promise<void>((releaseSlot) => {
              resolve(() => releaseSlot());
            });
          },
        )
        .catch(() => resolve(undefined));
    });
    if (acquired) {
      return acquired;
    }
  }
  return undefined;
}
