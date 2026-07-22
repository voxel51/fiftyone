// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import {
  getIsBuffering,
  getIsPlaying,
  getIsPlayPending,
  getPlayhead,
} from "@fiftyone/playback/runtime";
import React, { useEffect } from "react";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../../ir";
import type { PlaybackReadCapability } from "../../../ports";
import { bankEpisodeBytes, episodeSourceAccessKey } from "../../../runtime";
import { shouldDeferIdleWorkForStore } from "./network-health";

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
 * Non-visual bridge that banks a paused remote recording's bytes into the
 * shared persistent cache, playhead-forward with head wrap-around. It
 * stands down the moment playback (or a starved link) needs the wire and
 * resumes from the current playhead when idle returns; regions that are
 * already banked cost one cache probe per block. Runs only where the
 * persistent layer exists — without it there is nowhere to bank to.
 */
export const PausedByteBanking: React.FC<{
  readonly playback: PlaybackReadCapability | null;
  readonly source: ByteSourceDescriptor | null;
}> = ({ playback, source }) => {
  const store = usePlaybackStore();
  const sourceKey = source ? episodeSourceAccessKey(source) : null;
  const remote = source?.readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE;

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
      shouldDeferIdleWorkForStore(store, null);

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
        const range = playback.timeline;
        const playheadTimeNs =
          range.startNs +
          BigInt(Math.round(getPlayhead(store) * 1_000_000_000));

        const outcome = await bankEpisodeBytes({
          playback,
          playheadTimeNs,
          shouldStop: () => cancelled || shouldStandDown(),
          source,
        });
        if (cancelled) {
          return;
        }
        if (outcome === "completed" || outcome === "unavailable") {
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
  }, [playback, remote, source, sourceKey, store]);

  return null;
};
