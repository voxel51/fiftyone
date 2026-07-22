import {
  getHoverTime,
  getIsPlaying,
  getPlayhead,
  setHoverTime,
  subscribeHoverTime,
  subscribePlayhead,
  useIsPlaying,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useMemo } from "react";
import { SCENE_SOURCE_TYPE } from "../../../../ir";
import { useSceneInventory } from "../../../../scene-inventory/react";
import {
  MapRenderer,
  type MapRendererPlayback,
} from "../rendering/MapRenderer";
import type { LocationTrackState } from "../tracks/location-track";
import { useDataStream } from "../../playback/data-stream-context";
import type { EpisodeTileProps } from "../../tiles/tile-types";
import { useRegisterTileSettings } from "../../tiles/tile-settings-context";
import {
  useLocationTracksContext,
  useLocationTracksSourceKey,
} from "../tracks/context";
import { useMapTileSettings, useSetMapTileSettings } from "./tile-state";
import { useMapViewportScope } from "../viewport/context";
import MapTileSettings from "./MapTileSettings";

const MapTile: React.FC<EpisodeTileProps> = () => {
  const tileId = useTileId();
  const settingsRegistration = useMemo(
    () => ({ content: <MapTileSettings /> }),
    [],
  );
  useRegisterTileSettings(tileId, settingsRegistration);
  const setTileTitle = useSetTileTitle();
  const sources = useSceneInventory();
  const tracksByStream = useLocationTracksContext();
  const tracksSourceKey = useLocationTracksSourceKey();
  const settings = useMapTileSettings();
  const setSettings = useSetMapTileSettings();
  const viewportScope = useMapViewportScope();
  const dataStream = useDataStream();
  const sourceKey = dataStream?.sourceKey ?? null;
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { seek } = usePlayback();
  const isPlaying = useIsPlaying();

  const locationSources = useMemo(
    () =>
      sources.filter((source) => source.type === SCENE_SOURCE_TYPE.LOCATION),
    [sources],
  );
  const allStreams = useMemo(
    () => locationSources.map((source) => source.id),
    [locationSources],
  );
  const enabledStreams = useMemo(
    () => new Set(settings.enabledStreams ?? allStreams),
    [allStreams, settings.enabledStreams],
  );
  const visibleStreams = useMemo(
    () => allStreams.filter((stream) => enabledStreams.has(stream)),
    [allStreams, enabledStreams],
  );
  const tracks = useMemo(() => {
    if (!sourceKey || tracksSourceKey !== sourceKey) return [];
    return visibleStreams
      .map((stream) => tracksByStream.get(stream))
      .filter((track): track is LocationTrackState => Boolean(track));
  }, [sourceKey, tracksByStream, tracksSourceKey, visibleStreams]);
  const readyTracks = useMemo(
    () =>
      tracks.filter(
        (track) => track.status === "ready" && track.segments.length > 0,
      ),
    [tracks],
  );
  const locationEvidencePending =
    visibleStreams.length > 0 &&
    (!sourceKey ||
      tracksSourceKey !== sourceKey ||
      tracks.length < visibleStreams.length ||
      tracks.some((track) => track.status === "loading"));

  // This effect keeps the host tile title aligned with visible map evidence.
  useEffect(() => {
    setTileTitle(mapTileTitle(readyTracks, locationSources.length), {
      source: "auto",
    });
  }, [locationSources.length, readyTracks, setTileTitle]);

  const onSeekTimeNs = useCallback(
    (timeNs: bigint) => {
      if (timeline) seek(timeline.nsToSec(timeNs));
    },
    [seek, timeline],
  );
  const onHoverTimeNs = useCallback(
    (timeNs: bigint | null) => {
      setHoverTime(
        store,
        timeNs !== null && timeline ? timeline.nsToSec(timeNs) : null,
      );
    },
    [store, timeline],
  );
  const playback = useMemo<MapRendererPlayback>(
    () => ({
      clearHover: () => setHoverTime(store, null),
      readHoverTimeNs: () => {
        const hoverTime = getHoverTime(store);
        return hoverTime !== null && timeline
          ? timeline.secToNs(hoverTime)
          : null;
      },
      readPlayhead: () => ({
        paused: !getIsPlaying(store),
        timeNs: timeline ? timeline.secToNs(getPlayhead(store)) : null,
      }),
      subscribeHover: (listener) => subscribeHoverTime(store, listener),
      subscribePlayhead: (listener) => subscribePlayhead(store, listener),
    }),
    [store, timeline],
  );

  const loadingCount = tracks.filter(
    (track) => track.status === "loading",
  ).length;
  const errorCount = tracks.filter((track) => track.status === "error").length;

  return (
    <MapRenderer
      baseLayer={settings.baseLayer}
      enabledStreamCount={visibleStreams.length}
      errorCount={errorCount}
      followEgo={settings.followEgo}
      loadingCount={loadingCount}
      locationEvidencePending={locationEvidencePending}
      locationStreamCount={locationSources.length}
      onFollowEgoChange={(followEgo) => setSettings({ followEgo })}
      onHoverTimeNs={onHoverTimeNs}
      onSeekTimeNs={onSeekTimeNs}
      playback={playback}
      pulseActive={isPlaying}
      sourceKey={sourceKey}
      tracks={readyTracks}
      truncated={tracks.some((track) => track.truncated)}
      viewportScope={viewportScope}
    />
  );
};

function mapTileTitle(
  readyTracks: readonly LocationTrackState[],
  locationStreamCount: number,
): string {
  if (readyTracks.length === 1) return readyTracks[0].label;
  if (locationStreamCount > 1) return `Map (${locationStreamCount})`;
  return "Map";
}

export default MapTile;
