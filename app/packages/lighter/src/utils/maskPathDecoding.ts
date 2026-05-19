/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Off-main-thread `mask_path` decode. URL resolution stays on the main thread
 * (so we can reuse `getSampleSrc` without porting state plumbing into the
 * worker), and a small pool of workers handles fetch + decode.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import { LRUCache } from "lru-cache";
import { v4 as uuidv4 } from "uuid";

import MaskPathDecodeWorker from "./maskPathDecodeWorker?worker&inline";
import type { DecodeResponse } from "./maskPathDecodeWorker";

// Minimum of 1 worker, maximum of 4 workers
const MAX_WORKERS = (() => {
  const hw =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 2;
  return Math.max(1, Math.min(4, hw));
})();

interface PendingJob {
  uuid: string;
  url: string;
  field: string;
  cls: string;
  resolve: (mask: OverlayMask | undefined) => void;
}

interface Slot {
  worker: Worker;
  job: PendingJob | null;
}

let slots: Slot[] | undefined;
const queue: PendingJob[] = [];

// Dedupe concurrent decodes for the same URL. Useful when two callers
// overlap — e.g. a slow cloud fetch with a re-entering effect.
const inFlight = new Map<string, Promise<OverlayMask | undefined>>();

// Cache resolved decodes. Sequential repeats of the same URL (the common
// case for fast local fetches where in-flight dedupe misses) get the
// cached `OverlayMask` instead of a fresh worker fetch.
//
// LRU-bounded so the cache stays memory-safe across long sessions with
// many unique masks. Sized by buffer byte count.
//
// The buffer is read-only from `MaskCanvas`'s perspective; multiple
// instances can share it safely.
const CACHE_MAX_BYTES = 128 * 1024 * 1024;
const cache = new LRUCache<string, OverlayMask>({
  maxSize: CACHE_MAX_BYTES,
  sizeCalculation: (mask) => mask.buffer.byteLength,
  ttl: 30_000, // 30 seconds; allow for frequent refresh
});

const supportsWorkers = (): boolean =>
  typeof Worker !== "undefined" && typeof window !== "undefined";

const bindWorker = (slot: Slot, worker: Worker): void => {
  slot.worker = worker;

  worker.addEventListener("message", (event: MessageEvent<DecodeResponse>) => {
    const job = slot.job;
    if (!job || job.uuid !== event.data.uuid) {
      // Stale message (e.g. after a respawn). Ignore.
      return;
    }
    slot.job = null;

    if (event.data.ok) {
      job.resolve(event.data.mask);
    } else {
      console.error("[decodeMaskPath] worker decode failed:", event.data.error);
      job.resolve(undefined);
    }

    drain();
  });

  worker.addEventListener("error", (event) => {
    console.error("[decodeMaskPath] worker crashed; respawning slot:", event);
    // Fail the in-flight job so one bad payload doesn't hang the caller.
    const failed = slot.job;
    slot.job = null;
    failed?.resolve(undefined);

    slot.worker.terminate();
    bindWorker(slot, new MaskPathDecodeWorker());

    drain();
  });
};

const createSlot = (): Slot => {
  const slot: Slot = { worker: undefined as unknown as Worker, job: null };

  bindWorker(slot, new MaskPathDecodeWorker());

  return slot;
};

const ensurePool = (): Slot[] | undefined => {
  if (slots) {
    return slots;
  }

  if (!supportsWorkers()) {
    return undefined;
  }

  slots = Array.from({ length: MAX_WORKERS }, () => createSlot());
  return slots;
};

const dispatch = (slot: Slot, job: PendingJob): void => {
  slot.job = job;
  slot.worker.postMessage({
    uuid: job.uuid,
    url: job.url,
    field: job.field,
    cls: job.cls,
  });
};

const drain = (): void => {
  if (!slots || queue.length === 0) {
    return;
  }

  for (const slot of slots) {
    if (queue.length === 0) {
      break;
    }

    if (slot.job) {
      continue;
    }

    const next = queue.shift()!;
    dispatch(slot, next);
  }
};

/**
 * Fetches a pre-resolved mask URL and decodes it into an {@link OverlayMask}.
 *
 * URL resolution is the caller's responsibility; the raw `mask_path` value
 * on a label is not always directly fetchable and must be mapped to a real
 * URL by the integration layer before reaching here.
 *
 * Returns `undefined` if the fetch or decode fails; callers should treat
 * this as "no mask available yet" and proceed without one.
 */
export async function decodeMaskPath(
  url: string,
  field: string,
  cls: string
): Promise<OverlayMask | undefined> {
  const cached = cache.get(url);
  if (cached) {
    console.debug(`[mask-path] cache hit for ${url}`);
    return cached;
  }

  const existing = inFlight.get(url);
  if (existing) {
    console.debug(`[mask-path] dedupe in-flight fetch for ${url}`);
    return existing;
  }

  const promise = decodeMaskPathImpl(url, field, cls);
  inFlight.set(url, promise);
  void promise
    .then((mask) => {
      if (mask) cache.set(url, mask);
    })
    .finally(() => inFlight.delete(url));

  return promise;
}

async function decodeMaskPathImpl(
  url: string,
  field: string,
  cls: string
): Promise<OverlayMask | undefined> {
  const pool = ensurePool();

  if (!pool) {
    // No worker support (SSR, tests). Fall back to a direct fetch+decode on
    // whatever thread we're on so callers still get a result.
    const { decodeMaskOnDisk } = await import(
      "@fiftyone/looker/src/worker/mask-decoder"
    );

    try {
      const response = await fetch(url);
      const blob = await response.blob();

      const mask = await decodeMaskOnDisk(blob, cls, field, {} as never);

      return mask ?? undefined;
    } catch (err) {
      console.error("[decodeMaskPath] fallback decode failed:", err);
      return undefined;
    }
  }

  return new Promise<OverlayMask | undefined>((resolve) => {
    const job: PendingJob = {
      uuid: uuidv4(),
      url,
      field,
      cls,
      resolve,
    };

    const free = pool.find((s) => !s.job);
    if (free) {
      dispatch(free, job);
    } else {
      queue.push(job);
    }
  });
}
