/**
 * THIS IS POC CODE FOR DEMO COUPLED WITH NUSCENES.
 * TODO(FOEPD-3830): REPLACE THIS DECODE/FETCH SLICE WITH PRODUCTION CODE.
 */
import type { SampleRendererProps } from "@fiftyone/plugins";
import { LRUCache } from "lru-cache";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../client";
import {
  byteSourceCacheKey,
  serializeCacheKey,
} from "../client/resources/cache";
import { usePlaybackPlan, useSceneInventory } from "../client/hooks";
import type { DecodedVisualization } from "../decoders";
import { PlaybackSyncMode } from "../schemas/v1";
import { ImagePanel } from "../visualization/panels/image";
import { PointCloudPanel } from "../visualization/panels/point-cloud";
import { VISUALIZATION_KIND } from "../visualization";
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
import { getMcapSourceDescriptor, getSampleIdentifiers } from "./sample";
import { createWorkerMcapResourceClient } from "./worker";

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
type FrameLoadReason = "load" | "playback" | "seek";

type StreamSpec = {
  readonly label: string;
  readonly topic: typeof PLAYBACK_TOPICS[number];
};
type DisplayMessagesByTopic = Partial<
  Record<typeof PLAYBACK_TOPICS[number], McapDecodedMessage>
>;
type PlaybackWindowCache = LRUCache<string, McapSynchronizedMessageWindow>;
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
  const { datasetId, sampleId } = getSampleIdentifiers(ctx);
  const { source, sourceKey } = useMcapSourceDescriptor(ctx);
  const mcap = useMemo(() => createWorkerMcapResourceClient(), []);

  useEffect(() => () => mcap.dispose(), [mcap]);
  const inventoryState = useSceneInventory(
    datasetId && sampleId ? { datasetId, sampleId } : null
  );
  const playbackPlanState = usePlaybackPlan(
    inventoryState.status === "loaded" && inventoryState.data.inventoryId
      ? { inventoryId: inventoryState.data.inventoryId }
      : null
  );
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
  const [displayMessagesByTopic, setDisplayMessagesByTopic] =
    useState<DisplayMessagesByTopic>({});
  const [error, setError] = useState<string | null>(null);
  const playbackWindowCache = usePlaybackWindowCache();
  const inFlightFrameRequestsRef = useRef(new Set<string>());
  const frameLoadReasonRef = useRef<FrameLoadReason>("load");
  const currentTimeNsRef = useRef<bigint | undefined>(undefined);
  const sourceKeyRef = useRef(sourceKey);
  const heldMessagesByTopicRef = useRef(new Map<string, McapDecodedMessage>());
  const sourceProblem = sourceProblemMessage(source);
  const timelineKey = timelineCacheKey(
    sourceKey,
    activeTimeline,
    timelineTickRateHz,
    maxTimelineTicks
  );
  const timelineReadyForSource = timelineSourceKey === timelineKey;
  const timeNs = timelineReadyForSource ? timelineTicks[frameIndex] : undefined;
  const playIntervalMs = 1_000 / timelineTickRateHz;
  const relativeTimeNs =
    timeNs !== undefined && timelineRange !== null
      ? timeNs - timelineRange.startTimeNs
      : undefined;

  useEffect(() => {
    sourceKeyRef.current = sourceKey;
  }, [sourceKey]);

  useEffect(() => {
    currentTimeNsRef.current = timeNs;
  }, [timeNs]);

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
      setTimelineStatus("idle");
      return;
    }

    let cancelled = false;
    frameLoadReasonRef.current = "load";
    playbackWindowCache.clear();
    inFlightFrameRequestsRef.current.clear();
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
        displayMessagesForWindow(
          cachedWindow,
          heldMessagesByTopicRef.current,
          frameLoadReasonRef.current === "playback"
        )
      );
      setFrameStatus("ready");
      return;
    }

    if (isPlaying && frameLoadReasonRef.current === "playback") {
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
    const requestSourceKey = sourceKey;
    inFlightFrameRequestsRef.current.add(cacheKey);
    setFrameStatus("loading");
    setError(null);

    readSynchronizedFrame(mcap, source, activeTimeline, timeNs)
      .then((window) => {
        playbackWindowCache.set(cacheKey, window);
        if (
          cancelled ||
          sourceKeyRef.current !== requestSourceKey ||
          currentTimeNsRef.current !== timeNs
        ) {
          return;
        }

        setDisplayMessagesByTopic(
          displayMessagesForWindow(
            window,
            heldMessagesByTopicRef.current,
            frameLoadReasonRef.current === "playback"
          )
        );
        setFrameStatus("ready");
      })
      .catch((caughtError) => {
        if (
          cancelled ||
          sourceKeyRef.current !== requestSourceKey ||
          currentTimeNsRef.current !== timeNs
        ) {
          return;
        }

        if (frameLoadReasonRef.current !== "playback") {
          heldMessagesByTopicRef.current.clear();
          setDisplayMessagesByTopic({});
        }
        setFrameStatus("error");
        setError(errorMessage(caughtError));
      })
      .finally(() => {
        inFlightFrameRequestsRef.current.delete(cacheKey);
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
    timelineReadyForSource,
  ]);

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

    const lookaheadTicks = playbackLookaheadTicks(timelineTicks, frameIndex);
    const ticksToLoad = lookaheadTicks.filter((nextTimeNs) => {
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
          displayMessagesForWindow(
            cachedWindow,
            heldMessagesByTopicRef.current,
            true
          )
        );
        setFrameStatus("ready");
      }
      return;
    }

    const requestSourceKey = sourceKey;
    const cacheKeys = ticksToLoad.map((nextTimeNs) =>
      frameCacheKey(requestSourceKey, activeTimeline, nextTimeNs)
    );
    for (const cacheKey of cacheKeys) {
      inFlightFrameRequestsRef.current.add(cacheKey);
    }

    if (
      !playbackWindowCache.has(frameCacheKey(sourceKey, activeTimeline, timeNs))
    ) {
      setFrameStatus("loading");
      setError(null);
    }

    mcap
      .readSynchronizedMessageBatch({
        activeTimeline,
        source,
        streamPolicies: STREAM_SYNC_POLICIES,
        timeNs: ticksToLoad,
        topics: PLAYBACK_TOPICS,
      })
      .then((windows) => {
        if (sourceKeyRef.current !== requestSourceKey) {
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
              heldMessagesByTopicRef.current,
              true
            )
          );
          setFrameStatus("ready");
        }
      })
      .catch((caughtError) => {
        if (sourceKeyRef.current !== requestSourceKey) {
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
              heldMessagesByTopicRef.current,
              true
            )
          );
        }
      })
      .finally(() => {
        for (const cacheKey of cacheKeys) {
          inFlightFrameRequestsRef.current.delete(cacheKey);
        }
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
    timelineReadyForSource,
    timelineTicks,
  ]);

  useEffect(() => {
    if (!isPlaying || !timelineReadyForSource || timelineTicks.length <= 1) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      frameLoadReasonRef.current = "playback";
      setFrameIndex((current) => (current + 1) % timelineTicks.length);
    }, playIntervalMs);

    return () => window.clearInterval(interval);
  }, [isPlaying, playIntervalMs, timelineReadyForSource, timelineTicks.length]);

  const handlePlayClick = () => {
    setIsPlaying((playing) => {
      const nextPlaying = !playing;
      if (nextPlaying) {
        frameLoadReasonRef.current = "playback";
      }
      return nextPlaying;
    });
  };

  const handleTimelineChange = (event: ChangeEvent<HTMLInputElement>) => {
    frameLoadReasonRef.current = "seek";
    setIsPlaying(false);
    setFrameIndex(Number(event.currentTarget.value));
  };

  const handleActiveTimelineChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    frameLoadReasonRef.current = "load";
    setIsPlaying(false);
    heldMessagesByTopicRef.current.clear();
    setDisplayMessagesByTopic({});
    setActiveTimeline(event.currentTarget.value as McapActiveTimeline);
  };

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>MCAP synchronized playback POC</div>
          <div style={styles.meta}>
            Scene inventory: {inventoryState.data?.inventoryId ?? "loading"}
          </div>
          <div style={styles.meta}>
            Playback plan: {playbackPlanState.data?.planId ?? "loading"}
          </div>
        </div>
        <div style={styles.badge}>
          {frameStatusLabel(timelineStatus, frameStatus)}
        </div>
      </div>

      {sourceProblem ? (
        <Notice tone="error">{sourceProblem}</Notice>
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <Notice tone="info">
          Source: {source?.sourceId ?? "unknown"} · {activeTimeline} ·{" "}
          {timelineTicks.length} timeline ticks
        </Notice>
      )}

      <div style={styles.streamGrid}>
        {STREAMS.map((stream) => (
          <StreamPanel
            key={stream.topic}
            message={displayMessagesByTopic[stream.topic]}
            stream={stream}
          />
        ))}
      </div>

      <div style={styles.timeline}>
        <label style={styles.timelineSelectLabel}>
          Timeline
          <select
            onChange={handleActiveTimelineChange}
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
          disabled={timelineTicks.length <= 1}
          onClick={handlePlayClick}
          style={styles.button}
          type="button"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <input
          disabled={timelineTicks.length <= 1}
          max={Math.max(timelineTicks.length - 1, 0)}
          min={0}
          onChange={handleTimelineChange}
          style={styles.range}
          type="range"
          value={Math.min(frameIndex, Math.max(timelineTicks.length - 1, 0))}
        />
        <div style={styles.timeReadout}>
          {timelineTicks.length > 0 ? frameIndex + 1 : 0}/{timelineTicks.length}
          {relativeTimeNs !== undefined
            ? ` · ${formatSeconds(relativeTimeNs)}`
            : ""}
        </div>
      </div>
    </div>
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

function usePlaybackWindowCache(): PlaybackWindowCache {
  const cacheRef = useRef<PlaybackWindowCache | null>(null);

  if (!cacheRef.current) {
    cacheRef.current = new LRUCache<string, McapSynchronizedMessageWindow>({
      max: PLAYBACK_WINDOW_CACHE_MAX_ENTRIES,
    });
  }

  return cacheRef.current;
}

function readSynchronizedFrame(
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

function playbackLookaheadTicks(ticks: readonly bigint[], frameIndex: number) {
  const count = Math.min(PLAYBACK_BATCH_FRAME_COUNT, ticks.length);
  const lookaheadTicks: bigint[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const timeNs = ticks[(frameIndex + offset) % ticks.length];
    if (timeNs !== undefined && !lookaheadTicks.includes(timeNs)) {
      lookaheadTicks.push(timeNs);
    }
  }

  return lookaheadTicks;
}

function displayMessagesForWindow(
  window: McapSynchronizedMessageWindow,
  heldMessagesByTopic: Map<string, McapDecodedMessage>,
  allowHold: boolean
): DisplayMessagesByTopic {
  const messagesByTopic: DisplayMessagesByTopic = {};

  for (const topic of PLAYBACK_TOPICS) {
    const message = window.messagesByTopic[topic]?.[0];
    if (message) {
      heldMessagesByTopic.set(topic, message);
      messagesByTopic[topic] = message;
      continue;
    }

    if (allowHold) {
      const heldMessage = heldMessagesByTopic.get(topic);
      if (heldMessage) {
        messagesByTopic[topic] = heldMessage;
      }
    } else {
      heldMessagesByTopic.delete(topic);
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

function Notice({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone: "error" | "info";
}) {
  return (
    <div
      style={{
        ...styles.notice,
        ...(tone === "error" ? styles.noticeError : styles.noticeInfo),
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
  badge: {
    alignSelf: "flex-start",
    background: "#193044",
    border: "1px solid #32516b",
    borderRadius: 4,
    color: "#d9ecff",
    fontSize: 12,
    padding: "5px 8px",
    textTransform: "uppercase",
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
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
  },
  meta: {
    color: "#9fb3c8",
    fontSize: 12,
    lineHeight: 1.6,
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
  noticeInfo: {
    background: "#102638",
    border: "1px solid #23455d",
    color: "#c9dced",
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
    flex: 1,
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
  timelineSelectLabel: {
    alignItems: "center",
    color: "#c7d5e4",
    display: "flex",
    fontSize: 12,
    gap: 6,
  },
  timestamp: {
    color: "#9fb3c8",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  title: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: 800,
    marginBottom: 4,
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
