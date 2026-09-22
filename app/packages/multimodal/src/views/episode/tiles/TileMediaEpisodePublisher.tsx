import { usePlayback } from "@fiftyone/playback";
import { useSetAtom } from "jotai";
import React, { useEffect, useRef } from "react";
import {
  tileMediaEpisodeAtom,
  type TileMediaEpisode,
} from "../../../extensions/tiles/media-surfaces";
import { useSceneInventory } from "../../../scene-inventory/react";
import { timelineSecondsForContentTimeNs } from "../playback/content-time-seek";
import { useDataStream } from "../playback/data-stream-context";
import { useOpenImageTile } from "./use-open-image-tile";

/**
 * Publishes the episode's media commands into
 * `extensions/tiles/media-surfaces` while the episode is mounted. The
 * playback, tiling, and inventory hooks it wraps all throw outside their
 * providers, which is why the commands travel through an atom instead of
 * being called directly by a consumer elsewhere in the tree. Mounted by
 * `PlaybackShell` inside its tiling scope.
 */
export const TileMediaEpisodePublisher: React.FC = () => {
  const { pause, seek } = usePlayback();
  const openImageTile = useOpenImageTile();
  const sources = useSceneInventory();
  const dataStream = useDataStream();
  const setEpisode = useSetAtom(tileMediaEpisodeAtom);

  // The command closures read refs so the published object survives
  // per-frame churn in its inputs.
  const latest = useRef({ openImageTile, sources, dataStream });
  useEffect(() => {
    latest.current = { openImageTile, sources, dataStream };
  });

  useEffect(() => {
    const episode: TileMediaEpisode = {
      openTileForSource: (source) => {
        const match = latest.current.sources.find(
          (s) => s.type === source.type && s.sourceName === source.name,
        );
        if (match) latest.current.openImageTile(match.id);
      },
      seekToTimeNs: (timeNs) => {
        pause();
        const index = latest.current.dataStream?.getTimelineIndex();
        if (index) seek(timelineSecondsForContentTimeNs(index, timeNs));
      },
      secondsForTimestamp: (timeNs) => {
        const index = latest.current.dataStream?.getTimelineIndex();
        return index ? timelineSecondsForContentTimeNs(index, timeNs) : null;
      },
      pause,
    };
    setEpisode(episode);
    return () => setEpisode(null);
  }, [pause, seek, setEpisode]);

  return null;
};
