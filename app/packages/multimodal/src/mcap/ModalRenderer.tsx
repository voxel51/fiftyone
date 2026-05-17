/**
 * THIS IS POC CODE FOR DEMO COUPLED WITH NUSCENES.
 * TODO(FOEPD-3830): REPLACE THIS DECODE/FETCH SLICE WITH PRODUCTION CODE.
 */
import type { SampleRendererProps } from "@fiftyone/plugins";
import { LRUCache } from "lru-cache";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../client";
import { usePlaybackPlan, useSceneInventory } from "../client/hooks";
import type { DecodedVisualization } from "../decoders";
import { PlaybackSyncMode } from "../schemas/v1";
import { ImagePanel } from "../visualization/panels/image";
import { PointCloudPanel } from "../visualization/panels/point-cloud";
import { VISUALIZATION_KIND } from "../visualization";
import {
  type McapDecodedMessage,
  type McapResourceClient,
  type McapStreamSyncPolicies,
  type McapSynchronizedMessageWindow,
} from "./types";
import { getMcapSourceDescriptor, getSampleIdentifiers } from "./sample";
import { createWorkerMcapResourceClient } from "./worker";

const TIMELINE_TOPIC = "/CAM_FRONT/image_rect_compressed";
const PLAYBACK_TOPICS = [
  "/CAM_FRONT/image_rect_compressed",
  "/CAM_FRONT_LEFT/image_rect_compressed",
  "/LIDAR_TOP",
] as const;
const TIMELINE_LIMIT = 120;
const SYNC_TOLERANCE_NS = 75_000_000n;
const BASE_PLAY_INTERVAL_MS = 160;
const PLAYBACK_SPEED_MULTIPLIER = 1.1;
const PLAY_INTERVAL_MS = BASE_PLAY_INTERVAL_MS / PLAYBACK_SPEED_MULTIPLIER;
const PLAYBACK_BATCH_FRAME_COUNT = 8;
const PLAYBACK_WINDOW_CACHE_MAX_ENTRIES = PLAYBACK_BATCH_FRAME_COUNT * 8;
const SEEK_DEBOUNCE_MS = 50;
const STREAM_SYNC_POLICIES: McapStreamSyncPolicies = Object.fromEntries(
  PLAYBACK_TOPICS.map((topic) => [
    topic,
    {
      mode: PlaybackSyncMode.NEAREST,
      toleranceAfterNs: SYNC_TOLERANCE_NS,
      toleranceBeforeNs: SYNC_TOLERANCE_NS,
    },
  ])
);
const PLAYBACK_WINDOW_TOPICS_CACHE_KEY = PLAYBACK_TOPICS.join("\u001f");
const PLAYBACK_WINDOW_SYNC_POLICY_CACHE_KEY =
  streamSyncPoliciesCacheKey(STREAM_SYNC_POLICIES);
const PLAYBACK_WINDOW_TIMESTAMP_SOURCE_CACHE_KEY = "timestampSource=log";

type LoadStatus = "idle" | "loading" | "ready" | "error";
type FrameLoadReason = "load" | "playback" | "seek";

type StreamSpec = {
  readonly label: string;
  readonly topic: typeof PLAYBACK_TOPICS[number];
};
type PlaybackWindowCache = LRUCache<string, McapSynchronizedMessageWindow>;

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
export function ModalRenderer({ ctx }: SampleRendererProps) {
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
  const [anchors, setAnchors] = useState<readonly bigint[]>([]);
  const [anchorsSourceKey, setAnchorsSourceKey] = useState("");
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineStatus, setTimelineStatus] = useState<LoadStatus>("idle");
  const [frameStatus, setFrameStatus] = useState<LoadStatus>("idle");
  const [playbackWindow, setPlaybackWindow] =
    useState<McapSynchronizedMessageWindow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playbackWindowCache = usePlaybackWindowCache();
  const inFlightFrameRequestsRef = useRef(new Set<string>());
  const frameLoadReasonRef = useRef<FrameLoadReason>("load");
  const currentAnchorTimeNsRef = useRef<bigint | undefined>(undefined);
  const sourceKeyRef = useRef(sourceKey);
  const sourceProblem = sourceProblemMessage(source);
  const anchorsReadyForSource = anchorsSourceKey === sourceKey;
  const anchorTimeNs = anchorsReadyForSource ? anchors[frameIndex] : undefined;
  const relativeTimeNs =
    anchorTimeNs !== undefined && anchors[0] !== undefined
      ? anchorTimeNs - anchors[0]
      : undefined;

  useEffect(() => {
    sourceKeyRef.current = sourceKey;
  }, [sourceKey]);

  useEffect(() => {
    currentAnchorTimeNsRef.current = anchorTimeNs;
  }, [anchorTimeNs]);

  useEffect(() => {
    if (!source || sourceProblem) {
      setAnchors([]);
      setAnchorsSourceKey("");
      setFrameIndex(0);
      setPlaybackWindow(null);
      playbackWindowCache.clear();
      inFlightFrameRequestsRef.current.clear();
      setTimelineStatus("idle");
      return;
    }

    let cancelled = false;
    frameLoadReasonRef.current = "load";
    playbackWindowCache.clear();
    inFlightFrameRequestsRef.current.clear();
    setAnchors([]);
    setAnchorsSourceKey("");
    setFrameIndex(0);
    setPlaybackWindow(null);
    setTimelineStatus("loading");
    setError(null);

    mcap
      .readTimelineAnchors({
        limit: TIMELINE_LIMIT,
        source,
        topic: TIMELINE_TOPIC,
      })
      .then((nextAnchors) => {
        if (cancelled) {
          return;
        }

        setAnchors(nextAnchors);
        setAnchorsSourceKey(sourceKey);
        setFrameIndex(0);
        setTimelineStatus(nextAnchors.length > 0 ? "ready" : "error");
        if (nextAnchors.length === 0) {
          setError(`No timeline messages found for ${TIMELINE_TOPIC}`);
        }
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }

        setAnchors([]);
        setAnchorsSourceKey("");
        setFrameIndex(0);
        setPlaybackWindow(null);
        setTimelineStatus("error");
        setError(errorMessage(caughtError));
      });

    return () => {
      cancelled = true;
    };
  }, [mcap, playbackWindowCache, source, sourceKey, sourceProblem]);

  useEffect(() => {
    if (
      !source ||
      sourceProblem ||
      !anchorsReadyForSource ||
      anchorTimeNs === undefined
    ) {
      setPlaybackWindow(null);
      setFrameStatus("idle");
      return;
    }

    const cacheKey = frameCacheKey(sourceKey, anchorTimeNs);
    const cachedWindow = playbackWindowCache.get(cacheKey);
    if (cachedWindow) {
      setPlaybackWindow(cachedWindow);
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
    const timeout = window.setTimeout(
      () => {
        inFlightFrameRequestsRef.current.add(cacheKey);
        setFrameStatus("loading");
        setError(null);

        readSynchronizedFrame(mcap, source, anchorTimeNs)
          .then((window) => {
            playbackWindowCache.set(cacheKey, window);
            if (
              cancelled ||
              sourceKeyRef.current !== requestSourceKey ||
              currentAnchorTimeNsRef.current !== anchorTimeNs
            ) {
              return;
            }

            setPlaybackWindow(window);
            setFrameStatus("ready");
          })
          .catch((caughtError) => {
            if (
              cancelled ||
              sourceKeyRef.current !== requestSourceKey ||
              currentAnchorTimeNsRef.current !== anchorTimeNs
            ) {
              return;
            }

            setPlaybackWindow(null);
            setFrameStatus("error");
            setError(errorMessage(caughtError));
          })
          .finally(() => {
            inFlightFrameRequestsRef.current.delete(cacheKey);
          });
      },
      frameLoadReasonRef.current === "seek" ? SEEK_DEBOUNCE_MS : 0
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    anchorTimeNs,
    anchorsReadyForSource,
    isPlaying,
    mcap,
    playbackWindowCache,
    source,
    sourceKey,
    sourceProblem,
  ]);

  useEffect(() => {
    if (
      !isPlaying ||
      !source ||
      sourceProblem ||
      !anchorsReadyForSource ||
      anchorTimeNs === undefined
    ) {
      return;
    }

    const lookaheadAnchors = playbackLookaheadAnchors(anchors, frameIndex);
    const anchorsToLoad = lookaheadAnchors.filter((nextAnchorTimeNs) => {
      const cacheKey = frameCacheKey(sourceKey, nextAnchorTimeNs);
      return (
        !playbackWindowCache.has(cacheKey) &&
        !inFlightFrameRequestsRef.current.has(cacheKey)
      );
    });

    if (anchorsToLoad.length === 0) {
      const cachedWindow = playbackWindowCache.get(
        frameCacheKey(sourceKey, anchorTimeNs)
      );
      if (cachedWindow) {
        setPlaybackWindow(cachedWindow);
        setFrameStatus("ready");
      }
      return;
    }

    const requestSourceKey = sourceKey;
    const cacheKeys = anchorsToLoad.map((nextAnchorTimeNs) =>
      frameCacheKey(requestSourceKey, nextAnchorTimeNs)
    );
    for (const cacheKey of cacheKeys) {
      inFlightFrameRequestsRef.current.add(cacheKey);
    }

    if (!playbackWindowCache.has(frameCacheKey(sourceKey, anchorTimeNs))) {
      setFrameStatus("loading");
      setError(null);
    }

    mcap
      .readSynchronizedMessageBatch({
        anchorTimeNs: anchorsToLoad,
        source,
        streamPolicies: STREAM_SYNC_POLICIES,
        topics: PLAYBACK_TOPICS,
      })
      .then((windows) => {
        if (sourceKeyRef.current !== requestSourceKey) {
          return;
        }

        for (const window of windows) {
          playbackWindowCache.set(
            frameCacheKey(requestSourceKey, window.anchorTimeNs),
            window
          );
        }

        const currentAnchorTimeNs = currentAnchorTimeNsRef.current;
        const currentWindow =
          currentAnchorTimeNs === undefined
            ? undefined
            : playbackWindowCache.get(
                frameCacheKey(requestSourceKey, currentAnchorTimeNs)
              );
        if (currentWindow) {
          setPlaybackWindow(currentWindow);
          setFrameStatus("ready");
        }
      })
      .catch((caughtError) => {
        if (sourceKeyRef.current !== requestSourceKey) {
          return;
        }

        const currentAnchorTimeNs = currentAnchorTimeNsRef.current;
        const currentWindow =
          currentAnchorTimeNs === undefined
            ? undefined
            : playbackWindowCache.get(
                frameCacheKey(requestSourceKey, currentAnchorTimeNs)
              );
        if (!currentWindow) {
          setPlaybackWindow(null);
          setFrameStatus("error");
          setError(errorMessage(caughtError));
        }
      })
      .finally(() => {
        for (const cacheKey of cacheKeys) {
          inFlightFrameRequestsRef.current.delete(cacheKey);
        }
      });
  }, [
    anchorTimeNs,
    anchors,
    anchorsReadyForSource,
    frameIndex,
    isPlaying,
    mcap,
    playbackWindowCache,
    source,
    sourceKey,
    sourceProblem,
  ]);

  useEffect(() => {
    if (!isPlaying || !anchorsReadyForSource || anchors.length <= 1) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      frameLoadReasonRef.current = "playback";
      setFrameIndex((current) => (current + 1) % anchors.length);
    }, PLAY_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [anchors.length, anchorsReadyForSource, isPlaying]);

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
          Source: {source?.sourceId ?? "unknown"} · {anchors.length} timeline
          frames
        </Notice>
      )}

      <div style={styles.streamGrid}>
        {STREAMS.map((stream) => (
          <StreamPanel
            key={stream.topic}
            message={playbackWindow?.messagesByTopic[stream.topic]?.[0]}
            stream={stream}
          />
        ))}
      </div>

      <div style={styles.timeline}>
        <button
          disabled={anchors.length <= 1}
          onClick={handlePlayClick}
          style={styles.button}
          type="button"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <input
          disabled={anchors.length <= 1}
          max={Math.max(anchors.length - 1, 0)}
          min={0}
          onChange={handleTimelineChange}
          style={styles.range}
          type="range"
          value={Math.min(frameIndex, Math.max(anchors.length - 1, 0))}
        />
        <div style={styles.timeReadout}>
          {anchors.length > 0 ? frameIndex + 1 : 0}/{anchors.length}
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
  anchorTimeNs: bigint
) {
  return mcap.readSynchronizedMessages({
    anchorTimeNs,
    source,
    streamPolicies: STREAM_SYNC_POLICIES,
    topics: PLAYBACK_TOPICS,
  });
}

function playbackLookaheadAnchors(
  anchors: readonly bigint[],
  frameIndex: number
) {
  const count = Math.min(PLAYBACK_BATCH_FRAME_COUNT, anchors.length);
  const lookaheadAnchors: bigint[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const anchorTimeNs = anchors[(frameIndex + offset) % anchors.length];
    if (
      anchorTimeNs !== undefined &&
      !lookaheadAnchors.includes(anchorTimeNs)
    ) {
      lookaheadAnchors.push(anchorTimeNs);
    }
  }

  return lookaheadAnchors;
}

function frameCacheKey(sourceKey: string, anchorTimeNs: bigint) {
  return [
    sourceKey,
    anchorTimeNs.toString(),
    PLAYBACK_WINDOW_TOPICS_CACHE_KEY,
    PLAYBACK_WINDOW_SYNC_POLICY_CACHE_KEY,
    PLAYBACK_WINDOW_TIMESTAMP_SOURCE_CACHE_KEY,
  ].join("|");
}

function streamSyncPoliciesCacheKey(policies: McapStreamSyncPolicies) {
  return PLAYBACK_TOPICS.map((topic) => {
    const policy = policies[topic];

    return [
      topic,
      policy?.mode ?? "",
      policy?.limit?.toString() ?? "",
      policy?.toleranceBeforeNs?.toString() ?? "",
      policy?.toleranceAfterNs?.toString() ?? "",
    ].join("\u001f");
  }).join("\u001e");
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
          {message ? formatSeconds(message.syncTimeNs) : "no frame"}
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
  return source
    ? [
        source.sourceId,
        source.url,
        source.sizeBytes ?? source.fingerprint?.sizeBytes ?? "",
        source.fingerprint?.firstChunkCrc?.toString() ?? "",
        source.fingerprint?.lastChunkCrc?.toString() ?? "",
      ].join("|")
    : "";
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
