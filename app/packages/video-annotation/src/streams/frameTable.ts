/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The presentation-order frame table of a source video: sorted per-frame
 * start times demuxed from the container header. On a video with dropped
 * frames the media timeline has gaps, so `time × fps` numbering (the html
 * `<video>` clock) drifts ahead of the decode/presentation-order numbering
 * that `to_frames` — and therefore every persisted frame label — uses. The
 * table restores the exact mapping in both directions.
 *
 * Only the `html` strategy needs it: the `extract` path decodes by sample
 * table already (its times are synthetic `(frame-1)/fps`), and the `fetch`
 * (ImaVid) path renders one image per frame.
 */

import { LRUCache } from "lru-cache";
import type {
  FrameTableMessage,
  FrameWorkerOutbound,
} from "./frameWorkerProtocol";

export interface FrameTable {
  /** Sorted presentation start times in seconds; index i ↔ frame i+1. */
  readonly timesSec: readonly number[];
}

/** Float guard for times that should land exactly on a frame boundary. */
const EPSILON_SEC = 1e-6;

/**
 * The 1-indexed frame on glass at `time`: the last frame whose start is at or
 * before it. Times before the first frame clamp to 1; past the last, to the
 * table's length.
 */
export const frameAtTableTime = (table: FrameTable, time: number): number => {
  const times = table.timesSec;

  if (times.length === 0) {
    return 1;
  }

  const target = time + EPSILON_SEC;
  let low = 0;
  let high = times.length - 1;
  let hit = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (times[mid] <= target) {
      hit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return hit + 1;
};

/** The presentation start time (seconds) of a 1-indexed frame, clamped. */
export const timeAtTableFrame = (table: FrameTable, frame: number): number => {
  const times = table.timesSec;

  if (times.length === 0) {
    return 0;
  }

  const index = Math.min(Math.max(Math.round(frame), 1), times.length) - 1;
  return times[index];
};

/** Give up (report no table) if the probe hasn't answered by now. */
const TABLE_TIMEOUT_MS = 15_000;

/**
 * Demux `videoSrc`'s header in the WebCodecs worker (`tableOnly` mode) and
 * return its frame table, or `null` when unavailable (non-MP4 container,
 * fetch failure, timeout) — callers fall back to `time × fps` numbering,
 * today's behavior. Never rejects.
 */
export function fetchFrameTable(
  videoSrc: string,
  opts: { headers?: Record<string, string> } = {},
): Promise<FrameTable | null> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("./videoDecodeWorker.ts", import.meta.url),
      { type: "module" },
    );

    let settled = false;

    const finish = (result: FrameTable | null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
      resolve(result);
    };

    const onMessage = (event: MessageEvent<FrameWorkerOutbound>) => {
      if (event.data?.type !== "frameTable") {
        return;
      }

      const msg = event.data as FrameTableMessage;
      finish(
        msg.timesMicros
          ? { timesSec: msg.timesMicros.map((us) => us / 1e6) }
          : null,
      );
    };

    const onError = () => finish(null);
    const timer = setTimeout(() => finish(null), TABLE_TIMEOUT_MS);

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({
      type: "init",
      videoSrc,
      headers: opts.headers,
      tableOnly: true,
    });
  });
}

/**
 * A long-video table is a few MB of floats — cap the cache at a handful of
 * recently-viewed sources rather than every sample paged through in a session.
 */
const TABLE_CACHE_MAX = 8;

/**
 * One in-flight/settled table promise per media URL — paging back to a recent
 * sample must not re-demux its header. Failures are cached too: a source that
 * can't demux won't start demuxing on retry.
 */
const tableCache = new LRUCache<string, Promise<FrameTable | null>>({
  max: TABLE_CACHE_MAX,
});

export function getFrameTable(
  videoSrc: string,
  opts: { headers?: Record<string, string> } = {},
): Promise<FrameTable | null> {
  let cached = tableCache.get(videoSrc);

  if (!cached) {
    cached = fetchFrameTable(videoSrc, opts);
    tableCache.set(videoSrc, cached);
  }

  return cached;
}
