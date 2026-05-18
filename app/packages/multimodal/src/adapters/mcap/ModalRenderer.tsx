/**
 * THIS IS POC CODE FOR DEMO COUPLED WITH NUSCENES.
 * TODO(FOEPD-3830): REPLACE THIS DECODE/FETCH SLICE WITH PRODUCTION CODE.
 */
import type { SampleRendererProps } from "@fiftyone/plugins";
import { LRUCache } from "lru-cache";
import type {
  ChangeEvent,
  CSSProperties,
  MutableRefObject,
  ReactNode,
} from "react";
import { useEffect, useReducer, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../../client/resources";
import {
  byteSourceCacheKey,
  serializeCacheKey,
} from "../../client/resources/cache";
import type { DecodedVisualization } from "../../decoders";
import { PlaybackSyncMode, type StreamInventory } from "../../schemas/v1";
import { ImagePanel } from "../../visualization/panels/image";
import { PointCloudPanel } from "../../visualization/panels/point-cloud";
import { VISUALIZATION_KIND } from "../../visualization";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapActiveTimeline,
  type McapDecodedMessage,
  type McapResourceClient,
  type McapStreamSyncPolicies,
  type McapSynchronizedMessageWindow,
  type McapTimelineRange,
} from "./types";
import {
  DEFAULT_MCAP_TIMELINE_MAX_TICKS,
  DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
  createMcapTimelineTicks,
} from "./timeline";
import { getMcapSourceDescriptor } from "./sample";
import { useMcapResourceClient } from "./hooks";

// NuScenes demo wiring. The production playback owner should replace this with
// playback-plan streams, per-stream sync policy, and timeline controls.
const PLAYBACK_TOPICS = [
  "/CAM_FRONT/image_rect_compressed",
  "/CAM_FRONT_LEFT/image_rect_compressed",
  "/LIDAR_TOP",
] as const;
const CAMERA_SYNC_LOOKBACK_NS = 120_000_000n;
const LIDAR_SYNC_LOOKBACK_NS = 200_000_000n;
const PLAYBACK_BATCH_FRAME_COUNT = 8;
const PLAYBACK_WINDOW_CACHE_MAX_ENTRIES = PLAYBACK_BATCH_FRAME_COUNT * 8;
const CAMERA_SYNC_POLICY = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: CAMERA_SYNC_LOOKBACK_NS,
};
const STREAM_SYNC_POLICIES: McapStreamSyncPolicies = {
  "/CAM_FRONT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_FRONT_LEFT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/LIDAR_TOP": {
    mode: PlaybackSyncMode.LATEST,
    toleranceBeforeNs: LIDAR_SYNC_LOOKBACK_NS,
  },
};
const PLAYBACK_WINDOW_TOPICS_CACHE_KEY = serializeCacheKey(PLAYBACK_TOPICS);
const PLAYBACK_WINDOW_SYNC_POLICY_CACHE_KEY =
  streamSyncPoliciesCacheKey(STREAM_SYNC_POLICIES);
const ACTIVE_TIMELINE_OPTIONS = [MCAP_ACTIVE_TIMELINE.LOG] as const;

type LoadStatus = "idle" | "loading" | "ready" | "error";
type FrameLoadIntent = "load" | "playback" | "seek";

type StreamSpec = {
  readonly label: string;
  readonly topic: typeof PLAYBACK_TOPICS[number];
};
type DisplayMessagesByTopic = Partial<
  Record<typeof PLAYBACK_TOPICS[number], McapDecodedMessage>
>;
type TimelineBufferKind = "buffered" | "loading";
type TimelineBufferSegment = {
  readonly kind: TimelineBufferKind;
  readonly startPercent: number;
  readonly widthPercent: number;
};
type TimelineBufferStatus = {
  readonly bufferedFrameCount: number;
  readonly loadingFrameCount: number;
  readonly segments: readonly TimelineBufferSegment[];
  readonly totalFrameCount: number;
};
type StreamGridProps = {
  readonly messagesByTopic: DisplayMessagesByTopic;
};
type TimelineControlsProps = {
  readonly activeTimeline: McapActiveTimeline;
  readonly bufferStatus: TimelineBufferStatus;
  readonly canPlay: boolean;
  readonly frameIndex: number;
  readonly frameStatus: LoadStatus;
  readonly isPlaying: boolean;
  readonly relativeTimeNs: bigint | undefined;
  readonly timelineStatus: LoadStatus;
  readonly timelineTickCount: number;
  readonly onActiveTimelineChange: (
    event: ChangeEvent<HTMLSelectElement>
  ) => void;
  readonly onPlayClick: () => void;
  readonly onTimelineChange: (event: ChangeEvent<HTMLInputElement>) => void;
};
type ModalRendererProps = SampleRendererProps & {
  readonly maxTimelineTicks?: number;
  readonly timelineTickRateHz?: number;
};

const STREAMS: readonly StreamSpec[] = [
  {
    label: "Front camera",
    topic: "/CAM_FRONT/image_rect_compressed",
  },
  {
    label: "Front-left camera",
    topic: "/CAM_FRONT_LEFT/image_rect_compressed",
  },
  {
    label: "Top lidar",
    topic: "/LIDAR_TOP",
  },
];

/**
 * Modal proof renderer for MCAP-backed multimodal samples.
 */
export function ModalRenderer({
  ctx,
  maxTimelineTicks = DEFAULT_MCAP_TIMELINE_MAX_TICKS,
  timelineTickRateHz = DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
}: ModalRendererProps) {
  const mcap = useMcapResourceClient();
  const { source, sourceKey } = useMcapSourceDescriptor(ctx);
  // Playback data path: this POC reads MCAP bytes directly through the adapter's
  // worker-backed resource client. It does not currently depend on server-side
  // inventory or playback-plan query artifacts.
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
  const [timelineStatus, setTimelineStatus] = useState<LoadStatus>("idle");
  const [frameStatus, setFrameStatus] = useState<LoadStatus>("idle");
  const [topicStatus, setTopicStatus] = useState<LoadStatus>("idle");
  const [topics, setTopics] = useState<readonly StreamInventory[]>([]);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [displayMessagesByTopic, setDisplayMessagesByTopic] =
    useState<DisplayMessagesByTopic>({});
  const [error, setError] = useState<string | null>(null);
  const [, markPlaybackBufferChanged] = useReducer(
    (version: number) => version + 1,
    0
  );
  // POC placement: production playback should move this cache with the
  // playback controller because its key is shaped by timeline and sync policy.
  const playbackWindowCache = usePlaybackWindowCache();
  // In-flight keys dedupe both current-frame and speculative playback requests.
  const inFlightFrameRequestsRef = useRef(new Set<string>());
  const frameLoadIntentRef = useRef<FrameLoadIntent>("load");
  const currentTimeNsRef = useRef<bigint | undefined>(undefined);
  // LATEST sync can omit low-frequency streams at a given tick. During playback
  // we hold the last visible stream message so the UI remains visually coherent.
  const heldMessagesByTopicRef = useRef(new Map<string, McapDecodedMessage>());
  const sourceProblem = sourceProblemMessage(source);
  // The timeline key is the local playback epoch. If any input changes, old
  // async reads are allowed to fill cache but not repaint the current UI.
  const timelineKey = timelineCacheKey(
    sourceKey,
    activeTimeline,
    timelineTickRateHz,
    maxTimelineTicks
  );
  const timelineReadyForSource = timelineSourceKey === timelineKey;
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
    if (!source || sourceProblem) {
      setTopics([]);
      setTopicStatus("idle");
      setTopicError(null);
      return;
    }

    let cancelled = false;
    setTopics([]);
    setTopicStatus("loading");
    setTopicError(null);

    mcap
      .readTopics({ source })
      .then((nextTopics) => {
        if (cancelled) {
          return;
        }

        setTopics(nextTopics);
        setTopicStatus("ready");
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }

        setTopics([]);
        setTopicStatus("error");
        setTopicError(errorMessage(caughtError));
      });

    return () => {
      cancelled = true;
    };
  }, [mcap, source, sourceKey, sourceProblem]);

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

    mcap
      .readTimelineRange({
        activeTimeline,
        source,
      })
      .then((range) => {
        if (cancelled) {
          return;
        }

        const nextTicks = createMcapTimelineTicks(range, {
          maxTicks: maxTimelineTicks,
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
    maxTimelineTicks,
    mcap,
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

    const cacheKey = frameCacheKey(sourceKey, activeTimeline, timeNs);
    const cachedWindow = playbackWindowCache.get(cacheKey);
    if (cachedWindow) {
      setDisplayMessagesByTopic(
        displayMessagesForWindow(cachedWindow, heldMessagesByTopicRef.current)
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

    readCurrentPlaybackWindow(mcap, source, activeTimeline, timeNs)
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
          displayMessagesForWindow(window, heldMessagesByTopicRef.current)
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
    isPlaying,
    mcap,
    playbackWindowCache,
    source,
    sourceKey,
    sourceProblem,
    timeNs,
    timelineKey,
    timelineReadyForSource,
  ]);

  // Playback batch lane. This is the POC's speculative policy: while playing,
  // ask the worker for the current tick plus a small lookahead window. The
  // worker gives this RPC lower priority than explicit current-frame reads.
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

    const batchTicks = playbackBatchTicks(timelineTicks, frameIndex);
    const ticksToLoad = batchTicks.filter((nextTimeNs) => {
      const cacheKey = frameCacheKey(sourceKey, activeTimeline, nextTimeNs);
      return (
        !playbackWindowCache.has(cacheKey) &&
        !inFlightFrameRequestsRef.current.has(cacheKey)
      );
    });

    if (ticksToLoad.length === 0) {
      const cachedWindow = playbackWindowCache.get(
        frameCacheKey(sourceKey, activeTimeline, timeNs)
      );
      if (cachedWindow) {
        setDisplayMessagesByTopic(
          displayMessagesForWindow(cachedWindow, heldMessagesByTopicRef.current)
        );
        setFrameStatus("ready");
      }
      return;
    }

    const requestSourceKey = sourceKey;
    const requestEpochKey = timelineKey;
    const cacheKeys = ticksToLoad.map((nextTimeNs) =>
      frameCacheKey(requestSourceKey, activeTimeline, nextTimeNs)
    );
    for (const cacheKey of cacheKeys) {
      inFlightFrameRequestsRef.current.add(cacheKey);
    }
    markPlaybackBufferChanged();

    if (
      !playbackWindowCache.has(frameCacheKey(sourceKey, activeTimeline, timeNs))
    ) {
      setFrameStatus("loading");
      setError(null);
    }

    readPlaybackWindowBatch(mcap, source, activeTimeline, ticksToLoad)
      .then((windows) => {
        if (!isCurrentPlaybackEpoch(playbackEpochKeyRef, requestEpochKey)) {
          return;
        }

        for (const window of windows) {
          playbackWindowCache.set(
            frameCacheKey(requestSourceKey, activeTimeline, window.timeNs),
            window
          );
        }

        const currentTimeNs = currentTimeNsRef.current;
        const currentWindow =
          currentTimeNs === undefined
            ? undefined
            : playbackWindowCache.get(
                frameCacheKey(requestSourceKey, activeTimeline, currentTimeNs)
              );
        if (currentWindow) {
          setDisplayMessagesByTopic(
            displayMessagesForWindow(
              currentWindow,
              heldMessagesByTopicRef.current
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
                frameCacheKey(requestSourceKey, activeTimeline, currentTimeNs)
              );
        if (!currentWindow) {
          setFrameStatus("error");
          setError(errorMessage(caughtError));
        } else {
          setDisplayMessagesByTopic(
            displayMessagesForWindow(
              currentWindow,
              heldMessagesByTopicRef.current
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
    frameIndex,
    isPlaying,
    mcap,
    playbackWindowCache,
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

  const handlePlayClick = () => {
    setIsPlaying((playing) => {
      const nextPlaying = !playing;
      if (nextPlaying) {
        frameLoadIntentRef.current = "playback";
      }
      return nextPlaying;
    });
  };

  const handleTimelineChange = (event: ChangeEvent<HTMLInputElement>) => {
    frameLoadIntentRef.current = "seek";
    setIsPlaying(false);
    setFrameIndex(Number(event.currentTarget.value));
  };

  const handleActiveTimelineChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    frameLoadIntentRef.current = "load";
    setIsPlaying(false);
    heldMessagesByTopicRef.current.clear();
    setDisplayMessagesByTopic({});
    setActiveTimeline(event.currentTarget.value as McapActiveTimeline);
  };

  return (
    <div style={styles.shell}>
      {playbackError ? <ErrorNotice>{playbackError}</ErrorNotice> : null}
      <StreamGrid messagesByTopic={displayMessagesByTopic} />
      <TimelineControls
        activeTimeline={activeTimeline}
        bufferStatus={bufferStatus}
        canPlay={canPlay}
        frameIndex={frameIndex}
        frameStatus={frameStatus}
        isPlaying={isPlaying}
        onActiveTimelineChange={handleActiveTimelineChange}
        onPlayClick={handlePlayClick}
        onTimelineChange={handleTimelineChange}
        relativeTimeNs={relativeTimeNs}
        timelineStatus={timelineStatus}
        timelineTickCount={timelineTickCount}
      />
      <TopicInventoryPanel
        error={topicError}
        status={topicStatus}
        topics={topics}
      />
    </div>
  );
}

// UI-only pieces below receive already-orchestrated playback state. Keeping
// them dumb makes the data flow above easier to audit when playback evolves.
function StreamGrid({ messagesByTopic }: StreamGridProps) {
  return (
    <div style={styles.streamGrid}>
      {STREAMS.map((stream) => (
        <StreamPanel
          key={stream.topic}
          message={messagesByTopic[stream.topic]}
          stream={stream}
        />
      ))}
    </div>
  );
}

function TimelineControls({
  activeTimeline,
  bufferStatus,
  canPlay,
  frameIndex,
  frameStatus,
  isPlaying,
  onActiveTimelineChange,
  onPlayClick,
  onTimelineChange,
  relativeTimeNs,
  timelineStatus,
  timelineTickCount,
}: TimelineControlsProps) {
  const maxFrameIndex = Math.max(timelineTickCount - 1, 0);

  return (
    <div style={styles.timeline}>
      <label style={styles.timelineSelectLabel}>
        Timeline
        <select
          onChange={onActiveTimelineChange}
          style={styles.select}
          value={activeTimeline}
        >
          {ACTIVE_TIMELINE_OPTIONS.map((timeline) => (
            <option key={timeline} value={timeline}>
              {timeline}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!canPlay}
        onClick={onPlayClick}
        style={styles.button}
        type="button"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <div style={styles.timelineTrack}>
        <input
          disabled={!canPlay}
          max={maxFrameIndex}
          min={0}
          onChange={onTimelineChange}
          style={styles.range}
          type="range"
          value={Math.min(frameIndex, maxFrameIndex)}
        />
        <TimelineBufferTrack
          bufferStatus={bufferStatus}
          frameIndex={frameIndex}
          frameStatus={frameStatus}
          timelineStatus={timelineStatus}
        />
      </div>
      <div style={styles.timeReadout}>
        {timelineTickCount > 0 ? frameIndex + 1 : 0}/{timelineTickCount}
        {relativeTimeNs !== undefined
          ? ` · ${formatSeconds(relativeTimeNs)}`
          : ""}
      </div>
    </div>
  );
}

function TimelineBufferTrack({
  bufferStatus,
  frameIndex,
  frameStatus,
  timelineStatus,
}: {
  readonly bufferStatus: TimelineBufferStatus;
  readonly frameIndex: number;
  readonly frameStatus: LoadStatus;
  readonly timelineStatus: LoadStatus;
}) {
  const bufferLabel = timelineBufferLabel(bufferStatus);
  const statusLabel = frameStatusLabel(timelineStatus, frameStatus);
  const playheadPercent = timelineFramePercent(
    frameIndex,
    bufferStatus.totalFrameCount
  );
  const trackTitle = `${statusLabel} · ${bufferLabel}`;

  return (
    <div style={styles.bufferTrackShell}>
      <div style={styles.bufferTrack} title={trackTitle}>
        {bufferStatus.segments.map((segment, index) => (
          <div
            key={`${segment.kind}-${index}-${segment.startPercent}`}
            style={timelineBufferSegmentStyle(segment)}
          />
        ))}
        {bufferStatus.totalFrameCount > 0 ? (
          <div
            style={{
              ...styles.bufferPlayhead,
              ...timelineStatusMarkerStyle(timelineStatus, frameStatus),
              left: `${playheadPercent}%`,
            }}
          />
        ) : null}
      </div>
      <div style={styles.bufferStatus}>
        <span style={styles.bufferFrameStatus}>{statusLabel}</span>
        <span>{bufferLabel}</span>
      </div>
    </div>
  );
}

function TopicInventoryPanel({
  error,
  status,
  topics,
}: {
  readonly error: string | null;
  readonly status: LoadStatus;
  readonly topics: readonly StreamInventory[];
}) {
  return (
    <section style={styles.topicInventory}>
      <div style={styles.topicInventoryHeader}>
        <div style={styles.topicInventoryTitle}>Topics</div>
        <div style={styles.topicInventoryCount}>
          {topicInventorySummary(status, topics.length)}
        </div>
      </div>
      {status === "loading" ? (
        <div style={styles.topicInventoryEmpty}>Loading MCAP topics</div>
      ) : status === "error" ? (
        <div style={{ ...styles.notice, ...styles.noticeError }}>
          {error ?? "Could not load MCAP topics"}
        </div>
      ) : topics.length === 0 ? (
        <div style={styles.topicInventoryEmpty}>No topics found</div>
      ) : (
        <div style={styles.topicRows}>
          {topics.map((topic) => (
            <div key={topic.streamId} style={styles.topicRow}>
              <div style={styles.topicNameCell}>
                <div style={styles.topicName}>
                  {topic.displayName || topic.streamId}
                </div>
                <div style={styles.topicStreamId}>{topic.streamId}</div>
              </div>
              <div style={styles.topicSchemaCell}>
                {formatTopicPayload(topic)}
              </div>
              <div style={styles.topicRecordCell}>
                {topic.recordCount ?? "unknown"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function useMcapSourceDescriptor(ctx: SampleRendererProps["ctx"]) {
  const nextSource = getMcapSourceDescriptor(ctx);
  const nextSourceKey = mcapSourceKey(nextSource);
  const sourceRef = useRef<{
    readonly source: ByteSourceDescriptor | null;
    readonly sourceKey: string;
  }>();

  if (!sourceRef.current || sourceRef.current.sourceKey !== nextSourceKey) {
    sourceRef.current = {
      source: nextSource,
      sourceKey: nextSourceKey,
    };
  }

  return sourceRef.current;
}

function usePlaybackWindowCache(): LRUCache<
  string,
  McapSynchronizedMessageWindow
> {
  const cacheRef = useRef<LRUCache<
    string,
    McapSynchronizedMessageWindow
  > | null>(null);

  if (!cacheRef.current) {
    cacheRef.current = new LRUCache<string, McapSynchronizedMessageWindow>({
      max: PLAYBACK_WINDOW_CACHE_MAX_ENTRIES,
    });
  }

  return cacheRef.current;
}

function readCurrentPlaybackWindow(
  mcap: McapResourceClient,
  source: ByteSourceDescriptor,
  activeTimeline: McapActiveTimeline,
  timeNs: bigint
) {
  return mcap.readSynchronizedMessages({
    activeTimeline,
    source,
    streamPolicies: STREAM_SYNC_POLICIES,
    timeNs,
    topics: PLAYBACK_TOPICS,
  });
}

function readPlaybackWindowBatch(
  mcap: McapResourceClient,
  source: ByteSourceDescriptor,
  activeTimeline: McapActiveTimeline,
  timeNs: readonly bigint[]
) {
  return mcap.readSynchronizedMessageBatch({
    activeTimeline,
    source,
    streamPolicies: STREAM_SYNC_POLICIES,
    timeNs,
    topics: PLAYBACK_TOPICS,
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
  sourceKey,
  ticks,
}: {
  readonly activeTimeline: McapActiveTimeline;
  readonly inFlightFrameRequestKeys: ReadonlySet<string>;
  readonly playbackWindowCache: LRUCache<string, McapSynchronizedMessageWindow>;
  readonly sourceKey: string;
  readonly ticks: readonly bigint[];
}): TimelineBufferStatus {
  let bufferedFrameCount = 0;
  let loadingFrameCount = 0;
  let currentKind: TimelineBufferKind | null = null;
  let segmentStartIndex = 0;
  const segments: TimelineBufferSegment[] = [];

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
        : frameCacheKey(sourceKey, activeTimeline, timeNs);
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

function timelineBufferSegmentStyle(
  segment: TimelineBufferSegment
): CSSProperties {
  return {
    ...styles.bufferSegment,
    ...(segment.kind === "loading"
      ? styles.bufferSegmentLoading
      : styles.bufferSegmentBuffered),
    left: `${segment.startPercent}%`,
    width: `${segment.widthPercent}%`,
  };
}

function timelineStatusMarkerStyle(
  timelineStatus: LoadStatus,
  frameStatus: LoadStatus
): CSSProperties {
  if (timelineStatus === "error" || frameStatus === "error") {
    return styles.bufferPlayheadError;
  }

  if (timelineStatus === "loading" || frameStatus === "loading") {
    return styles.bufferPlayheadLoading;
  }

  if (timelineStatus === "ready" && frameStatus === "ready") {
    return styles.bufferPlayheadReady;
  }

  return styles.bufferPlayheadIdle;
}

function timelineBufferLabel(status: TimelineBufferStatus) {
  const base = `${status.bufferedFrameCount}/${status.totalFrameCount} buffered`;

  return status.loadingFrameCount > 0
    ? `${base} · ${status.loadingFrameCount} loading`
    : base;
}

function timelineFramePercent(frameIndex: number, totalFrameCount: number) {
  if (totalFrameCount <= 1) {
    return 0;
  }

  const clampedFrameIndex = Math.min(
    Math.max(frameIndex, 0),
    totalFrameCount - 1
  );

  return (clampedFrameIndex / (totalFrameCount - 1)) * 100;
}

// Includes the current tick first. During playback, the visible frame and
// nearby lookahead frames intentionally share the lower-priority batch lane.
function playbackBatchTicks(ticks: readonly bigint[], frameIndex: number) {
  const count = Math.min(PLAYBACK_BATCH_FRAME_COUNT, ticks.length);
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
  heldMessagesByTopic: Map<string, McapDecodedMessage>
): DisplayMessagesByTopic {
  const messagesByTopic: DisplayMessagesByTopic = {};

  for (const topic of PLAYBACK_TOPICS) {
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
  timeNs: bigint
) {
  return serializeCacheKey([
    sourceKey,
    activeTimeline,
    timeNs.toString(),
    PLAYBACK_WINDOW_TOPICS_CACHE_KEY,
    PLAYBACK_WINDOW_SYNC_POLICY_CACHE_KEY,
  ]);
}

function streamSyncPoliciesCacheKey(policies: McapStreamSyncPolicies) {
  return serializeCacheKey(
    PLAYBACK_TOPICS.map((topic) => {
      const policy = policies[topic];

      return serializeCacheKey([
        topic,
        policy?.mode?.toString() ?? "",
        policy?.limit?.toString() ?? "",
        policy?.toleranceBeforeNs?.toString() ?? "",
        policy?.toleranceAfterNs?.toString() ?? "",
      ]);
    })
  );
}

function StreamPanel({
  message,
  stream,
}: {
  readonly message: McapDecodedMessage | undefined;
  readonly stream: StreamSpec;
}) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <div>
          <div style={styles.panelTitle}>{stream.label}</div>
          <div style={styles.topic}>{stream.topic}</div>
        </div>
        <div style={styles.timestamp}>
          {message ? formatSeconds(message.timelineTimeNs) : "no frame"}
        </div>
      </div>
      <div style={styles.viewport}>
        {message ? (
          <VisualizationFrame
            visualization={message.decoded.output.visualization}
          />
        ) : (
          <div style={styles.empty}>No synchronized message in tolerance</div>
        )}
      </div>
    </section>
  );
}

function VisualizationFrame({
  visualization,
}: {
  readonly visualization: DecodedVisualization | undefined;
}) {
  if (!visualization) {
    return <div style={styles.empty}>No visualization for decoded message</div>;
  }

  if (visualization.kind === VISUALIZATION_KIND.ENCODED_IMAGE) {
    return (
      <ImagePanel frame={visualization} style={styles.visualizationPanel} />
    );
  }

  if (visualization.kind === VISUALIZATION_KIND.POINT_CLOUD) {
    return (
      <PointCloudPanel
        frame={visualization}
        style={styles.visualizationPanel}
      />
    );
  }

  return <div style={styles.empty}>Unsupported visualization</div>;
}

function ErrorNotice({ children }: { readonly children: ReactNode }) {
  return (
    <div
      style={{
        ...styles.notice,
        ...styles.noticeError,
      }}
    >
      {children}
    </div>
  );
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

function formatSeconds(ns: bigint) {
  return `${(Number(ns) / 1_000_000_000).toFixed(3)}s`;
}

function formatTopicPayload(topic: StreamInventory) {
  const payload = topic.payload;
  if (!payload) {
    return "unknown payload";
  }

  const schema = payload.schema ?? "unknown schema";
  const schemaEncoding = payload.schemaEncoding
    ? ` · ${payload.schemaEncoding}`
    : "";

  return `${schema} · ${payload.encoding}${schemaEncoding}`;
}

function topicInventorySummary(status: LoadStatus, topicCount: number) {
  if (status === "loading") {
    return "loading";
  }

  if (status === "error") {
    return "error";
  }

  return `${topicCount} ${topicCount === 1 ? "topic" : "topics"}`;
}

function frameStatusLabel(timelineStatus: LoadStatus, frameStatus: LoadStatus) {
  if (timelineStatus === "loading") {
    return "loading timeline";
  }

  if (frameStatus === "loading") {
    return "loading frame";
  }

  if (timelineStatus === "error" || frameStatus === "error") {
    return "error";
  }

  if (timelineStatus === "ready" && frameStatus === "ready") {
    return "ready";
  }

  return "idle";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const styles: Record<string, CSSProperties> = {
  bufferFrameStatus: {
    color: "#edf6ff",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  bufferPlayhead: {
    borderLeft: "2px dotted #94a3b8",
    bottom: -3,
    position: "absolute",
    top: -3,
    transform: "translateX(-1px)",
    width: 0,
  },
  bufferPlayheadError: {
    borderLeftColor: "#fb7185",
  },
  bufferPlayheadIdle: {
    borderLeftColor: "#94a3b8",
  },
  bufferPlayheadLoading: {
    borderLeftColor: "#f97316",
  },
  bufferPlayheadReady: {
    borderLeftColor: "#f8fafc",
  },
  bufferSegment: {
    bottom: 0,
    minWidth: 1,
    position: "absolute",
    top: 0,
  },
  bufferSegmentBuffered: {
    background: "#38bdf8",
  },
  bufferSegmentLoading: {
    background: "#f97316",
  },
  bufferStatus: {
    color: "#9fb3c8",
    display: "flex",
    fontSize: 11,
    gap: 8,
    lineHeight: 1,
  },
  bufferTrack: {
    background: "#0b1622",
    border: "1px solid #32485e",
    borderRadius: 4,
    height: 6,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  bufferTrackShell: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  button: {
    background: "#f97316",
    border: 0,
    borderRadius: 4,
    color: "#111827",
    cursor: "pointer",
    fontWeight: 700,
    minWidth: 72,
    padding: "8px 12px",
  },
  empty: {
    color: "#9fb3c8",
    fontSize: 13,
    padding: 16,
  },
  notice: {
    borderRadius: 4,
    fontSize: 12,
    lineHeight: 1.45,
    padding: "8px 10px",
  },
  noticeError: {
    background: "#3a1820",
    border: "1px solid #7f3342",
    color: "#ffd7df",
  },
  panel: {
    background: "#111d2a",
    border: "1px solid #27394b",
    borderRadius: 6,
    minHeight: 320,
    minWidth: 0,
    overflow: "hidden",
  },
  panelHeader: {
    alignItems: "flex-start",
    borderBottom: "1px solid #27394b",
    display: "flex",
    gap: 10,
    justifyContent: "space-between",
    padding: "10px 12px",
  },
  panelTitle: {
    color: "#edf6ff",
    fontSize: 14,
    fontWeight: 700,
  },
  range: {
    width: "100%",
  },
  select: {
    background: "#0b1622",
    border: "1px solid #32485e",
    borderRadius: 4,
    color: "#edf6ff",
    fontSize: 12,
    padding: "6px 8px",
  },
  shell: {
    background: "#0b1622",
    boxSizing: "border-box",
    color: "#edf6ff",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    height: "100%",
    minHeight: 560,
    padding: 14,
    width: "100%",
  },
  streamGrid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    minHeight: 0,
  },
  timeReadout: {
    color: "#c7d5e4",
    fontSize: 12,
    minWidth: 112,
    textAlign: "right",
  },
  timeline: {
    alignItems: "center",
    background: "#111d2a",
    border: "1px solid #27394b",
    borderRadius: 6,
    display: "flex",
    gap: 12,
    padding: 10,
  },
  timelineTrack: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  timelineSelectLabel: {
    alignItems: "center",
    color: "#c7d5e4",
    display: "flex",
    fontSize: 12,
    gap: 6,
  },
  topicInventory: {
    background: "#111d2a",
    border: "1px solid #27394b",
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 0,
    padding: 10,
  },
  topicInventoryCount: {
    color: "#9fb3c8",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  topicInventoryEmpty: {
    color: "#9fb3c8",
    fontSize: 12,
    padding: "4px 0",
  },
  topicInventoryHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  topicInventoryTitle: {
    color: "#edf6ff",
    fontSize: 13,
    fontWeight: 700,
  },
  topicName: {
    color: "#edf6ff",
    fontSize: 12,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  topicNameCell: {
    minWidth: 0,
  },
  topicRecordCell: {
    color: "#c7d5e4",
    fontSize: 12,
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  topicRow: {
    alignItems: "center",
    borderTop: "1px solid #27394b",
    display: "grid",
    gap: 10,
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) 72px",
    minHeight: 34,
    padding: "7px 0",
  },
  topicRows: {
    maxHeight: 180,
    overflow: "auto",
  },
  topicSchemaCell: {
    color: "#c7d5e4",
    fontSize: 12,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  topicStreamId: {
    color: "#9fb3c8",
    fontSize: 11,
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  timestamp: {
    color: "#9fb3c8",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  topic: {
    color: "#9fb3c8",
    fontSize: 11,
    marginTop: 3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  viewport: {
    alignItems: "center",
    display: "flex",
    height: 260,
    justifyContent: "center",
  },
  visualizationPanel: {
    height: "100%",
    width: "100%",
  },
};
