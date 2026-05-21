import { TileSettingsContent } from "@fiftyone/tiling";
import { Checkbox, Size, Spinner } from "@voxel51/voodo";
import React from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import settingsStyles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

export interface McapLidarTileProps {
  /** MCAP topic this tile renders. Threaded in from the initial-tiles
   *  map's render closure. */
  topic: string;
}

const McapLidarTile: React.FC<McapLidarTileProps> = ({ topic }) => {
  const frame = useMcapTopicStream<PointCloudVisualization>(topic);

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <Checkbox label="Color by height" defaultChecked />
          <Checkbox label="Show ground plane" />
          <Checkbox label="Show intensity overlay" />
          <Checkbox label="Cull behind sensor" defaultChecked />
        </div>
      </TileSettingsContent>
      {frame ? (
        <PointCloudPanel frame={frame} className={styles.panel} />
      ) : (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      )}
    </>
  );
};

export default McapLidarTile;
