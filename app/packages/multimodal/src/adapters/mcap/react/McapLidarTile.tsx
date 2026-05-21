import { TileSettingsContent } from "@fiftyone/tiling";
import {
  Checkbox,
  Select,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useEffect, useMemo, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import settingsStyles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapLidarTile: React.FC = () => {
  const [topic, setTopic] = useState<string | null>(null);
  const lidars = useSceneSourcesByType("lidar");

  useEffect(() => {
    if (topic !== null || lidars.length === 0) return;
    setTopic(lidars[0]?.id ?? null);
  }, [lidars, topic]);

  const frame = useMcapTopicStream<PointCloudVisualization>(topic ?? "");
  const options = useMemo(
    () => lidars.map((l) => ({ id: l.id, data: { label: l.label } })),
    [lidars]
  );

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Source
            </Text>
            <Select
              options={options}
              value={topic ?? ""}
              onChange={(v) => setTopic((v as string) || null)}
            />
          </div>
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
