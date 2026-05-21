import { useTileRegistry, useSetTileSourceFor } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import { useEffect, useRef } from "react";
import McapCameraTile from "./McapCameraTile";
import McapLidarTile from "./McapLidarTile";
import type { McapTopicSpec } from "./McapStreams";

export interface UseMcapTilesOptions {
  cameraTopics: readonly McapTopicSpec[];
  lidarTopic?: McapTopicSpec;
  /** Seed initial tile-source bindings only after the data stream is ready. */
  isReady: boolean;
}

/**
 * Registers all MCAP camera and lidar topics as tiling tiles, and seeds
 * the initial tile-source bindings once the data stream is ready.
 *
 * Completely decoupled from data fetching — only manages the tiling layer.
 */
export function useMcapTiles({
  cameraTopics,
  lidarTopic,
  isReady,
}: UseMcapTilesOptions): void {
  const { registerTile } = useTileRegistry();
  const setTileSource = useSetTileSourceFor();
  const tilesSeededRef = useRef(false);

  // Seed initial tile-source bindings once (using the `${topic}-1` key
  // convention that matches the initialTiles entries in entry.tsx).
  useEffect(() => {
    if (!isReady || tilesSeededRef.current) return;
    tilesSeededRef.current = true;
    for (const { topic } of cameraTopics) {
      setTileSource(`${topic}-1`, topic);
    }
    if (lidarTopic) {
      setTileSource(`${lidarTopic.topic}-1`, lidarTopic.topic);
    }
    // setTileSource is a stable jotai-backed setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // Register camera tiles.
  useEffect(() => {
    const cleanups = cameraTopics.map(({ topic, label }) =>
      registerTile({
        streamId: topic,
        type: "camera",
        typeLabel: "Camera",
        title: label,
        icon: IconName.GridView,
        Tile: McapCameraTile,
      })
    );
    return () => cleanups.forEach((c) => c());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerTile]);

  // Register lidar tile.
  useEffect(() => {
    if (!lidarTopic) return;
    return registerTile({
      streamId: lidarTopic.topic,
      type: "lidar",
      typeLabel: "Lidar",
      title: lidarTopic.label,
      icon: IconName.Embeddings,
      Tile: McapLidarTile,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerTile, lidarTopic?.topic]);
}
