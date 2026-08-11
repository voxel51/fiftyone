import {
  getBufferingDetail,
  getIsBuffering,
  getIsPlayPending,
  getIsPlaying,
  getPlayhead,
  setBufferingDetail,
  setBufferingStreams,
  setIsBuffering,
  usePlaybackStore,
  type BufferingStream,
  type PlaybackStore,
} from "@fiftyone/playback";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { useMemo } from "react";
import type { DecodedDiagnostic } from "../../../ir";
import type { EpisodeStreamCache, TimelineIndex } from "../../../runtime";
import {
  isEpisodeBufferCostObserved,
  recordEpisodeBufferCost,
} from "../../../observability/episode-buffer-cost";
import { monotonicNowMs } from "../../../utils/monotonic-time";
import {
  bufferWindowCoverage,
  staleAgeForMessage,
  type DerivedPlaybackPolicy,
} from "./playback-buffering";
import {
  publishStartupCushionProgress,
  type StartupCushion,
} from "./startup-cushion";

/**
 * Per-stream playback readiness at the current playhead tick:
 *
 * - "loading" — the tick isn't cached for this stream yet (fetch in flight
 *   or about to be requested). Tiles keep their previous frame and show a
 *   subtle catching-up indicator.
 * - "ready"   — the latest message at or before the current tick is being shown
 *   within the stale-warning threshold.
 * - "stale"   — the latest message at or before the current tick is still being
 *   shown, but is older than its cadence-derived stale threshold.
 * - "gap"     — the tick was fetched and the stream has no message at or
 *   before it. Under latest-at-or-before selection this means the
 *   playhead is before the stream's first message.
 * - "failed"  — repeated fetch/decode failures for this stream. Sticky
 *   until a later fetch for the stream succeeds.
 */
export type StreamStatus = "loading" | "ready" | "stale" | "gap" | "failed";

/**
 * Per-stream status, stored in the surrounding PlaybackProvider's store
 * (the same per-modal-instance store that carries the stream values).
 * Private to this module:
 * components read via `useStreamStatuses`, the data stream and tests
 * use the get/set helpers with the store they already hold.
 */
// Same writable-shape cast as the playback atoms — jotai's null-ish
// initial value overload would otherwise narrow this to a read-only Atom.
const streamStatusAtom = atomFamily(
  (_stream: string) =>
    atom<StreamStatus>("loading") as PrimitiveAtom<StreamStatus>,
);

/**
 * Per-stream first-message time in timeline seconds, written once per
 * source by the episode data stream. Null until resolved (or when the file
 * carries no usable indexes for the stream). Lets tile chrome say "No
 * data until 0:12" instead of a generic gap message.
 */
const streamStartTimeSecAtom = atomFamily(
  (_stream: string) =>
    atom<number | null>(null) as PrimitiveAtom<number | null>,
);

/**
 * Per-stream age of the displayed stale media frame. Null when the stream is not
 * currently stale. Kept separate from `StreamStatus` so badges can say
 * exactly how far behind the rendered content is.
 */
const streamStaleAgeNsAtom = atomFamily(
  (_stream: string) =>
    atom<bigint | null>(null) as PrimitiveAtom<bigint | null>,
);

/**
 * Timeline-relative timestamp of the observation currently displayed for a
 * stream. Null means no observation is available at the current playhead.
 */
const streamContentTimeSecAtom = atomFamily(
  (_stream: string) =>
    atom<number | null>(null) as PrimitiveAtom<number | null>,
);

const EMPTY_DIAGNOSTICS: readonly DecodedDiagnostic[] = [];
const streamDiagnosticsAtom = atomFamily(
  (_stream: string) =>
    atom<readonly DecodedDiagnostic[]>(EMPTY_DIAGNOSTICS) as PrimitiveAtom<
      readonly DecodedDiagnostic[]
    >,
);

/**
 * Reactive statuses for the given streams, index-aligned with `streams`.
 * Tile chrome (badges, empty states) reads these to summarize the
 * streams behind a tile. Resolves against the surrounding
 * PlaybackProvider's store. Pass a referentially stable array — a new
 * identity re-derives the combined atom.
 */
export function useStreamStatuses(
  streams: readonly string[],
): readonly StreamStatus[] {
  const store = usePlaybackStore();
  const statusesAtom = useMemo(
    () => atom((get) => streams.map((stream) => get(streamStatusAtom(stream)))),
    [streams],
  );
  return useAtomValue(statusesAtom, { store });
}

/**
 * Reactive first-message times (timeline seconds) for the given streams,
 * index-aligned with `streams`. Pass a referentially stable array.
 */
export function useStreamStartTimes(
  streams: readonly string[],
): readonly (number | null)[] {
  const store = usePlaybackStore();
  const startTimesAtom = useMemo(
    () =>
      atom((get) =>
        streams.map((stream) => get(streamStartTimeSecAtom(stream))),
      ),
    [streams],
  );
  return useAtomValue(startTimesAtom, { store });
}

/**
 * Reactive displayed-frame stale ages, index-aligned with `streams`. Null means
 * the stream is not currently stale.
 */
export function useStreamStaleAges(
  streams: readonly string[],
): readonly (bigint | null)[] {
  const store = usePlaybackStore();
  const staleAgesAtom = useMemo(
    () =>
      atom((get) => streams.map((stream) => get(streamStaleAgeNsAtom(stream)))),
    [streams],
  );
  return useAtomValue(staleAgesAtom, { store });
}

/** Reactive source times for the observations currently displayed. */
export function useStreamContentTimes(
  streams: readonly string[],
): readonly (number | null)[] {
  const store = usePlaybackStore();
  const contentTimesAtom = useMemo(
    () =>
      atom((get) =>
        streams.map((stream) => get(streamContentTimeSecAtom(stream))),
      ),
    [streams],
  );
  return useAtomValue(contentTimesAtom, { store });
}

/** Decoder capability diagnostics, index-aligned with the supplied streams. */
export function useStreamDiagnostics(
  streams: readonly string[],
): readonly (readonly DecodedDiagnostic[])[] {
  const store = usePlaybackStore();
  const diagnosticsAtom = useMemo(
    () =>
      atom((get) =>
        streams.map((stream) => get(streamDiagnosticsAtom(stream))),
      ),
    [streams],
  );
  return useAtomValue(diagnosticsAtom, { store });
}

/** Non-reactive read for the data stream and tests. */
export function getStreamStatus(
  store: PlaybackStore,
  stream: string,
): StreamStatus {
  return store.get(streamStatusAtom(stream));
}

/** Non-reactive write for the data stream's status publishing. */
export function setStreamStatus(
  store: PlaybackStore,
  stream: string,
  status: StreamStatus,
): void {
  store.set(streamStatusAtom(stream), status);
}

/** Non-reactive read for the data stream and tests. */
function getStreamStaleAgeNs(
  store: PlaybackStore,
  stream: string,
): bigint | null {
  return store.get(streamStaleAgeNsAtom(stream));
}

/** Non-reactive write for the data stream's stale warning publishing. */
export function setStreamStaleAgeNs(
  store: PlaybackStore,
  stream: string,
  ageNs: bigint | null,
): void {
  store.set(streamStaleAgeNsAtom(stream), ageNs);
}

/** Non-reactive read for the data stream and tests. */
export function getStreamContentTimeSec(
  store: PlaybackStore,
  stream: string,
): number | null {
  return store.get(streamContentTimeSecAtom(stream));
}

/** Non-reactive write for the displayed observation timestamp. */
export function setStreamContentTimeSec(
  store: PlaybackStore,
  stream: string,
  timeSec: number | null,
): void {
  store.set(streamContentTimeSecAtom(stream), timeSec);
}

/** Replaces a stream's latest decoder diagnostics when their content changes. */
export function setStreamDiagnostics(
  store: PlaybackStore,
  stream: string,
  diagnostics: readonly DecodedDiagnostic[],
): void {
  const atom = streamDiagnosticsAtom(stream);
  const next = diagnostics.length > 0 ? diagnostics : EMPTY_DIAGNOSTICS;
  if (decodedDiagnosticsEqual(store.get(atom), next)) return;
  store.set(atom, next);
}

/** Reads a stream's latest decoder diagnostics without subscribing. */
export function getStreamDiagnostics(
  store: PlaybackStore,
  stream: string,
): readonly DecodedDiagnostic[] {
  return store.get(streamDiagnosticsAtom(stream));
}

function decodedDiagnosticsEqual(
  left: readonly DecodedDiagnostic[],
  right: readonly DecodedDiagnostic[],
): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((diagnostic, index) => {
        const candidate = right[index];
        return (
          candidate !== undefined &&
          diagnostic.capability === candidate.capability &&
          diagnostic.code === candidate.code &&
          diagnostic.message === candidate.message &&
          diagnostic.severity === candidate.severity
        );
      }))
  );
}

/** Non-reactive write for the data stream's stream-bounds publishing. */
export function setStreamStartTimeSec(
  store: PlaybackStore,
  stream: string,
  startTimeSec: number | null,
): void {
  store.set(streamStartTimeSecAtom(stream), startTimeSec);
}

/**
 * Publishes per-stream readiness, aggregate buffering feedback, held-frame
 * recovery, and startup-gate progress for the current playhead.
 */
export function publishDataStreamStatuses({
  activeBlockingStreams,
  activeStreams,
  caches,
  failedStreams,
  index,
  onPlayheadDataReady,
  policy,
  publishBufferedRangesNow,
  pushCurrentTick,
  resolveStartupCushion,
  scheduleBufferedRangesPublish,
  schedulePausedIdleWarmup,
  staleWarningStreams,
  store,
  streamNames,
}: {
  readonly activeBlockingStreams: readonly string[];
  readonly activeStreams: readonly string[];
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly failedStreams: ReadonlySet<string>;
  readonly index: TimelineIndex | null;
  readonly onPlayheadDataReady: (() => void) | undefined;
  readonly policy: DerivedPlaybackPolicy;
  readonly publishBufferedRangesNow: () => void;
  readonly pushCurrentTick: (
    activeStreams: readonly string[],
    tick: bigint,
  ) => void;
  readonly resolveStartupCushion: () => StartupCushion;
  readonly scheduleBufferedRangesPublish: () => void;
  readonly schedulePausedIdleWarmup: (delayMs?: number) => void;
  readonly staleWarningStreams: ReadonlySet<string>;
  readonly store: PlaybackStore;
  readonly streamNames: ReadonlyMap<string, string>;
}): void {
  const blockingStreamSet = new Set(activeBlockingStreams);
  const coveredBlockingStreams = new Set<string>();
  const tick = index?.nearestTick(getPlayhead(store)) ?? null;
  let blockingCovered = 0;

  for (const stream of activeStreams) {
    const cache = caches.get(stream);
    let status: StreamStatus;
    let staleAgeNs: bigint | null = null;
    let contentTimeSec: number | null = null;
    if (tick === null || !cache?.has(tick)) {
      status = failedStreams.has(stream) ? "failed" : "loading";
    } else {
      if (blockingStreamSet.has(stream)) {
        blockingCovered += 1;
        coveredBlockingStreams.add(stream);
      }
      if (failedStreams.has(stream)) {
        status = "failed";
      } else {
        const message = cache.get(tick);
        if (!message) {
          status = "gap";
        } else {
          contentTimeSec = index?.nsToSec(message.timestampNs) ?? null;
          if (staleWarningStreams.has(stream)) {
            staleAgeNs = staleAgeForMessage(
              tick,
              message,
              cache.observationStaleThresholdNs(),
            );
            status = staleAgeNs === null ? "ready" : "stale";
          } else {
            status = "ready";
          }
        }
      }
    }
    if (getStreamContentTimeSec(store, stream) !== contentTimeSec) {
      setStreamContentTimeSec(store, stream, contentTimeSec);
    }
    if (getStreamStaleAgeNs(store, stream) !== staleAgeNs) {
      setStreamStaleAgeNs(store, stream, staleAgeNs);
    }
    if (getStreamStatus(store, stream) !== status) {
      setStreamStatus(store, stream, status);
    }
  }

  const blockingTotal = activeBlockingStreams.length;
  const detail =
    tick !== null && blockingTotal > 0 && blockingCovered < blockingTotal
      ? `${blockingCovered}/${blockingTotal} streams`
      : null;
  if (getBufferingDetail(store) !== detail) {
    setBufferingDetail(store, detail);
  }
  const bufferingStreams: readonly BufferingStream[] =
    detail === null
      ? []
      : activeBlockingStreams.map((stream) => ({
          id: stream,
          label: streamNames.get(stream) ?? stream,
          state: coveredBlockingStreams.has(stream) ? "ready" : "waiting",
        }));
  setBufferingStreams(store, bufferingStreams);

  if (
    tick !== null &&
    blockingTotal > 0 &&
    blockingCovered === blockingTotal &&
    getIsBuffering(store)
  ) {
    setIsBuffering(store, false);
    pushCurrentTick(activeStreams, tick);
  }

  const playheadSec = getPlayhead(store);
  const startupCoverage =
    tick !== null && blockingTotal > 0
      ? bufferWindowCoverage({
          activeStreams: activeBlockingStreams,
          caches,
          index,
          lookaheadSeconds: policy.startupLookaheadSeconds,
          maxTicks: policy.startupMaxPrefetchBatch,
          timeSec: playheadSec,
        })
      : null;
  const startupReady =
    !!startupCoverage?.total &&
    startupCoverage.covered === startupCoverage.total;

  publishStartupCushionProgress({
    activeBlockingStreams,
    caches,
    index,
    playheadSec,
    policy,
    resolveStartupCushion,
    store,
    tick,
  });

  if (tick !== null && blockingTotal > 0 && blockingCovered === blockingTotal) {
    onPlayheadDataReady?.();
  }

  if (startupReady && getIsPlayPending(store)) {
    publishBufferedRangesNow();
  } else {
    scheduleBufferedRangesPublish();
  }
  if (
    tick !== null &&
    blockingTotal > 0 &&
    blockingCovered === blockingTotal &&
    !getIsPlaying(store) &&
    !getIsPlayPending(store)
  ) {
    schedulePausedIdleWarmup(policy.prefetchRefreshSeconds * 1000);
  }
}
