import type {
  SampleRendererProps,
  SampleRendererSampleLike,
} from "@fiftyone/plugins";
// The view-free runtime entry avoids loading playback view Relay fragments.
import {
  getIsBuffering,
  getIsPlayPending,
  useIsBuffering,
  useIsPlayPending,
  usePlaybackStore,
} from "@fiftyone/playback/runtime";
import type { PlaybackStore } from "@fiftyone/playback/runtime";
import { modalNavigation } from "@fiftyone/state";
import { useEffect, useRef } from "react";
import {
  episodeSourceAccessKey,
  openEpisodePreviewSession,
  peekSourceBootstrap,
  prewarmEpisodeSource,
  publishEpisodePreviewBootstrap,
  publishSourceBootstrap,
} from "../../../runtime";
import {
  episodeByteSourceFromSample,
  episodeSourceFromByteSource,
  sampleDescriptorFromSample,
} from "../../session/episode-source";
import { getNetworkHealth } from "./network-health";
import { useEpisodeSourceReady } from "./source-ready-context";

/** Yield one task after the real current-source ready edge. */
const PREWARM_START_DELAY_MS = 0;

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
 * idle: after the current source's real ready edge (and only while playback
 * is not waiting on data and the network is not limited), it captures the
 * next samples' manifest/poster before warming the shared persistent byte
 * cache. Mount inside the playback shell — it reads the shell's store for
 * the buffering and health gates.
 */
export function AdjacentSamplePrewarm({
  ctx,
}: {
  readonly ctx: SampleRendererProps["ctx"];
}) {
  const store = usePlaybackStore();
  const sourceReady = useEpisodeSourceReady();
  // These subscriptions abort an in-flight speculative read as soon as
  // foreground playback needs the link; shouldYieldLink gates pass boundaries.
  const isBuffering = useIsBuffering();
  const isPlayPending = useIsPlayPending();
  const retryAfterForegroundGateRef = useRef(false);
  const mediaField = ctx.media.field;
  const mediaType = ctx.dataset.mediaType;
  const currentSample = ctx.sample.sample as { _id?: string; id?: string };
  const sampleId = currentSample._id ?? currentSample.id;

  // This effect schedules the advisory prewarm pass for the mounted
  // source's neighbors: browser-idle callback after the real ready edge,
  // re-scheduled while the link is needed elsewhere, aborted on unmount.
  useEffect(() => {
    if (!sourceReady) {
      retryAfterForegroundGateRef.current = false;
      return undefined;
    }
    if (isBuffering || isPlayPending) {
      retryAfterForegroundGateRef.current = true;
      return undefined;
    }

    const startDelayMs = retryAfterForegroundGateRef.current
      ? PREWARM_RETRY_DELAY_MS
      : PREWARM_START_DELAY_MS;
    retryAfterForegroundGateRef.current = false;

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
          const bootstrap = peekSourceBootstrap(source);
          const needsPreview =
            bootstrap?.previewReadComplete !== true &&
            (!bootstrap?.manifest || !bootstrap.poster);
          const sourceAlreadyPrewarmed = prewarmedSourceKeys.has(sourceKey);
          if (!needsPreview && sourceAlreadyPrewarmed) {
            continue;
          }

          const sampleDescriptor = sampleDescriptorFromSample(
            neighborSample,
            mediaField,
            mediaType,
          );
          if (needsPreview) {
            const previewSource = episodeSourceFromByteSource(source);
            const preview = await openEpisodePreviewSession(
              sampleDescriptor,
              previewSource,
              { signal: abort.signal },
            );
            try {
              const result = await preview?.read(
                {},
                { priority: "idle", signal: abort.signal },
              );
              if (result && !abort.signal.aborted) {
                publishEpisodePreviewBootstrap(source, result);
              } else if (!abort.signal.aborted) {
                // Some adapters cannot open a lightweight preview. Remember
                // that outcome in the bounded LRU so every idle pass does not
                // retry the same unsupported operation.
                publishSourceBootstrap(source, { previewReadComplete: true });
              }
            } finally {
              preview?.dispose();
            }
          }

          if (disposed || abort.signal.aborted) {
            return;
          }
          if (shouldYieldLink(store)) {
            schedule(PREWARM_RETRY_DELAY_MS);
            return;
          }

          // Preview facts have their own bounded LRU and may need recapturing
          // after eviction even when the persistent startup bytes are warm.
          if (sourceAlreadyPrewarmed) {
            continue;
          }

          const prewarmSource = episodeSourceFromByteSource(source);
          const prewarmed = await prewarmEpisodeSource(
            sampleDescriptor,
            prewarmSource,
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

    schedule(startDelayMs);

    return () => {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      abort.abort();
    };
  }, [
    store,
    mediaField,
    mediaType,
    sampleId,
    sourceReady,
    isBuffering,
    isPlayPending,
  ]);

  return null;
}

function shouldYieldLink(store: PlaybackStore): boolean {
  return (
    getNetworkHealth(store).limited ||
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
