import { TileSettingsContent } from "@fiftyone/tiling";
import { Checkbox, Size, Spinner } from "@voxel51/voodo";
import React from "react";
import type { EncodedImageVisualization } from "../../../decoders";
import { ImagePanel } from "../../../visualization/panels/image";
import settingsStyles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

export interface McapCameraTileProps {
  /** MCAP topic this tile renders. Threaded in from the initial-tiles
   *  map's render closure. */
  topic: string;
}

const McapCameraTile: React.FC<McapCameraTileProps> = ({ topic }) => {
  const frame = useMcapTopicStream<EncodedImageVisualization>(topic);

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <Checkbox label="Show overlays" defaultChecked />
          <Checkbox label="Show bounding boxes" />
          <Checkbox label="Show track ids" />
        </div>
      </TileSettingsContent>
      {frame ? (
        <ImagePanel frame={frame} className={styles.panel} />
      ) : (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      )}
    </>
  );
};

export default McapCameraTile;
