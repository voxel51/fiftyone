// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import {
  getIsBuffering,
  getIsPlaying,
  getIsPlayPending,
  getPlayhead,
} from "@fiftyone/playback/runtime";
import React, { useEffect, useMemo } from "react";
import { createMultimodalQueryClient } from "../../query";
import {
  BYTE_SOURCE_READ_PROFILE,
  byteSourceAccessKey,
  createMemoryByteRangeCache,
  createZonedRemoteBlockSize,
  type ByteClient,
  type ByteSourceDescriptor,
} from "../../query/bytes";
import type { PlaybackReadCapability } from "../../ports";
import { shouldDeferEpisodeIdleWorkForStore } from "./episode-network-health";
import {
  episodeBankingEndOffset,
  episodeBankingStartOffset,
  runEpisodeByteBankingPass,
} from "./episode-paused-byte-banking";

/**
 * Let the modal's first-paint burst and the trajectory scan's opening
 * reads claim the link before opportunistic banking joins in.
 */
const BANKING_START_DELAY_MS = 2_500;

/**
 * Re-check cadence while banking is standing down (playback active,
 * network starved, or a recent seek owning the link).
 */
const BANKING_RETRY_MS = 2_000;

/**
 * Consecutive failed passes before giving up on the source for this
 * mount. Failures here are network errors — the demand path owns real
 * retries, banking just stops volunteering.
 */
const BANKING_MAX_FAILURES = 3;

/**
 * The banker's private L1 stays tiny on purpose: its job is writing the
 * shared persistent layer, and hot blocks belong to the lanes that
 * actually consume them.
 */
const BANKING_MEMORY_CACHE_BYTES = 8 * 1024 * 1024;

let sharedBankingByteClient: ByteClient | undefined;

function bankingByteClient(): ByteClient {
  sharedBankingByteClient ??= createMultimodalQueryClient({
    caches: {
      bytes: {
        fillSlotClass: "background",
        memory: createMemoryByteRangeCache({
          maxSizeBytes: BANKING_MEMORY_CACHE_BYTES,
        }),
      },
    },
  }).bytes;
  return sharedBankingByteClient;
}

/**
 * Non-visual bridge that banks a paused remote recording's bytes into the
 * shared persistent cache, playhead-forward with head wrap-around. It
 * stands down the moment playback (or a starved link) needs the wire and
 * resumes from the current playhead when idle returns; regions that are
 * already banked cost one cache probe per block. Runs only where the
 * persistent layer exists — without it there is nowhere to bank to.
 */
export const EpisodePausedByteBanking: React.FC<{
  readonly playback: PlaybackReadCapability | null;
  readonly source: ByteSourceDescriptor | null;
}> = ({ playback, source }) => {
  const store = usePlaybackStore();
  const sourceKey = source ? byteSourceAccessKey(source) : null;
  const remote = source?.readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE;

  // A pure function of offset — the same zoned grid the demand path
  // fills on, so banked shapes dedupe with fills exactly.
  const zonedBlockSize = useMemo(() => createZonedRemoteBlockSize(), []);

  // This effect owns one banking lifecycle per (source, store): an idle
  // delay, gated pass attempts with stand-down retries, and teardown on
  // source change or unmount.
  useEffect(() => {
    if (!source || !sourceKey || !remote || !playback) {
      return undefined;
    }
    if (typeof globalThis.caches === "undefined") {
      return undefined;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    let failures = 0;

    const shouldStandDown = (): boolean =>
      getIsPlaying(store) ||
      getIsPlayPending(store) ||
      getIsBuffering(store) ||
      shouldDeferEpisodeIdleWorkForStore(store, null);

    const scheduleRetry = (delayMs: number) => {
      if (cancelled || retryTimeout !== null || done) {
        return;
      }
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        void attempt();
      }, delayMs);
    };

    const attempt = async () => {
      if (cancelled || done) {
        return;
      }
      if (shouldStandDown()) {
        scheduleRetry(BANKING_RETRY_MS);
        return;
      }

      try {
        const bytes = bankingByteClient();
        // The banked grid must match the worker lanes' fill grid, and
        // that grid depends on the resolved source size.
        const resolved = source.sizeBytes
          ? source
          : ((await bytes.stat?.(source)) ?? source);
        if (cancelled || !resolved.sizeBytes) {
          return;
        }
        const range = playback.timeline;
        const byteTimeline = range.byteTimeline;
        if (cancelled || !byteTimeline || byteTimeline.length === 0) {
          return;
        }
        const endOffset = episodeBankingEndOffset(byteTimeline);
        const playheadTimeNs =
          range.startNs +
          BigInt(Math.round(getPlayhead(store) * 1_000_000_000));

        const outcome = await runEpisodeByteBankingPass({
          blockSizeBytesFor: (offset) =>
            zonedBlockSize({
              range: { length: 1n, offset },
              source: resolved,
            }),
          bytes,
          endOffset,
          fromOffset: episodeBankingStartOffset(byteTimeline, playheadTimeNs),
          shouldStop: () => cancelled || shouldStandDown(),
          source: resolved,
        });
        if (cancelled) {
          return;
        }
        if (outcome === "completed") {
          done = true;
          return;
        }
        failures = outcome === "failed" ? failures + 1 : 0;
        if (failures < BANKING_MAX_FAILURES) {
          scheduleRetry(BANKING_RETRY_MS);
        }
      } catch {
        failures += 1;
        if (!cancelled && failures < BANKING_MAX_FAILURES) {
          scheduleRetry(BANKING_RETRY_MS);
        }
      }
    };

    scheduleRetry(BANKING_START_DELAY_MS);

    return () => {
      cancelled = true;
      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
      }
    };
  }, [playback, remote, source, sourceKey, store, zonedBlockSize]);

  return null;
};
