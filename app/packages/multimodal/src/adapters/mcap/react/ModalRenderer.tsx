/**
 * THIS IS POC CODE FOR DEMO COUPLED WITH NUSCENES.
 * TODO(FOEPD-3830): REPLACE THIS DECODE/FETCH SLICE WITH PRODUCTION CODE.
 */
import type { SampleRendererProps } from "@fiftyone/plugins";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PlaybackSyncMode, type StreamInventory } from "../../../schemas/v1";
import { ImagePanel } from "../../../visualization/panels/image";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import { VISUALIZATION_KIND } from "../../../visualization";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapActiveTimeline,
  type McapDecodedMessage,
  type McapStreamSyncPolicies,
} from "../types";
import { DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ } from "../timeline";
import { nonEmpty } from "../strings";
import {
  type McapLoadStatus,
  type McapPlaybackMessagesByTopic,
  type McapTimelineBufferSegment,
  type McapTimelineBufferStatus,
  useMcapPlayback,
} from "./playback-poc";
import { useMcapTopics, type McapTopicsStatus } from "./use-mcap-topics";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useStableMcapSource } from "./use-stable-mcap-source";
import {
  useMcapFrameTransforms,
  type McapFrameTransformResolver,
} from "./use-mcap-frame-transforms";

const ACTIVE_TIMELINE_OPTIONS = [MCAP_ACTIVE_TIMELINE.LOG] as const;
const MCAP_TOPIC_METADATA_KEY = "mcap.topic";
const MCAP_FRAME_ID_METADATA_KEY = "mcap.channel_metadata.frame_id";
const EMPTY_STREAM_METADATA = Object.freeze({}) as Readonly<
  Record<string, string>
>;
const PLAYBACK_STREAM_BINDINGS: readonly McapPlaybackStreamBinding[] = [
  {
    fallbackLabel: "Front camera",
    topic: "/CAM_FRONT/image_rect_compressed",
  },
  {
    fallbackLabel: "Front-left camera",
    topic: "/CAM_FRONT_LEFT/image_rect_compressed",
  },
  {
    fallbackLabel: "Top lidar",
    topic: "/LIDAR_TOP",
  },
] as const;
const MCAP_DEMO_PLAYBACK_TOPICS = PLAYBACK_STREAM_BINDINGS.map(
  (binding) => binding.topic
);
const CAMERA_SYNC_LOOKBACK_NS = 120_000_000n;
const LIDAR_SYNC_LOOKBACK_NS = 200_000_000n;
const CAMERA_SYNC_POLICY = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: CAMERA_SYNC_LOOKBACK_NS,
} as const;
const STREAM_SYNC_POLICIES: McapStreamSyncPolicies = {
  "/CAM_FRONT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_FRONT_LEFT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/LIDAR_TOP": {
    mode: PlaybackSyncMode.LATEST,
    toleranceBeforeNs: LIDAR_SYNC_LOOKBACK_NS,
  },
};
// Auto is a local sensor-viewer policy. Dataset-specific sensor frames are not
// listed here; they enter through decoded message or stream metadata.
const LOCAL_SENSOR_FIXED_FRAME_PREFERENCE = [
  "base_link",
  "base_footprint",
  "ego_vehicle",
  "ego",
  "vehicle",
  "body",
] as const;
const GLOBAL_FIXED_FRAME_FALLBACK_PREFERENCE = [
  "odom",
  "map",
  "world",
] as const;
const AUTO_FIXED_FRAME_VALUE = "__auto__";

type McapPlaybackStreamBinding = {
  readonly fallbackLabel: string;
  readonly topic: string;
};
type McapHydratedPlaybackStreamSpec = {
  readonly coordinateFrameId?: string;
  readonly label: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly payload?: StreamInventory["payload"];
  readonly recordCount?: string;
  readonly streamId: string;
  readonly topic: string;
};
type StreamGridProps = {
  readonly fixedFrameSelection: string;
  readonly frameIds: readonly string[];
  readonly resolveFrameTransform: McapFrameTransformResolver;
  readonly frameTransformsReady: boolean;
  readonly messagesByTopic: McapPlaybackMessagesByTopic;
  readonly onFixedFrameSelectionChange: (frameId: string) => void;
  readonly streams: readonly McapHydratedPlaybackStreamSpec[];
};
type TimelineControlsProps = {
  readonly activeTimeline: McapActiveTimeline;
  readonly bufferStatus: McapTimelineBufferStatus;
  readonly canPlay: boolean;
  readonly frameIndex: number;
  readonly frameStatus: McapLoadStatus;
  readonly isPlaying: boolean;
  readonly relativeTimeNs: bigint | undefined;
  readonly timelineStatus: McapLoadStatus;
  readonly timelineTickCount: number;
  readonly onActiveTimelineChange: (
    event: ChangeEvent<HTMLSelectElement>
  ) => void;
  readonly onPlayClick: () => void;
  readonly onTimelineChange: (event: ChangeEvent<HTMLInputElement>) => void;
};
type ModalRendererProps = SampleRendererProps & {
  readonly timelineTickRateHz?: number;
};

/**
 * Modal proof renderer for MCAP-backed multimodal samples.
 */
export function ModalRenderer({
  ctx,
  timelineTickRateHz = DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
}: ModalRendererProps) {
  const mcap = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  const topicState = useMcapTopics({ client: mcap, source });
  const [fixedFrameSelection, setFixedFrameSelection] = useState(
    AUTO_FIXED_FRAME_VALUE
  );
  const streams = useMemo(
    () =>
      hydrateMcapPlaybackStreamSpecs({
        bindings: PLAYBACK_STREAM_BINDINGS,
        topics: topicState.topics,
      }),
    [topicState.topics]
  );
  // Playback data path: this POC reads MCAP bytes directly through the adapter's
  // worker-backed resource client. It does not currently depend on server-side
  // inventory or playback-plan query artifacts.
  const playback = useMcapPlayback({
    client: mcap,
    source,
    streamPolicies: STREAM_SYNC_POLICIES,
    timelineTickRateHz,
    topics: MCAP_DEMO_PLAYBACK_TOPICS,
  });
  const frameTransforms = useMcapFrameTransforms({
    activeTimeline: playback.activeTimeline,
    client: mcap,
    source,
    timeNs: playback.timeNs,
  });

  const handlePlayClick = () => {
    playback.togglePlaying();
  };

  const handleTimelineChange = (event: ChangeEvent<HTMLInputElement>) => {
    playback.seekFrame(Number(event.currentTarget.value));
  };

  const handleActiveTimelineChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    playback.selectActiveTimeline(
      event.currentTarget.value as McapActiveTimeline
    );
  };

  return (
    <div style={styles.shell}>
      {playback.error ? <ErrorNotice>{playback.error}</ErrorNotice> : null}
      {frameTransforms.error ? (
        <ErrorNotice>{frameTransforms.error}</ErrorNotice>
      ) : null}
      <StreamGrid
        fixedFrameSelection={fixedFrameSelection}
        frameIds={frameTransforms.frameIds}
        frameTransformsReady={frameTransforms.status === "ready"}
        messagesByTopic={playback.displayMessagesByTopic}
        onFixedFrameSelectionChange={setFixedFrameSelection}
        resolveFrameTransform={frameTransforms.resolve}
        streams={streams}
      />
      <TimelineControls
        activeTimeline={playback.activeTimeline}
        bufferStatus={playback.bufferStatus}
        canPlay={playback.canPlay}
        frameIndex={playback.frameIndex}
        frameStatus={playback.frameStatus}
        isPlaying={playback.isPlaying}
        onActiveTimelineChange={handleActiveTimelineChange}
        onPlayClick={handlePlayClick}
        onTimelineChange={handleTimelineChange}
        relativeTimeNs={playback.relativeTimeNs}
        timelineStatus={playback.timelineStatus}
        timelineTickCount={playback.timelineTickCount}
      />
      <TopicInventoryPanel
        error={topicState.error}
        status={topicState.status}
        topics={topicState.topics}
      />
    </div>
  );
}

// UI-only pieces below receive already-orchestrated playback state. Keeping
// them dumb makes the data flow above easier to audit when playback evolves.
function StreamGrid({
  fixedFrameSelection,
  frameIds,
  frameTransformsReady,
  messagesByTopic,
  onFixedFrameSelectionChange,
  resolveFrameTransform,
  streams,
}: StreamGridProps) {
  return (
    <div style={styles.streamGrid}>
      {streams.map((stream) => (
        <StreamPanel
          fixedFrameSelection={fixedFrameSelection}
          frameIds={frameIds}
          frameTransformsReady={frameTransformsReady}
          key={stream.topic}
          message={messagesByTopic[stream.topic]}
          onFixedFrameSelectionChange={onFixedFrameSelectionChange}
          resolveFrameTransform={resolveFrameTransform}
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
  readonly bufferStatus: McapTimelineBufferStatus;
  readonly frameIndex: number;
  readonly frameStatus: McapLoadStatus;
  readonly timelineStatus: McapLoadStatus;
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
  readonly status: McapTopicsStatus;
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
                <div style={styles.topicStreamId}>
                  {topicInventoryDetail(topic)}
                </div>
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

function timelineBufferSegmentStyle(
  segment: McapTimelineBufferSegment
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
  timelineStatus: McapLoadStatus,
  frameStatus: McapLoadStatus
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

function timelineBufferLabel(status: McapTimelineBufferStatus) {
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

function StreamPanel({
  fixedFrameSelection,
  frameIds,
  frameTransformsReady,
  message,
  onFixedFrameSelectionChange,
  resolveFrameTransform,
  stream,
}: {
  readonly fixedFrameSelection: string;
  readonly frameIds: readonly string[];
  readonly frameTransformsReady: boolean;
  readonly message: McapDecodedMessage | undefined;
  readonly onFixedFrameSelectionChange: (frameId: string) => void;
  readonly resolveFrameTransform: McapFrameTransformResolver;
  readonly stream: McapHydratedPlaybackStreamSpec;
}) {
  const pointCloudSourceFrameId = pointCloudSourceFrameForMessage({
    message,
    stream,
  });
  const explicitFixedFrameId = selectedFixedFrameId(fixedFrameSelection);
  const frameSelectorOptions = useMemo(
    () =>
      frameSelectionOptions({
        frameIds,
        resolveFrameTransform,
        sourceFrameId: pointCloudSourceFrameId,
        timeNs: message?.timelineTimeNs,
      }),
    [
      frameIds,
      message?.timelineTimeNs,
      pointCloudSourceFrameId,
      resolveFrameTransform,
    ]
  );

  useEffect(() => {
    if (
      pointCloudSourceFrameId &&
      explicitFixedFrameId &&
      !frameSelectorOptions.includes(explicitFixedFrameId)
    ) {
      onFixedFrameSelectionChange(AUTO_FIXED_FRAME_VALUE);
    }
  }, [
    explicitFixedFrameId,
    frameSelectorOptions,
    onFixedFrameSelectionChange,
    pointCloudSourceFrameId,
  ]);

  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <div>
          <div style={styles.panelTitle}>{stream.label}</div>
          <div style={styles.topic}>{streamSubtitle(stream)}</div>
        </div>
        <div style={styles.panelHeaderControls}>
          <div style={styles.timestamp}>
            {message ? formatSeconds(message.timelineTimeNs) : "no frame"}
          </div>
          {pointCloudSourceFrameId ? (
            <FrameSelector
              onChange={onFixedFrameSelectionChange}
              options={frameSelectorOptions}
              selectedFrameId={fixedFrameSelection}
              sourceFrameId={pointCloudSourceFrameId}
            />
          ) : null}
        </div>
      </div>
      <div style={styles.viewport}>
        {message ? (
          <VisualizationFrame
            fixedFrameSelection={fixedFrameSelection}
            frameTransformsReady={frameTransformsReady}
            message={message}
            resolveFrameTransform={resolveFrameTransform}
            stream={stream}
          />
        ) : (
          <div style={styles.empty}>No synchronized message in tolerance</div>
        )}
      </div>
    </section>
  );
}

function VisualizationFrame({
  fixedFrameSelection,
  frameTransformsReady,
  message,
  resolveFrameTransform,
  stream,
}: {
  readonly fixedFrameSelection: string;
  readonly frameTransformsReady: boolean;
  readonly message: McapDecodedMessage;
  readonly resolveFrameTransform: McapFrameTransformResolver;
  readonly stream: McapHydratedPlaybackStreamSpec;
}) {
  const visualization = message.decoded.output.visualization;

  if (!visualization) {
    return <div style={styles.empty}>No visualization for decoded message</div>;
  }

  if (visualization.kind === VISUALIZATION_KIND.ENCODED_IMAGE) {
    return (
      <ImagePanel frame={visualization} style={styles.visualizationPanel} />
    );
  }

  if (visualization.kind === VISUALIZATION_KIND.POINT_CLOUD) {
    const frameTransformState = pointCloudFrameTransform({
      // Prefer the decoded message frame because Foxglove payloads can carry a
      // frame_id per message. The stream frame is only the readTopics channel
      // metadata fallback for payloads that omit their own frame.
      sourceFrameId:
        nonEmpty(visualization.coordinateFrameId) ??
        nonEmpty(stream.coordinateFrameId),
      targetFrameId: selectedFixedFrameId(fixedFrameSelection),
      frameTransformsReady,
      resolveFrameTransform,
      timeNs: message.timelineTimeNs,
    });

    return (
      <PointCloudPanel
        frameTransform={frameTransformState.transform}
        frame={visualization}
        style={styles.visualizationPanel}
        warning={frameTransformState.warning}
      />
    );
  }

  return <div style={styles.empty}>Unsupported visualization</div>;
}

function pointCloudFrameTransform({
  frameTransformsReady,
  resolveFrameTransform,
  sourceFrameId,
  targetFrameId,
  timeNs,
}: {
  readonly frameTransformsReady: boolean;
  readonly resolveFrameTransform: McapFrameTransformResolver;
  readonly sourceFrameId: string | undefined;
  readonly targetFrameId: string | undefined;
  readonly timeNs: bigint;
}) {
  if (!sourceFrameId) {
    return {
      transform: undefined,
      warning: null,
    };
  }

  const frameResolution = resolveFixedFrameTransform({
    resolveFrameTransform,
    sourceFrameId,
    targetFrameId,
    timeNs,
  });
  if (frameResolution.status === "resolved") {
    return {
      transform: frameResolution.transform,
      warning: null,
    };
  }

  return {
    transform: undefined,
    warning:
      frameResolution.status === "pending"
        ? `Waiting for frame transforms from ${sourceFrameId} to ${frameResolution.targetFrameId}`
        : frameTransformsReady
        ? targetFrameId
          ? `No frame transform path from ${sourceFrameId} to ${targetFrameId}`
          : `No frame transform path from ${sourceFrameId} to a fixed frame`
        : null,
  };
}

function resolveFixedFrameTransform({
  resolveFrameTransform,
  sourceFrameId,
  targetFrameId,
  timeNs,
}: {
  readonly resolveFrameTransform: McapFrameTransformResolver;
  readonly sourceFrameId: string;
  readonly targetFrameId: string | undefined;
  readonly timeNs: bigint;
}) {
  if (targetFrameId) {
    return resolveFrameTransform(sourceFrameId, targetFrameId, timeNs);
  }

  let pending: ReturnType<McapFrameTransformResolver> | undefined = undefined;
  const candidates = autoFixedFrameCandidates(sourceFrameId);

  for (const targetFrameId of candidates) {
    const resolution = resolveFrameTransform(
      sourceFrameId,
      targetFrameId,
      timeNs
    );
    if (resolution.status === "resolved") {
      return resolution;
    }
    if (resolution.status === "pending" && !pending) {
      pending = resolution;
    }
  }

  return (
    pending ?? {
      sourceFrameId,
      status: "missing" as const,
      targetFrameId: candidates[0] ?? sourceFrameId,
    }
  );
}

function FrameSelector({
  onChange,
  options,
  selectedFrameId,
  sourceFrameId,
}: {
  readonly onChange: (frameId: string) => void;
  readonly options: readonly string[];
  readonly selectedFrameId: string;
  readonly sourceFrameId: string;
}) {
  return (
    <label style={styles.frameSelectorLabel}>
      <span style={styles.frameSelectorText}>Frame</span>
      <select
        aria-label="Fixed frame"
        onChange={(event) => onChange(event.target.value)}
        style={styles.frameSelector}
        title={`source: ${sourceFrameId}`}
        value={selectedFrameId}
      >
        <option value={AUTO_FIXED_FRAME_VALUE}>Auto</option>
        {options.map((frameId) => (
          <option key={frameId} value={frameId}>
            {frameId === sourceFrameId ? `${frameId} (source)` : frameId}
          </option>
        ))}
      </select>
    </label>
  );
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

function hydrateMcapPlaybackStreamSpecs({
  bindings,
  topics,
}: {
  readonly bindings: readonly McapPlaybackStreamBinding[];
  readonly topics: readonly StreamInventory[];
}): readonly McapHydratedPlaybackStreamSpec[] {
  const topicsByMcapTopic = inventoryByMcapTopic(topics);

  return bindings.map((binding) => {
    const inventory = topicsByMcapTopic.get(binding.topic);
    const coordinateFrameId = nonEmpty(
      inventory?.metadata[MCAP_FRAME_ID_METADATA_KEY]
    );

    return {
      ...(coordinateFrameId ? { coordinateFrameId } : {}),
      label: nonEmpty(inventory?.displayName) ?? binding.fallbackLabel,
      metadata: inventory?.metadata ?? EMPTY_STREAM_METADATA,
      ...(inventory?.payload ? { payload: inventory.payload } : {}),
      ...(inventory?.recordCount ? { recordCount: inventory.recordCount } : {}),
      streamId: nonEmpty(inventory?.streamId) ?? binding.topic,
      topic: binding.topic,
    };
  });
}

function inventoryByMcapTopic(topics: readonly StreamInventory[]) {
  const topicsByMcapTopic = new Map<string, StreamInventory>();

  for (const topic of topics) {
    const mcapTopic = nonEmpty(topic.metadata[MCAP_TOPIC_METADATA_KEY]);
    if (mcapTopic && !topicsByMcapTopic.has(mcapTopic)) {
      topicsByMcapTopic.set(mcapTopic, topic);
    }
  }

  for (const topic of topics) {
    const displayName = nonEmpty(topic.displayName);
    if (displayName && !topicsByMcapTopic.has(displayName)) {
      topicsByMcapTopic.set(displayName, topic);
    }
  }

  return topicsByMcapTopic;
}

function pointCloudSourceFrameForMessage({
  message,
  stream,
}: {
  readonly message: McapDecodedMessage | undefined;
  readonly stream: McapHydratedPlaybackStreamSpec;
}) {
  const visualization = message?.decoded.output.visualization;
  if (visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
    return undefined;
  }

  return (
    nonEmpty(visualization.coordinateFrameId) ??
    nonEmpty(stream.coordinateFrameId)
  );
}

function selectedFixedFrameId(selection: string) {
  return selection === AUTO_FIXED_FRAME_VALUE ? undefined : selection;
}

function frameSelectionOptions({
  frameIds,
  resolveFrameTransform,
  sourceFrameId,
  timeNs,
}: {
  readonly frameIds: readonly string[];
  readonly resolveFrameTransform: McapFrameTransformResolver;
  readonly sourceFrameId: string | undefined;
  readonly timeNs: bigint | undefined;
}) {
  const options: string[] = [];
  const seen = new Set<string>();
  const knownFrameIds = new Set(frameIds);
  const source = nonEmpty(sourceFrameId);

  for (const frameId of LOCAL_SENSOR_FIXED_FRAME_PREFERENCE) {
    if (
      isSelectableFrameOption({
        frameId,
        knownFrameIds,
        resolveFrameTransform,
        sourceFrameId: source,
        timeNs,
      })
    ) {
      appendFrameOption(options, seen, frameId);
    }
  }

  appendFrameOption(options, seen, source);

  for (const frameId of frameIds) {
    if (
      isSelectableFrameOption({
        frameId,
        knownFrameIds,
        resolveFrameTransform,
        sourceFrameId: source,
        timeNs,
      })
    ) {
      appendFrameOption(options, seen, frameId);
    }
  }

  for (const frameId of GLOBAL_FIXED_FRAME_FALLBACK_PREFERENCE) {
    if (
      isSelectableFrameOption({
        frameId,
        knownFrameIds,
        resolveFrameTransform,
        sourceFrameId: source,
        timeNs,
      })
    ) {
      appendFrameOption(options, seen, frameId);
    }
  }

  return options;
}

function autoFixedFrameCandidates(sourceFrameId: string) {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const frameId of LOCAL_SENSOR_FIXED_FRAME_PREFERENCE) {
    appendFrameOption(candidates, seen, frameId);
  }

  for (const frameId of GLOBAL_FIXED_FRAME_FALLBACK_PREFERENCE) {
    appendFrameOption(candidates, seen, frameId);
  }

  appendFrameOption(candidates, seen, sourceFrameId);

  return candidates;
}

function isSelectableFrameOption({
  frameId,
  knownFrameIds,
  resolveFrameTransform,
  sourceFrameId,
  timeNs,
}: {
  readonly frameId: string;
  readonly knownFrameIds: ReadonlySet<string>;
  readonly resolveFrameTransform: McapFrameTransformResolver;
  readonly sourceFrameId: string | undefined;
  readonly timeNs: bigint | undefined;
}) {
  if (!sourceFrameId || timeNs === undefined) {
    return false;
  }

  const resolution = resolveFrameTransform(sourceFrameId, frameId, timeNs);

  return (
    resolution.status === "resolved" ||
    (resolution.status === "pending" && knownFrameIds.has(frameId))
  );
}

function appendFrameOption(
  options: string[],
  seen: Set<string>,
  frameId: string | undefined
) {
  const cleaned = nonEmpty(frameId);
  if (!cleaned || seen.has(cleaned)) {
    return;
  }

  seen.add(cleaned);
  options.push(cleaned);
}

function formatSeconds(ns: bigint) {
  return `${(Number(ns) / 1_000_000_000).toFixed(3)}s`;
}

function streamSubtitle(stream: McapHydratedPlaybackStreamSpec) {
  return stream.coordinateFrameId
    ? `${stream.topic} · ${stream.coordinateFrameId}`
    : stream.topic;
}

function topicInventoryDetail(topic: StreamInventory) {
  const coordinateFrameId = nonEmpty(
    topic.metadata[MCAP_FRAME_ID_METADATA_KEY]
  );

  return coordinateFrameId
    ? `${topic.streamId} · ${coordinateFrameId}`
    : topic.streamId;
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

function topicInventorySummary(status: McapTopicsStatus, topicCount: number) {
  if (status === "loading") {
    return "loading";
  }

  if (status === "error") {
    return "error";
  }

  return `${topicCount} ${topicCount === 1 ? "topic" : "topics"}`;
}

function frameStatusLabel(
  timelineStatus: McapLoadStatus,
  frameStatus: McapLoadStatus
) {
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
  frameSelector: {
    background: "#0b1622",
    border: "1px solid #32485e",
    borderRadius: 4,
    color: "#edf6ff",
    fontSize: 11,
    maxWidth: 132,
    minWidth: 96,
    padding: "4px 6px",
  },
  frameSelectorLabel: {
    alignItems: "center",
    color: "#9fb3c8",
    display: "flex",
    fontSize: 11,
    gap: 6,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  frameSelectorText: {
    whiteSpace: "nowrap",
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
  panelHeaderControls: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
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
