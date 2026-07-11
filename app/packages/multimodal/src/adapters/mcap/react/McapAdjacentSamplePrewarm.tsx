import type {
  SampleRendererProps,
  SampleRendererSampleLike,
} from "@fiftyone/plugins";
// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import {
  getIsBuffering,
  getIsPlayPending,
} from "@fiftyone/playback/src/lib/playback/store-access";
import type { PlaybackStore } from "@fiftyone/playback/src/lib/playback/types";
import { modalNavigation } from "@fiftyone/state";
import { useEffect } from "react";
import { byteSourceAccessKey } from "../../../query/bytes";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import { prewarmMcapSource } from "../prewarm-mcap-source";
import { getMcapSourceDescriptorForSample } from "../sample";
import { getMcapNetworkHealth } from "./mcap-network-health";

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
 * builds their MCAP sources, and warms the shared persistent byte cache
 * so the hop's cold reads skip the network. Mount inside the playback
 * shell — it reads the shell's store for the buffering and health gates.
 */
export function McapAdjacentSamplePrewarm({
  ctx,
}: {
  readonly ctx: SampleRendererProps["ctx"];
}) {
  const store = usePlaybackStore();
  const mediaField = ctx.media.field;
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
          const source = neighbor
            ? getMcapSourceDescriptorForSample(
                neighbor.sample as SampleRendererSampleLike,
                mediaField,
              )
            : null;
          if (!source) {
            continue;
          }

          const sourceKey = byteSourceAccessKey(source);
          if (prewarmedSourceKeys.has(sourceKey)) {
            continue;
          }

          markMcapLatencyEvent("adjacent prewarm start", {
            offset,
            sourceId: source.sourceId,
          });
          await prewarmMcapSource(source, { signal: abort.signal });
          if (!abort.signal.aborted) {
            prewarmedSourceKeys.add(sourceKey);
            markMcapLatencyEvent("adjacent prewarm complete", {
              offset,
              sourceId: source.sourceId,
            });
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
  }, [store, mediaField, sampleId]);

  return null;
}

function shouldYieldLink(store: PlaybackStore): boolean {
  return (
    getMcapNetworkHealth(store).limited ||
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
