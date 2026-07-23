// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge mirrors the pose-trajectory bulk fetch path.
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EpisodeSession } from "../../../../ports";
import type { SceneSource } from "../../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  shouldDeferBulkHistory,
  startBulkStreamLifecycle,
} from "../../playback/bulk-stream-lifecycle";
import {
  decimateLocationTrackSegments,
  locationPointFromVisualization,
  locationTrackColor,
  segmentLocationTrack,
  type LocationTrackPoint,
  type LocationTracks,
  type LocationTrackState,
} from "./location-track";

const LOCATION_TRACK_READ_LIMIT = 25_000;
const LOCATION_TRACK_DEFERRED_RETRY_MS = 2_000;

const EMPTY_LOCATION_TRACKS: LocationTracks = new Map();

interface LocationTracksContextValue {
  readonly setTracks: (
    sourceKey: string | null,
    tracks: LocationTracks,
  ) => void;
  readonly sourceKey: string | null;
  readonly tracks: LocationTracks;
}

const LocationTracksContext = createContext<LocationTracksContextValue | null>(
  null,
);

/**
 * Shares full-file geographic tracks with map tiles. The provider lives
 * outside playback; the bridge inside playback performs one bulk read per
 * source file and publishes normalized route segments here.
 */
export const LocationTracksProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [state, setState] = useState<{
    readonly sourceKey: string | null;
    readonly tracks: LocationTracks;
  }>({ sourceKey: null, tracks: EMPTY_LOCATION_TRACKS });
  const setTracks = React.useCallback(
    (sourceKey: string | null, tracks: LocationTracks) => {
      setState({ sourceKey, tracks });
    },
    [],
  );
  const value = useMemo(() => ({ ...state, setTracks }), [setTracks, state]);

  return (
    <LocationTracksContext.Provider value={value}>
      {children}
    </LocationTracksContext.Provider>
  );
};

export function useLocationTracksContext(): LocationTracks {
  return useContextValue().tracks;
}

/** Returns the source key associated with the published location tracks. */
export function useLocationTracksSourceKey(): string | null {
  return useContextValue().sourceKey;
}

/**
 * Bridge that fetches every location stream's full track once per source.
 * The track is tiny compared to camera/point-cloud data, and seeing the
 * whole route is the map tile's core value, so this intentionally uses the
 * same capped bulk-lane pattern as pose trajectories.
 */
export function LocationTracksBridge({
  locationSources,
  session,
  sourceKey,
}: {
  readonly locationSources: readonly SceneSource[];
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}) {
  const { setTracks } = useContextValue();
  const tracksRef = useRef(new Map<string, LocationTrackState>());
  const playbackStore = useContext(PlaybackStoreContext);

  // This effect loads and publishes location tracks for the active source.
  useEffect(() => {
    tracksRef.current = new Map();
    setTracks(sourceKey, EMPTY_LOCATION_TRACKS);

    if (!sourceKey || !session || locationSources.length === 0) {
      return undefined;
    }

    const commit = (stream: string, state: LocationTrackState) => {
      tracksRef.current.set(stream, state);
      setTracks(sourceKey, new Map(tracksRef.current));
    };

    return startBulkStreamLifecycle({
      initialDelayMs: 0,
      retryDelayMs: LOCATION_TRACK_DEFERRED_RETRY_MS,
      shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
      streams: locationSources.map((locationSource) => locationSource.id),
      runStream: async (stream, control) => {
        const index = locationSources.findIndex(
          (locationSource) => locationSource.id === stream,
        );
        const locationSource = locationSources[index];
        if (!locationSource) return;
        const color = locationTrackColor(index);
        const baseState = {
          color,
          label: locationSource.label,
          pointCount: 0,
          segments: [],
          sourceName: locationSource.sourceName,
          stream,
        } satisfies Omit<LocationTrackState, "status">;
        commit(stream, { ...baseState, status: "loading" });

        const points: LocationTrackPoint[] = [];
        let messageCount = 0;
        try {
          for await (const batch of session.read({
            limit: LOCATION_TRACK_READ_LIMIT,
            priority: "bulk",
            streams: [stream],
            window: session.manifest.timeRange,
          })) {
            for (const frame of batch.frames) {
              if (control.isCancelled()) return;
              messageCount += 1;
              if (control.standDown()) return;
              const visualization = frame.output.visualization;
              if (visualization?.kind !== VISUALIZATION_KIND.LOCATION) continue;
              points.push(
                locationPointFromVisualization(
                  visualization,
                  frame.timestampNs,
                ),
              );
            }
          }

          const result = decimateLocationTrackSegments(
            segmentLocationTrack(points),
          );
          const truncated =
            result.truncated || messageCount >= LOCATION_TRACK_READ_LIMIT;
          if (control.isCancelled()) return;
          commit(stream, {
            ...baseState,
            pointCount: result.pointCount,
            segments: result.segments,
            status: "ready",
            ...(truncated ? { truncated: true } : {}),
          });
        } catch {
          if (control.isCancelled()) return;
          commit(stream, { ...baseState, status: "error" });
        }
      },
    });
  }, [locationSources, playbackStore, session, setTracks, sourceKey]);

  // This effect clears provider state when the bridge unmounts.
  useEffect(
    () => () => {
      setTracks(null, EMPTY_LOCATION_TRACKS);
    },
    [setTracks],
  );

  return null;
}

function useContextValue(): LocationTracksContextValue {
  const value = useContext(LocationTracksContext);
  if (!value) {
    throw new Error(
      "episode location tracks must be used inside <LocationTracksProvider>",
    );
  }

  return value;
}
