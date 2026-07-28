// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge mirrors the pose-trajectory bulk fetch path.
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { byteSourceAccessKey } from "../../../query/bytes";
import type { SceneSource } from "../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../visualization";
import { MCAP_ACTIVE_TIMELINE, type McapResourceClient } from "../types";
import {
  shouldDeferMcapBulkHistory,
  startMcapBulkTopicLifecycle,
} from "./mcap-bulk-topic-lifecycle";
import {
  decimateLocationTrackSegments,
  locationPointFromVisualization,
  locationTrackColor,
  segmentLocationTrack,
  type McapLocationTrackPoint,
  type McapLocationTracks,
  type McapLocationTrackState,
} from "./mcap-location-track";

const LOCATION_TRACK_READ_LIMIT = 25_000;
const LOCATION_TRACK_DEFERRED_RETRY_MS = 2_000;

const EMPTY_LOCATION_TRACKS: McapLocationTracks = new Map();

interface McapLocationTracksContextValue {
  readonly setTracks: (
    sourceKey: string | null,
    tracks: McapLocationTracks,
  ) => void;
  readonly sourceKey: string | null;
  readonly tracks: McapLocationTracks;
}

const McapLocationTracksContext =
  createContext<McapLocationTracksContextValue | null>(null);

/**
 * Shares full-file geographic tracks with map tiles. The provider lives
 * outside playback; the bridge inside playback performs one bulk read per
 * source file and publishes normalized route segments here.
 */
export const McapLocationTracksProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [state, setState] = useState<{
    readonly sourceKey: string | null;
    readonly tracks: McapLocationTracks;
  }>({ sourceKey: null, tracks: EMPTY_LOCATION_TRACKS });
  const setTracks = React.useCallback(
    (sourceKey: string | null, tracks: McapLocationTracks) => {
      setState({ sourceKey, tracks });
    },
    [],
  );
  const value = useMemo(() => ({ ...state, setTracks }), [setTracks, state]);

  return (
    <McapLocationTracksContext.Provider value={value}>
      {children}
    </McapLocationTracksContext.Provider>
  );
};

export function useMcapLocationTracksContext(): McapLocationTracks {
  return useContextValue().tracks;
}

/** Returns the source key associated with the published location tracks. */
export function useMcapLocationTracksSourceKey(): string | null {
  return useContextValue().sourceKey;
}

/**
 * Bridge that fetches every location topic's full track once per source.
 * The track is tiny compared to camera/point-cloud data, and seeing the
 * whole route is the map tile's core value, so this intentionally uses the
 * same capped bulk-lane pattern as pose trajectories.
 */
export function McapLocationTracksBridge({
  client,
  locationSources,
  source,
}: {
  readonly client: McapResourceClient;
  readonly locationSources: readonly SceneSource[];
  readonly source: ByteSourceDescriptor | null;
}) {
  const { setTracks } = useContextValue();
  const sourceKey = source ? byteSourceAccessKey(source) : null;
  const tracksRef = useRef(new Map<string, McapLocationTrackState>());
  const playbackStore = useContext(PlaybackStoreContext);

  // This effect loads and publishes location tracks for the active source.
  useEffect(() => {
    tracksRef.current = new Map();
    setTracks(sourceKey, EMPTY_LOCATION_TRACKS);

    if (!sourceKey || !source || locationSources.length === 0) {
      return undefined;
    }

    const commit = (topic: string, state: McapLocationTrackState) => {
      tracksRef.current.set(topic, state);
      setTracks(sourceKey, new Map(tracksRef.current));
    };

    return startMcapBulkTopicLifecycle({
      initialDelayMs: 0,
      retryDelayMs: LOCATION_TRACK_DEFERRED_RETRY_MS,
      shouldStandDown: () => shouldDeferMcapBulkHistory(playbackStore),
      topics: locationSources.map((locationSource) => locationSource.id),
      runTopic: async (topic, control) => {
        const index = locationSources.findIndex(
          (locationSource) => locationSource.id === topic,
        );
        const locationSource = locationSources[index];
        if (!locationSource) return;
        const color = locationTrackColor(index);
        const baseState = {
          color,
          label: locationSource.label,
          pointCount: 0,
          segments: [],
          topic,
        } satisfies Omit<McapLocationTrackState, "status">;
        commit(topic, { ...baseState, status: "loading" });

        const points: McapLocationTrackPoint[] = [];
        let messageCount = 0;
        try {
          for await (const message of client.readDecodedMessages(
            {
              activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
              limit: LOCATION_TRACK_READ_LIMIT,
              source,
              topics: [topic],
            },
            { priority: "bulk" },
          )) {
            if (control.isCancelled()) return;
            messageCount += 1;
            if (control.standDown()) return;
            const visualization = message.decoded.output.visualization;
            if (visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
              continue;
            }
            points.push(
              locationPointFromVisualization(
                visualization,
                message.timelineTimeNs,
              ),
            );
          }

          const result = decimateLocationTrackSegments(
            segmentLocationTrack(points),
          );
          const truncated =
            result.truncated || messageCount >= LOCATION_TRACK_READ_LIMIT;
          if (control.isCancelled()) return;
          commit(topic, {
            ...baseState,
            pointCount: result.pointCount,
            segments: result.segments,
            status: "ready",
            ...(truncated ? { truncated: true } : {}),
          });
        } catch {
          if (control.isCancelled()) return;
          commit(topic, { ...baseState, status: "error" });
        }
      },
    });
  }, [client, locationSources, playbackStore, setTracks, source, sourceKey]);

  // This effect clears provider state when the bridge unmounts.
  useEffect(
    () => () => {
      setTracks(null, EMPTY_LOCATION_TRACKS);
    },
    [setTracks],
  );

  return null;
}

function useContextValue(): McapLocationTracksContextValue {
  const value = useContext(McapLocationTracksContext);
  if (!value) {
    throw new Error(
      "MCAP location tracks must be used inside <McapLocationTracksProvider>",
    );
  }

  return value;
}
