// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge mirrors the pose-trajectory bulk fetch path.
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import { getIsPlaying } from "@fiftyone/playback/src/lib/playback/store-access";
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
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import { MCAP_ACTIVE_TIMELINE, type McapResourceClient } from "../types";
import {
  getMcapNetworkHealth,
  shouldDeferMcapIdleWorkForStore,
} from "./mcap-network-health";
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
const LOCATION_TRACK_START_DELAY_MS = 1_500;
const LOCATION_TRACK_DEFERRED_RETRY_MS = 2_000;

const EMPTY_LOCATION_TRACKS: McapLocationTracks = new Map();

interface McapLocationTracksContextValue {
  readonly setTracks: (state: McapLocationTracks) => void;
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
  const [tracks, setTracks] = useState<McapLocationTracks>(
    EMPTY_LOCATION_TRACKS,
  );
  const value = useMemo(() => ({ setTracks, tracks }), [tracks]);

  return (
    <McapLocationTracksContext.Provider value={value}>
      {children}
    </McapLocationTracksContext.Provider>
  );
};

export function useMcapLocationTracksContext(): McapLocationTracks {
  return useContextValue().tracks;
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
  const fetchedTopicsRef = useRef(new Set<string>());
  const tracksRef = useRef(new Map<string, McapLocationTrackState>());
  const playbackStore = useContext(PlaybackStoreContext);

  useEffect(() => {
    fetchedTopicsRef.current = new Set();
    tracksRef.current = new Map();
    setTracks(EMPTY_LOCATION_TRACKS);

    if (!sourceKey || !source || locationSources.length === 0) {
      return undefined;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const commit = (topic: string, state: McapLocationTrackState) => {
      if (cancelled) {
        return;
      }
      tracksRef.current.set(topic, state);
      setTracks(new Map(tracksRef.current));
    };

    const shouldStandDown = (): boolean => {
      if (!playbackStore) {
        return false;
      }
      if (
        getIsPlaying(playbackStore) &&
        getMcapNetworkHealth(playbackStore).limited
      ) {
        return true;
      }
      return shouldDeferMcapIdleWorkForStore(playbackStore, null);
    };

    const scheduleRetry = (delayMs: number) => {
      if (cancelled || retryTimeout !== null) {
        return;
      }
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        start();
      }, delayMs);
    };

    const start = () => {
      if (cancelled) {
        return;
      }
      if (shouldStandDown()) {
        scheduleRetry(LOCATION_TRACK_DEFERRED_RETRY_MS);
        return;
      }

      locationSources.forEach((locationSource, index) => {
        const topic = locationSource.id;
        if (fetchedTopicsRef.current.has(topic)) {
          return;
        }
        fetchedTopicsRef.current.add(topic);
        const color = locationTrackColor(index);
        const baseState = {
          color,
          label: locationSource.label,
          pointCount: 0,
          segments: [],
          topic,
        } satisfies Omit<McapLocationTrackState, "status">;
        commit(topic, { ...baseState, status: "loading" });

        void (async () => {
          const points: McapLocationTrackPoint[] = [];
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
              if (cancelled) {
                return;
              }
              if (shouldStandDown()) {
                fetchedTopicsRef.current.delete(topic);
                scheduleRetry(LOCATION_TRACK_DEFERRED_RETRY_MS);
                return;
              }
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
            if (result.truncated) {
              markMcapLatencyEvent("location track downsampled", {
                points: result.pointCount,
                topic,
              });
            }
            commit(topic, {
              ...baseState,
              pointCount: result.pointCount,
              segments: result.segments,
              status: "ready",
              ...(result.truncated ? { truncated: true } : {}),
            });
          } catch {
            commit(topic, { ...baseState, status: "error" });
          }
        })();
      });
    };

    scheduleRetry(LOCATION_TRACK_START_DELAY_MS);

    return () => {
      cancelled = true;
      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
      }
    };
  }, [client, locationSources, playbackStore, setTracks, source, sourceKey]);

  useEffect(
    () => () => {
      setTracks(EMPTY_LOCATION_TRACKS);
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
