import type { SampleRendererProps } from "@fiftyone/plugins";
import { useTileRegistry, useSetTileSourceFor } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import type { ComponentType } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  playheadAtom,
  seekEventAtom,
  streamValueAtom,
} from "../../../../../playback/src/lib/playback/atoms";
import { usePlayback } from "../../../../../playback/src/lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../../../../playback/src/lib/playback/playback-store-context";
import type { PlaybackStream } from "../../../../../playback/src/lib/playback/types";
import type { DecodedVisualization } from "../../../decoders";
import { VISUALIZATION_KIND } from "../../../visualization";
import { DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ } from "../timeline";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import type { McapStreamSyncPolicies, McapSynchronizedMessageWindow } from "../types";
import McapCameraTile from "./McapCameraTile";
import McapLidarTile from "./McapLidarTile";
import { McapWindowCoordinator } from "./mcap-window-coordinator";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useStableMcapSource } from "./use-stable-mcap-source";

// How far ahead (in seconds) to keep the buffer filled during playback.
const LOOKAHEAD_SECONDS = 5;

export interface McapTopicSpec {
  readonly topic: string;
  readonly label: string;
}

export interface McapStreamsProps {
  ctx: SampleRendererProps["ctx"];
  cameraTopics: McapTopicSpec[];
  lidarTopic?: McapTopicSpec;
  streamPolicies?: McapStreamSyncPolicies;
}

/**
 * Mounts inside MultiModalPlayback's providers. Loads the MCAP timeline
 * range, creates a shared window coordinator, registers per-topic streams
 * with the playback engine, registers tiles with the tiling system, and
 * seeds the initial tile-source bindings.
 */
export function McapStreams({
  ctx,
  cameraTopics,
  lidarTopic,
  streamPolicies = {},
}: McapStreamsProps) {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  const [coordinator, setCoordinator] = useState<McapWindowCoordinator | null>(
    null
  );
  const setTileSource = useSetTileSourceFor();
  const tilesSeededRef = useRef(false);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;

    const allTopics = [
      ...cameraTopics.map((c) => c.topic),
      ...(lidarTopic ? [lidarTopic.topic] : []),
    ];

    client
      .readTimelineRange({ source, activeTimeline: MCAP_ACTIVE_TIMELINE.LOG })
      .then((range) => {
        if (cancelled) return;
        setCoordinator(
          new McapWindowCoordinator(
            client,
            source,
            range,
            allTopics,
            streamPolicies,
            MCAP_ACTIVE_TIMELINE.LOG
          )
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // Treat source, topics, and policies as mount-time config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Seed initial tile-source bindings once the coordinator is ready.
  // Uses the same `${topic}-1` key convention as initialTiles in entry.tsx.
  useEffect(() => {
    if (!coordinator || tilesSeededRef.current) return;
    tilesSeededRef.current = true;
    for (const { topic } of cameraTopics) {
      setTileSource(`${topic}-1`, topic);
    }
    if (lidarTopic) {
      setTileSource(`${lidarTopic.topic}-1`, lidarTopic.topic);
    }
    // setTileSource is a stable jotai-backed setter — not in deps by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator]);

  if (!coordinator) return null;

  return (
    <>
      {cameraTopics.map(({ topic, label }) => (
        <McapTopicStreamRegistrar
          key={topic}
          coordinator={coordinator}
          topic={topic}
          title={label}
          type="camera"
          Tile={McapCameraTile}
          extractVisualization={(viz) =>
            viz?.kind === VISUALIZATION_KIND.ENCODED_IMAGE ? viz : null
          }
        />
      ))}
      {lidarTopic && (
        <McapTopicStreamRegistrar
          coordinator={coordinator}
          topic={lidarTopic.topic}
          title={lidarTopic.label}
          type="lidar"
          Tile={McapLidarTile}
          extractVisualization={(viz) =>
            viz?.kind === VISUALIZATION_KIND.POINT_CLOUD ? viz : null
          }
        />
      )}
    </>
  );
}

interface McapTopicStreamRegistrarProps {
  readonly coordinator: McapWindowCoordinator;
  readonly topic: string;
  readonly title: string;
  readonly type: "camera" | "lidar";
  readonly Tile: ComponentType;
  readonly extractVisualization: (
    viz: DecodedVisualization | undefined
  ) => unknown;
}

/**
 * Registers one MCAP topic as a PlaybackStream and as a tiling tile entry.
 * Renders nothing — exists only to drive effects inside the providers.
 *
 * Three data paths:
 * - Mount: immediately prefetches frame at playhead so tiles populate on open.
 * - Playing: RAF loop calls bufferState/prefetch/onCommit. prefetch is two-lane:
 *   urgent prefetchAt(current) + batch prefetchRange(lookahead).
 * - Paused + seek: seekEventAtom fires → prefetchAt resolves → writes to atom.
 *
 * Hold-last-frame: a per-topic ref retains the last non-null visualization so
 * sparse sync windows never blank the tile mid-playback.
 */
function McapTopicStreamRegistrar({
  coordinator,
  topic,
  title,
  type,
  Tile,
  extractVisualization,
}: McapTopicStreamRegistrarProps) {
  const { registerStream } = usePlayback();
  const { registerTile } = useTileRegistry();
  const store = usePlaybackStore();
  const seekEvent = useAtomValue(seekEventAtom, { store });
  // Hold the last non-null frame so sparse windows don't blank the tile.
  const lastFrameRef = useRef<unknown>(null);

  const writeFrame = useCallback(
    (window: McapSynchronizedMessageWindow | null) => {
      const msg = window?.messagesByTopic[topic]?.[0];
      const next = extractVisualization(msg?.decoded.output.visualization);
      if (next !== null) lastFrameRef.current = next;
      store.set(streamValueAtom(topic), lastFrameRef.current);
    },
    // extractVisualization is a stable inline arrow — intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topic, store]
  );

  // Mount-time prefetch: immediately fetch the frame at the current playhead
  // so tiles show data on open without requiring the user to play or seek.
  useEffect(() => {
    let cancelled = false;
    coordinator.prefetchAt(store.get(playheadAtom)).then((window) => {
      if (!cancelled) writeFrame(window);
    });
    return () => {
      cancelled = true;
    };
  }, [coordinator, store, writeFrame]);

  // Proactive lookahead: keep the buffer filled ahead of the playhead during
  // playback. The engine's prefetch only fires when the CURRENT frame is
  // missing — it never pre-fills future ticks while currently-buffered frames
  // are playing. This subscription fires every RAF tick so the lookahead
  // window stays full throughout playback without stalling at buffer edges.
  useEffect(() => {
    return store.sub(playheadAtom, () => {
      const t = store.get(playheadAtom);
      coordinator.prefetchRange(t, t + LOOKAHEAD_SECONDS);
    });
  }, [store, coordinator]);

  // Paused-seek path: fetch and push data when the user scrubs while paused.
  useEffect(() => {
    if (!seekEvent) return;
    let cancelled = false;
    coordinator.prefetchAt(seekEvent.time).then((window) => {
      if (!cancelled) writeFrame(window);
    });
    return () => {
      cancelled = true;
    };
  }, [seekEvent, coordinator, writeFrame]);

  // Register the stream with the playback engine.
  useEffect(() => {
    const nativeStep = 1 / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;
    const stream: PlaybackStream = {
      id: topic,
      blocking: true,
      duration: coordinator.durationSec,
      nativeStepSeconds: nativeStep,
      lookaheadSeconds: LOOKAHEAD_SECONDS,
      bufferState: (timeSec) => coordinator.bufferStateAt(timeSec),
      // Two-lane prefetch: urgent single-tick for the current frame so the
      // engine unblocks as soon as that one window is ready, then a batch
      // request for lookahead so subsequent ticks are already cached.
      prefetch: ([startSec, endSec]) => {
        coordinator.prefetchAt(startSec);
        coordinator.prefetchRange(startSec + nativeStep, endSec);
      },
      onCommit: (timeSec, commitStore) => {
        const window = coordinator.getWindowAt(timeSec);
        const msg = window?.messagesByTopic[topic]?.[0];
        const next = extractVisualization(msg?.decoded.output.visualization);
        if (next !== null) lastFrameRef.current = next;
        commitStore.set(streamValueAtom(topic), lastFrameRef.current);
      },
    };
    return registerStream(stream);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator, topic, registerStream]);

  // Register the tile with the tiling system.
  useEffect(() => {
    return registerTile({
      streamId: topic,
      type,
      typeLabel: type === "camera" ? "Camera" : "Lidar",
      title,
      icon: type === "camera" ? IconName.GridView : IconName.Embeddings,
      Tile,
    });
  }, [registerTile, topic, type, title, Tile]);

  return null;
}
