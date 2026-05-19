/**
 * THIS IS POC PLAYBACK CONTROL LOGIC.
 * TODO(FOEPD-3830): SUBSUME TIMELINE SAMPLING, FRAME PREFETCH/CACHE,
 * SEEK/PLAY CLOCKING, AND SYNC-WINDOW ORCHESTRATION INTO THE PRODUCTION
 * PLAYBACK ENGINE.
 */
import { LRUCache } from "lru-cache";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../../../client/resources";
import {
  byteSourceCacheKey,
  serializeCacheKey,
} from "../../../client/resources/cache";
import type { StreamInventory } from "../../../schemas/v1";
import { createMcapTimelineTicks } from "../timeline";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapActiveTimeline,
  type McapDecodedMessage,
  type McapResourceClient,
  type McapStreamSyncPolicies,
  type McapStreamSyncPolicy,
  type McapSynchronizedMessageWindow,
  type McapTimelineRange,
} from "../types";

/**
 * Async loading state used by MCAP playback UI surfaces.
 */
export type McapLoadStatus = "idle" | "loading" | "ready" | "error";

/**
 * Display-ready decoded messages keyed by MCAP topic.
 */
export type McapPlaybackMessagesByTopic = Partial<
  Record<string, McapDecodedMessage>
>;

/**
 * Timeline cache segment kind for buffered playback frames.
 */
export type McapTimelineBufferKind = "buffered" | "loading";

/**
 * One contiguous buffered or loading run on the timeline.
 */
export interface McapTimelineBufferSegment {
  readonly kind: McapTimelineBufferKind;
  readonly startPercent: number;
  readonly widthPercent: number;
}

/**
 * Timeline cache summary for rendering playback buffering state.
 */
export interface McapTimelineBufferStatus {
  readonly bufferedFrameCount: number;
  readonly loadingFrameCount: number;
  readonly segments: readonly McapTimelineBufferSegment[];
  readonly totalFrameCount: number;
}

/**
 * Inputs required by the MCAP playback hook.
 */
export interface UseMcapPlaybackOptions {
  /**
   * MCAP resource client used for topic, timeline, and synchronized frame reads.
   */
  readonly client: McapResourceClient;

  /**
   * Fallback sync policy for topics without an explicit stream policy.
   */
  readonly defaultStreamPolicy?: McapStreamSyncPolicy;

  /**
   * Number of timeline frames to request per playback lookahead batch.
   */
  readonly playbackBatchFrameCount?: number;

  /**
   * Maximum number of synchronized playback windows to keep in memory.
   */
  readonly playbackWindowCacheMaxEntries?: number;

  /**
   * MCAP byte source selected by the renderer.
   */
  readonly source: ByteSourceDescriptor | null;

  /**
   * Topic-specific sync policies keyed by MCAP topic.
   */
  readonly streamPolicies?: McapStreamSyncPolicies;

  /**
   * Local timeline tick rate used for playback and scrub controls.
   * Defaults to 30Hz.
   */
  readonly timelineTickRateHz: number;

  /**
   * MCAP topics to request for synchronized playback windows.
   */
  readonly topics: readonly string[];
}

/**
 * Playback state and commands consumed by the MCAP modal renderer.
 */
export interface McapPlaybackState {
  /**
   * Timeline currently used as the playback clock.
   */
  readonly activeTimeline: McapActiveTimeline;

  /**
   * Buffered/loading frame summary for timeline UI.
   */
  readonly bufferStatus: McapTimelineBufferStatus;

  /**
   * Whether the timeline has enough ticks to play.
   */
  readonly canPlay: boolean;

  /**
   * Decoded messages currently visible, keyed by topic.
   */
  readonly displayMessagesByTopic: McapPlaybackMessagesByTopic;

  /**
   * Source, timeline, or frame-loading error shown by the renderer.
   */
  readonly error: string | null;

  /**
   * Current timeline tick index.
   */
  readonly frameIndex: number;

  /**
   * Loading status for the currently visible frame.
   */
  readonly frameStatus: McapLoadStatus;

  /**
   * Whether the playback clock is advancing.
   */
  readonly isPlaying: boolean;

  /**
   * Current frame time relative to the loaded timeline start.
   */
  readonly relativeTimeNs: bigint | undefined;

  /**
   * Seeks to a frame index and pauses playback.
   */
  readonly seekFrame: (frameIndex: number) => void;

  /**
   * Selects the active playback timeline and resets frame state.
   */
  readonly selectActiveTimeline: (activeTimeline: McapActiveTimeline) => void;

  /**
   * Loading status for timeline discovery.
   */
  readonly timelineStatus: McapLoadStatus;

  /**
   * Number of generated timeline ticks.
   */
  readonly timelineTickCount: number;

  /**
   * Starts or stops playback.
   */
  readonly togglePlaying: () => void;

  /**
   * Topic inventory loading error.
   */
  readonly topicError: string | null;

  /**
   * Loading status for MCAP topic inventory.
   */
  readonly topicStatus: McapLoadStatus;

  /**
   * Topic inventory read from the MCAP summary.
   */
  readonly topics: readonly StreamInventory[];
}

type FrameLoadIntent = "load" | "playback" | "seek";

type PlaybackWindowRequestOptions = {
  readonly defaultStreamPolicy?: McapStreamSyncPolicy;
  readonly streamPolicies?: McapStreamSyncPolicies;
  readonly topics: readonly string[];
};

const DEFAULT_PLAYBACK_BATCH_FRAME_COUNT = 8;
const DEFAULT_PLAYBACK_WINDOW_CACHE_MAX_ENTRIES =
  DEFAULT_PLAYBACK_BATCH_FRAME_COUNT * 8;
// POC guardrail: this hook materializes sampled timeline ticks in memory for
// slider state and buffer visualization. Keep the cap local until the playback
// engine owns timeline windowing and this hook goes away.
const POC_TIMELINE_MAX_TICKS = 20_000;

/**
 * Owns MCAP playback loading, timeline state, and frame prefetching.
 */
export function useMcapPlayback({
  client,
  defaultStreamPolicy,
  playbackBatchFrameCount = DEFAULT_PLAYBACK_BATCH_FRAME_COUNT,
  playbackWindowCacheMaxEntries = DEFAULT_PLAYBACK_WINDOW_CACHE_MAX_ENTRIES,
  source,
  streamPolicies,
  timelineTickRateHz,
  topics,
}: UseMcapPlaybackOptions): McapPlaybackState {
  const [activeTimeline, setActiveTimeline] = useState<McapActiveTimeline>(
    MCAP_ACTIVE_TIMELINE.LOG
  );
  const [timelineRange, setTimelineRange] = useState<McapTimelineRange | null>(
    null
  );
  const [timelineTicks, setTimelineTicks] = useState<readonly bigint[]>([]);
  const [timelineSourceKey, setTimelineSourceKey] = useState("");
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineStatus, setTimelineStatus] = useState<McapLoadStatus>("idle");
  const [frameStatus, setFrameStatus] = useState<McapLoadStatus>("idle");
  const [topicStatus, setTopicStatus] = useState<McapLoadStatus>("idle");
  const [topicInventory, setTopicInventory] = useState<
    readonly StreamInventory[]
  >([]);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [displayMessagesByTopic, setDisplayMessagesByTopic] =
    useState<McapPlaybackMessagesByTopic>({});
  const [error, setError] = useState<string | null>(null);
  const [, markPlaybackBufferChanged] = useReducer(
    (version: number) => version + 1,
    0
  );
  const playbackWindowCache = usePlaybackWindowCache(
    playbackWindowCacheMaxEntries
  );
  const inFlightFrameRequestsRef = useRef(new Set<string>());
  const frameLoadIntentRef = useRef<FrameLoadIntent>("load");
  const currentTimeNsRef = useRef<bigint | undefined>(undefined);
  const heldMessagesByTopicRef = useRef(new Map<string, McapDecodedMessage>());
  const sourceKey = useMemo(() => mcapSourceKey(source), [source]);
  const sourceProblem = sourceProblemMessage(source);
  const timelineKey = timelineCacheKey(
    sourceKey,
    activeTimeline,
    timelineTickRateHz,
    POC_TIMELINE_MAX_TICKS
  );
  const timelineReadyForSource = timelineSourceKey === timelineKey;
  const playbackWindowRequest = useMemo(
    () => ({
      defaultStreamPolicy,
      streamPolicies,
      topics,
    }),
    [defaultStreamPolicy, streamPolicies, topics]
  );
  const playbackWindowRequestKey = useMemo(
    () => playbackWindowRequestCacheKey(playbackWindowRequest),
    [playbackWindowRequest]
  );
  const timeNs = timelineReadyForSource ? timelineTicks[frameIndex] : undefined;
  const playIntervalMs = 1_000 / timelineTickRateHz;
  const playbackEpochKeyRef = useRef(timelineKey);
  const canPlay = timelineTicks.length > 1;
  const timelineTickCount = timelineTicks.length;
  const relativeTimeNs =
    timeNs !== undefined && timelineRange !== null
      ? timeNs - timelineRange.startTimeNs
      : undefined;
  const bufferStatus = timelineBufferStatusForTicks({
    activeTimeline,
    inFlightFrameRequestKeys: inFlightFrameRequestsRef.current,
    playbackWindowCache,
    playbackWindowRequestKey,
    sourceKey,
    ticks: timelineTicks,
  });
  const playbackError = sourceProblem ?? error;

  useEffect(() => {
    playbackEpochKeyRef.current = timelineKey;
  }, [timelineKey]);

  useEffect(() => {
    currentTimeNsRef.current = timeNs;
  }, [timeNs]);

  useEffect(() => {
    heldMessagesByTopicRef.current.clear();
    setDisplayMessagesByTopic({});
    playbackWindowCache.clear();
    inFlightFrameRequestsRef.current.clear();
    markPlaybackBufferChanged();
  }, [playbackWindowCache, playbackWindowRequestKey]);

  useEffect(() => {
    if (!source || sourceProblem) {
      setTopicInventory([]);
      setTopicStatus("idle");
      setTopicError(null);
      return;
    }

    let cancelled = false;
    setTopicInventory([]);
    setTopicStatus("loading");
    setTopicError(null);

    client
      .readTopics({ source })
      .then((nextTopics) => {
        if (cancelled) {
          return;
        }

        setTopicInventory(nextTopics);
        setTopicStatus("ready");
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }

        setTopicInventory([]);
        setTopicStatus("error");
        setTopicError(errorMessage(caughtError));
      });

    return () => {
      cancelled = true;
    };
  }, [client, source, sourceKey, sourceProblem]);

  // Timeline discovery resets playback state because source, active timeline,
  // and tick generation define the frame-index coordinate system.
  useEffect(() => {
    if (!source || sourceProblem) {
      setTimelineRange(null);
      setTimelineTicks([]);
      setTimelineSourceKey("");
      setFrameIndex(0);
      heldMessagesByTopicRef.current.clear();
      setDisplayMessagesByTopic({});
      playbackWindowCache.clear();
      inFlightFrameRequestsRef.current.clear();
      markPlaybackBufferChanged();
      setTimelineStatus("idle");
      return;
    }

    let cancelled = false;
    frameLoadIntentRef.current = "load";
    playbackWindowCache.clear();
    inFlightFrameRequestsRef.current.clear();
    markPlaybackBufferChanged();
    setTimelineRange(null);
    setTimelineTicks([]);
    setTimelineSourceKey("");
    setFrameIndex(0);
    heldMessagesByTopicRef.current.clear();
    setDisplayMessagesByTopic({});
    setTimelineStatus("loading");
    setError(null);

    client
      .readTimelineRange({
        activeTimeline,
        source,
      })
      .then((range) => {
        if (cancelled) {
          return;
        }

        const nextTicks = createMcapTimelineTicks(range, {
          maxTicks: POC_TIMELINE_MAX_TICKS,
          tickRateHz: timelineTickRateHz,
        });
        setTimelineRange(range);
        setTimelineTicks(nextTicks);
        setTimelineSourceKey(timelineKey);
        setFrameIndex(0);
        setTimelineStatus(nextTicks.length > 0 ? "ready" : "error");
        if (nextTicks.length === 0) {
          setError(`No ${activeTimeline} timeline ticks found`);
        }
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }

        setTimelineRange(null);
        setTimelineTicks([]);
        setTimelineSourceKey("");
        setFrameIndex(0);
        heldMessagesByTopicRef.current.clear();
        setDisplayMessagesByTopic({});
        setTimelineStatus("error");
        setError(errorMessage(caughtError));
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTimeline,
    client,
    playbackWindowCache,
    source,
    sourceProblem,
    timelineKey,
    timelineTickRateHz,
  ]);

  // Current-frame lane. Load/seek should request exactly the visible frame at
  // current-frame priority; playback intentionally defers misses to the batch
  // lane so speculative lookahead and the visible frame share one read.
  useEffect(() => {
    if (
      !source ||
      sourceProblem ||
      !timelineReadyForSource ||
      timeNs === undefined
    ) {
      heldMessagesByTopicRef.current.clear();
      setDisplayMessagesByTopic({});
      setFrameStatus("idle");
      return;
    }

    const cacheKey = frameCacheKey(
      sourceKey,
      activeTimeline,
      timeNs,
      playbackWindowRequestKey
    );
    const cachedWindow = playbackWindowCache.get(cacheKey);
    if (cachedWindow) {
      setDisplayMessagesByTopic(
        displayMessagesForWindow(
          cachedWindow,
          heldMessagesByTopicRef.current,
          playbackWindowRequest.topics
        )
      );
      setFrameStatus("ready");
      return;
    }

    if (isPlaying && frameLoadIntentRef.current === "playback") {
      setFrameStatus("loading");
      setError(null);
      return;
    }

    if (inFlightFrameRequestsRef.current.has(cacheKey)) {
      setFrameStatus("loading");
      setError(null);
      return;
    }

    let cancelled = false;
    const requestEpochKey = timelineKey;
    inFlightFrameRequestsRef.current.add(cacheKey);
    markPlaybackBufferChanged();
    setFrameStatus("loading");
    setError(null);

    readCurrentPlaybackWindow(
      client,
      source,
      activeTimeline,
      timeNs,
      playbackWindowRequest
    )
      .then((window) => {
        playbackWindowCache.set(cacheKey, window);
        if (
          cancelled ||
          !isCurrentFrameRequest(
            playbackEpochKeyRef,
            currentTimeNsRef,
            requestEpochKey,
            timeNs
          )
        ) {
          return;
        }

        setDisplayMessagesByTopic(
          displayMessagesForWindow(
            window,
            heldMessagesByTopicRef.current,
            playbackWindowRequest.topics
          )
        );
        setFrameStatus("ready");
      })
      .catch((caughtError) => {
        if (
          cancelled ||
          !isCurrentFrameRequest(
            playbackEpochKeyRef,
            currentTimeNsRef,
            requestEpochKey,
            timeNs
          )
        ) {
          return;
        }

        setFrameStatus("error");
        setError(errorMessage(caughtError));
      })
      .finally(() => {
        inFlightFrameRequestsRef.current.delete(cacheKey);
        markPlaybackBufferChanged();
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTimeline,
    client,
    isPlaying,
    playbackWindowCache,
    playbackWindowRequest,
    playbackWindowRequestKey,
    source,
    sourceKey,
    sourceProblem,
    timeNs,
    timelineKey,
    timelineReadyForSource,
  ]);

  // Playback batch lane. While playing, ask for the current tick plus a small
  // lookahead window. Worker clients give this RPC lower priority than explicit
  // current-frame reads.
  useEffect(() => {
    if (
      !isPlaying ||
      !source ||
      sourceProblem ||
      !timelineReadyForSource ||
      timeNs === undefined
    ) {
      return;
    }

    const batchTicks = playbackBatchTicks(
      timelineTicks,
      frameIndex,
      playbackBatchFrameCount
    );
    const ticksToLoad = batchTicks.filter((nextTimeNs) => {
      const cacheKey = frameCacheKey(
        sourceKey,
        activeTimeline,
        nextTimeNs,
        playbackWindowRequestKey
      );
      return (
        !playbackWindowCache.has(cacheKey) &&
        !inFlightFrameRequestsRef.current.has(cacheKey)
      );
    });

    if (ticksToLoad.length === 0) {
      const cachedWindow = playbackWindowCache.get(
        frameCacheKey(
          sourceKey,
          activeTimeline,
          timeNs,
          playbackWindowRequestKey
        )
      );
      if (cachedWindow) {
        setDisplayMessagesByTopic(
          displayMessagesForWindow(
            cachedWindow,
            heldMessagesByTopicRef.current,
            playbackWindowRequest.topics
          )
        );
        setFrameStatus("ready");
      }
      return;
    }

    const requestSourceKey = sourceKey;
    const requestEpochKey = timelineKey;
    const cacheKeys = ticksToLoad.map((nextTimeNs) =>
      frameCacheKey(
        requestSourceKey,
        activeTimeline,
        nextTimeNs,
        playbackWindowRequestKey
      )
    );
    for (const cacheKey of cacheKeys) {
      inFlightFrameRequestsRef.current.add(cacheKey);
    }
    markPlaybackBufferChanged();

    if (
      !playbackWindowCache.has(
        frameCacheKey(
          sourceKey,
          activeTimeline,
          timeNs,
          playbackWindowRequestKey
        )
      )
    ) {
      setFrameStatus("loading");
      setError(null);
    }

    readPlaybackWindowBatch(
      client,
      source,
      activeTimeline,
      ticksToLoad,
      playbackWindowRequest
    )
      .then((windows) => {
        if (!isCurrentPlaybackEpoch(playbackEpochKeyRef, requestEpochKey)) {
          return;
        }

        for (const window of windows) {
          playbackWindowCache.set(
            frameCacheKey(
              requestSourceKey,
              activeTimeline,
              window.timeNs,
              playbackWindowRequestKey
            ),
            window
          );
        }

        const currentTimeNs = currentTimeNsRef.current;
        const currentWindow =
          currentTimeNs === undefined
            ? undefined
            : playbackWindowCache.get(
                frameCacheKey(
                  requestSourceKey,
                  activeTimeline,
                  currentTimeNs,
                  playbackWindowRequestKey
                )
              );
        if (currentWindow) {
          setDisplayMessagesByTopic(
            displayMessagesForWindow(
              currentWindow,
              heldMessagesByTopicRef.current,
              playbackWindowRequest.topics
            )
          );
          setFrameStatus("ready");
        }
      })
      .catch((caughtError) => {
        if (!isCurrentPlaybackEpoch(playbackEpochKeyRef, requestEpochKey)) {
          return;
        }

        const currentTimeNs = currentTimeNsRef.current;
        const currentWindow =
          currentTimeNs === undefined
            ? undefined
            : playbackWindowCache.get(
                frameCacheKey(
                  requestSourceKey,
                  activeTimeline,
                  currentTimeNs,
                  playbackWindowRequestKey
                )
              );
        if (!currentWindow) {
          setFrameStatus("error");
          setError(errorMessage(caughtError));
        } else {
          setDisplayMessagesByTopic(
            displayMessagesForWindow(
              currentWindow,
              heldMessagesByTopicRef.current,
              playbackWindowRequest.topics
            )
          );
        }
      })
      .finally(() => {
        for (const cacheKey of cacheKeys) {
          inFlightFrameRequestsRef.current.delete(cacheKey);
        }
        markPlaybackBufferChanged();
      });
  }, [
    activeTimeline,
    client,
    frameIndex,
    isPlaying,
    playbackBatchFrameCount,
    playbackWindowCache,
    playbackWindowRequest,
    playbackWindowRequestKey,
    source,
    sourceKey,
    sourceProblem,
    timeNs,
    timelineKey,
    timelineReadyForSource,
    timelineTicks,
  ]);

  // Clock lane. This moves the visible frame only; data loading is owned by the
  // current-frame and playback-batch lanes above.
  useEffect(() => {
    if (!isPlaying || !timelineReadyForSource || !canPlay) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      frameLoadIntentRef.current = "playback";
      setFrameIndex((current) => (current + 1) % timelineTicks.length);
    }, playIntervalMs);

    return () => window.clearInterval(interval);
  }, [
    canPlay,
    isPlaying,
    playIntervalMs,
    timelineReadyForSource,
    timelineTicks.length,
  ]);

  const togglePlaying = () => {
    setIsPlaying((playing) => {
      const nextPlaying = !playing;
      if (nextPlaying) {
        frameLoadIntentRef.current = "playback";
      }
      return nextPlaying;
    });
  };

  const seekFrame = (nextFrameIndex: number) => {
    frameLoadIntentRef.current = "seek";
    setIsPlaying(false);
    setFrameIndex(nextFrameIndex);
  };

  const selectActiveTimeline = (nextActiveTimeline: McapActiveTimeline) => {
    frameLoadIntentRef.current = "load";
    setIsPlaying(false);
    heldMessagesByTopicRef.current.clear();
    setDisplayMessagesByTopic({});
    setActiveTimeline(nextActiveTimeline);
  };

  return {
    activeTimeline,
    bufferStatus,
    canPlay,
    displayMessagesByTopic,
    error: playbackError,
    frameIndex,
    frameStatus,
    isPlaying,
    relativeTimeNs,
    seekFrame,
    selectActiveTimeline,
    timelineStatus,
    timelineTickCount,
    togglePlaying,
    topicError,
    topicStatus,
    topics: topicInventory,
  };
}

function usePlaybackWindowCache(
  maxEntries: number
): LRUCache<string, McapSynchronizedMessageWindow> {
  const cacheRef = useRef<{
    readonly cache: LRUCache<string, McapSynchronizedMessageWindow>;
    readonly maxEntries: number;
  } | null>(null);

  if (!cacheRef.current || cacheRef.current.maxEntries !== maxEntries) {
    cacheRef.current = {
      cache: new LRUCache<string, McapSynchronizedMessageWindow>({
        max: maxEntries,
      }),
      maxEntries,
    };
  }

  return cacheRef.current.cache;
}

function readCurrentPlaybackWindow(
  client: McapResourceClient,
  source: ByteSourceDescriptor,
  activeTimeline: McapActiveTimeline,
  timeNs: bigint,
  request: PlaybackWindowRequestOptions
) {
  return client.readSynchronizedMessages({
    activeTimeline,
    defaultStreamPolicy: request.defaultStreamPolicy,
    source,
    streamPolicies: request.streamPolicies,
    timeNs,
    topics: request.topics,
  });
}

function readPlaybackWindowBatch(
  client: McapResourceClient,
  source: ByteSourceDescriptor,
  activeTimeline: McapActiveTimeline,
  timeNs: readonly bigint[],
  request: PlaybackWindowRequestOptions
) {
  return client.readSynchronizedMessageBatch({
    activeTimeline,
    defaultStreamPolicy: request.defaultStreamPolicy,
    source,
    streamPolicies: request.streamPolicies,
    timeNs,
    topics: request.topics,
  });
}

// Async reads can resolve after a seek/source/timeline change. Treat the
// timeline key as a local epoch so old responses cannot repaint the UI.
function isCurrentPlaybackEpoch(
  playbackEpochKeyRef: MutableRefObject<string>,
  requestEpochKey: string
) {
  return playbackEpochKeyRef.current === requestEpochKey;
}

function isCurrentFrameRequest(
  playbackEpochKeyRef: MutableRefObject<string>,
  currentTimeNsRef: MutableRefObject<bigint | undefined>,
  requestEpochKey: string,
  timeNs: bigint
) {
  return (
    isCurrentPlaybackEpoch(playbackEpochKeyRef, requestEpochKey) &&
    currentTimeNsRef.current === timeNs
  );
}

function timelineBufferStatusForTicks({
  activeTimeline,
  inFlightFrameRequestKeys,
  playbackWindowCache,
  playbackWindowRequestKey,
  sourceKey,
  ticks,
}: {
  readonly activeTimeline: McapActiveTimeline;
  readonly inFlightFrameRequestKeys: ReadonlySet<string>;
  readonly playbackWindowCache: LRUCache<string, McapSynchronizedMessageWindow>;
  readonly playbackWindowRequestKey: string;
  readonly sourceKey: string;
  readonly ticks: readonly bigint[];
}): McapTimelineBufferStatus {
  let bufferedFrameCount = 0;
  let loadingFrameCount = 0;
  let currentKind: McapTimelineBufferKind | null = null;
  let segmentStartIndex = 0;
  const segments: McapTimelineBufferSegment[] = [];

  const flushSegment = (endIndex: number) => {
    if (currentKind === null || endIndex <= segmentStartIndex) {
      return;
    }

    segments.push({
      kind: currentKind,
      startPercent: (segmentStartIndex / ticks.length) * 100,
      widthPercent: ((endIndex - segmentStartIndex) / ticks.length) * 100,
    });
  };

  for (let index = 0; index < ticks.length; index++) {
    const timeNs = ticks[index];
    const cacheKey =
      timeNs === undefined
        ? undefined
        : frameCacheKey(
            sourceKey,
            activeTimeline,
            timeNs,
            playbackWindowRequestKey
          );
    const nextKind =
      cacheKey && inFlightFrameRequestKeys.has(cacheKey)
        ? "loading"
        : cacheKey && playbackWindowCache.has(cacheKey)
        ? "buffered"
        : null;

    if (nextKind === "loading") {
      loadingFrameCount++;
    } else if (nextKind === "buffered") {
      bufferedFrameCount++;
    }

    if (nextKind !== currentKind) {
      flushSegment(index);
      currentKind = nextKind;
      segmentStartIndex = index;
    }
  }

  flushSegment(ticks.length);

  return {
    bufferedFrameCount,
    loadingFrameCount,
    segments,
    totalFrameCount: ticks.length,
  };
}

// Includes the current tick first. During playback, the visible frame and
// nearby lookahead frames intentionally share the lower-priority batch lane.
function playbackBatchTicks(
  ticks: readonly bigint[],
  frameIndex: number,
  frameCount: number
) {
  const count = Math.min(frameCount, ticks.length);
  const batchTicks: bigint[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const timeNs = ticks[(frameIndex + offset) % ticks.length];
    if (timeNs !== undefined && !batchTicks.includes(timeNs)) {
      batchTicks.push(timeNs);
    }
  }

  return batchTicks;
}

function displayMessagesForWindow(
  window: McapSynchronizedMessageWindow,
  heldMessagesByTopic: Map<string, McapDecodedMessage>,
  topics: readonly string[]
): McapPlaybackMessagesByTopic {
  const messagesByTopic: McapPlaybackMessagesByTopic = {};

  for (const topic of topics) {
    const message = window.messagesByTopic[topic]?.[0];
    if (message) {
      heldMessagesByTopic.set(topic, message);
      messagesByTopic[topic] = message;
      continue;
    }

    // Sparse sync windows are a timing fact, not a reason to visually blank the
    // stream while a user scrubs. Keep the last visible message per stream; the
    // tolerance policy remains owned by the MCAP sync layer.
    const heldMessage = heldMessagesByTopic.get(topic);
    if (heldMessage) {
      messagesByTopic[topic] = heldMessage;
    }
  }

  return messagesByTopic;
}

function timelineCacheKey(
  sourceKey: string,
  activeTimeline: McapActiveTimeline,
  tickRateHz: number,
  maxTicks: number
) {
  return serializeCacheKey([
    sourceKey,
    activeTimeline,
    tickRateHz.toString(),
    maxTicks.toString(),
  ]);
}

function frameCacheKey(
  sourceKey: string,
  activeTimeline: McapActiveTimeline,
  timeNs: bigint,
  playbackWindowRequestKey: string
) {
  return serializeCacheKey([
    sourceKey,
    activeTimeline,
    timeNs.toString(),
    playbackWindowRequestKey,
  ]);
}

function playbackWindowRequestCacheKey(request: PlaybackWindowRequestOptions) {
  return serializeCacheKey([
    serializeCacheKey(request.topics),
    streamSyncPoliciesCacheKey(request.topics, request.streamPolicies),
    streamSyncPolicyCacheKey(request.defaultStreamPolicy),
  ]);
}

function streamSyncPoliciesCacheKey(
  topics: readonly string[],
  policies: McapStreamSyncPolicies | undefined
) {
  return serializeCacheKey(
    topics.map((topic) =>
      serializeCacheKey([topic, streamSyncPolicyCacheKey(policies?.[topic])])
    )
  );
}

function streamSyncPolicyCacheKey(policy: McapStreamSyncPolicy | undefined) {
  return serializeCacheKey([
    policy?.mode?.toString() ?? "",
    policy?.limit?.toString() ?? "",
    policy?.toleranceBeforeNs?.toString() ?? "",
    policy?.toleranceAfterNs?.toString() ?? "",
  ]);
}

function sourceProblemMessage(source: ByteSourceDescriptor | null) {
  if (!source) {
    return "Sample filepath is missing; cannot build an MCAP byte source.";
  }

  return null;
}

function mcapSourceKey(source: ByteSourceDescriptor | null) {
  return source ? byteSourceCacheKey(source) : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
