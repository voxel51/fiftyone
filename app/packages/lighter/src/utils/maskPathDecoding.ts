/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Off-main-thread `mask_path` decode. URL resolution stays on the main thread
 * (so we can reuse `getSampleSrc` without porting state plumbing into the
 * worker), and a small pool of workers handles fetch + decode.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
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
