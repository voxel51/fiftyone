import type {
  SampleRendererProps,
  SampleRendererSampleLike,
} from "@fiftyone/plugins";
// The view-free runtime entry avoids loading playback view Relay fragments.
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import { getIsBuffering, getIsPlayPending } from "@fiftyone/playback/runtime";
import type { PlaybackStore } from "@fiftyone/playback/runtime";
import { modalNavigation } from "@fiftyone/state";
import { useEffect } from "react";
import { episodeSourceAccessKey, prewarmEpisodeSource } from "../../../runtime";
import {
  episodeByteSourceFromSample,
  episodeSourceFromByteSource,
  sampleDescriptorFromSample,
} from "../../session/episode-source";
import { getEpisodeNetworkHealth } from "./episode-network-health";

/** Settle time for the current sample before spending idle bandwidth. */
const PREWARM_START_DELAY_MS = 3_000;

/** Re-check cadence while playback or the network needs the link. */
const PREWARM_RETRY_DELAY_MS = 5_000;

/** Next first: forward navigation dominates modal browsing. */
const PREWARM_OFFSETS = [1, -1] as const;

// Session-scoped: the persistent byte cache outlives mounts, so a source
// warmed once stays warm and re-parsing its summary would only burn idle
// time on repeats.
const prewarmedSourceKeys = new Set<string>();

/**
 * Non-visual worker that prewarms the adjacent samples' startup bytes at
 * idle: after a settle delay (and only while playback is not waiting on
 * data and the network is not limited), it peeks the modal's neighbors,
 * builds their episode sources, and warms the shared persistent byte cache
 * so the hop's cold reads skip the network. Mount inside the playback
 * shell — it reads the shell's store for the buffering and health gates.
 */
export function EpisodeAdjacentSamplePrewarm({
  ctx,
}: {
  readonly ctx: SampleRendererProps["ctx"];
}) {
  const store = usePlaybackStore();
  const mediaField = ctx.media.field;
  const mediaType = ctx.dataset.mediaType;
  const currentSample = ctx.sample.sample as { _id?: string; id?: string };
  const sampleId = currentSample._id ?? currentSample.id;

  // This effect schedules the advisory prewarm pass for the mounted
  // source's neighbors: browser-idle callback after a settle delay,
  // re-scheduled while the link is needed elsewhere, aborted on unmount.
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const schedule = (delayMs: number) => {
      if (disposed) {
        return;
      }
      timer = setTimeout(() => runAtIdle(pass), delayMs);
    };

    const pass = async () => {
      if (disposed) {
        return;
      }
      if (shouldYieldLink(store)) {
        schedule(PREWARM_RETRY_DELAY_MS);
        return;
      }

      const peek = modalNavigation.get()?.peek;
      if (!peek) {
        return;
      }

      for (const offset of PREWARM_OFFSETS) {
        if (disposed) {
          return;
        }
        if (shouldYieldLink(store)) {
          schedule(PREWARM_RETRY_DELAY_MS);
          return;
        }

        try {
          const neighbor = await peek(offset);
          const neighborSample = neighbor?.sample as
            | SampleRendererSampleLike
            | undefined;
          if (!neighborSample) {
            continue;
          }
          const source = episodeByteSourceFromSample(
            neighborSample,
            mediaField,
          );
          if (!source) {
            continue;
          }

          const sourceKey = episodeSourceAccessKey(source);
          if (prewarmedSourceKeys.has(sourceKey)) {
            continue;
          }

          const prewarmed = await prewarmEpisodeSource(
            sampleDescriptorFromSample(neighborSample, mediaField, mediaType),
            episodeSourceFromByteSource(source),
            abort.signal,
          );
          if (prewarmed && !abort.signal.aborted) {
            prewarmedSourceKeys.add(sourceKey);
          }
        } catch {
          // Advisory: the real read owns error semantics.
        }
      }
    };

    schedule(PREWARM_START_DELAY_MS);

    return () => {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      abort.abort();
    };
  }, [store, mediaField, mediaType, sampleId]);

  return null;
}

function shouldYieldLink(store: PlaybackStore): boolean {
  return (
    getEpisodeNetworkHealth(store).limited ||
    getIsBuffering(store) ||
    getIsPlayPending(store)
  );
}

function runAtIdle(pass: () => Promise<void>) {
  if (typeof requestIdleCallback === "function") {
    // The timeout keeps backgrounded tabs from parking the pass forever.
    requestIdleCallback(() => void pass(), { timeout: 10_000 });
    return;
  }

  void pass();
}
